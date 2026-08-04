# Whispic Code Audit

Date: 2026-08-04
Scope: `server/` (whispic-server), `web/` (PWA), `ios/` (SwiftUI app).
Method: full manual review of server and web sources; manual review of iOS sources (no compile available on this machine).

Severity legend: **High** = data loss, security exposure, or user-visible broken behavior. **Medium** = incorrect behavior in edge cases or robustness gaps. **Low** = code smell / polish.

---

## Server (`server/src`)

### High

1. **Upload race → 500 + orphaned file** — `routes/assets.ts`
   Two concurrent uploads of the same content both pass the `sha256` exists-check, both move their file into `originals/`, and the second `INSERT` hits the UNIQUE(sha256) constraint. Result: unhandled 500 to the client and an orphan file left on disk (the file is moved *before* the insert). Fix direction: catch the UNIQUE violation, look up the existing row, return the dedup response, and unlink the just-moved duplicate file.

2. **Temp-file leak on ingest failure** — `routes/assets.ts` / `ingest/hash.ts`
   If `extractMetadata()` or `moveIntoOriginals()` throws after the streamed hash-to-temp-file completes, the temp file is never unlinked. Same in `ingest/hash.ts`: a stream error leaves a partial temp file behind. Repeated failures fill the tmp dir. Wrap the post-hash pipeline in try/finally that unlinks the temp path.

3. **No upload size limit** — `routes/assets.ts`
   Busboy is configured without a `limits.fileSize`. Any authenticated client (or leaked token) can fill the disk with a single request. Add a sane cap (or at least a configurable one).

4. **TOCTOU race in filename collision handling → silent overwrite** — `ingest/store.ts`
   `resolveUniquePath` loops on `existsSync`, then `rename()`s. Two concurrent uploads with the same filename on the same day can resolve the same "unique" path, and `rename` silently overwrites → permanent loss of one original. Use exclusive-create semantics (`fs.open` with `wx` + copy, or `link`+`unlink`) instead of exists-then-rename.

5. **Album add with nonexistent asset → unhandled 500** — `routes/albums.ts`
   `INSERT OR IGNORE INTO album_assets` ignores UNIQUE conflicts but **not** FK violations. Posting an unknown `assetId` throws from better-sqlite3, and since there is no Express error-handling middleware (see #7) the client gets a default HTML 500. Validate asset existence or catch `SQLITE_CONSTRAINT_FOREIGNKEY`.

6. **Search `to` filter excludes the "to" day itself** — `routes/search.ts`
   The filter builds `taken_at <= ?` with a bare `YYYY-MM-DD` value while `taken_at` values contain time components (`YYYY-MM-DDTHH:MM:SS` sorts greater than the bare date). Every asset actually taken on the `to` date is excluded. Append `T23:59:59` (or use `< date+1day`).

7. **No error-handling middleware** — `index.ts`
   Any route throw returns Express's default HTML 500 page with a stack trace (when NODE_ENV isn't production). Clients expect JSON everywhere. Add a final `(err, req, res, next)` handler returning `{ error }` JSON and logging.

### Medium

8. **`verifyPassword` timing short-circuit** — `auth/index.ts`
   The comment claims `timingSafeEqual` always runs, but `return lengthMatch && timingSafeEqual(...)` short-circuits when lengths differ — leaking password length via timing. Compare against a fixed-length HMAC/hash of both sides instead.

9. **No rate limiting on `/api/auth`** — `routes/auth.ts`
   Single shared password + no throttle/lockout = unbounded online brute-force. Even a simple in-memory counter with backoff would help; the server is single-instance so that's sufficient.

10. **Token accepted via `?token=` query param** — `auth/index.ts`
    Tokens in URLs leak into access logs, proxies, browser history, and service-worker caches (see web #4). It's needed for `<img>`/`<video>` src, but consider short-lived per-resource tokens or cookie auth for media instead.

11. **Unvalidated upload fields → 500s / NaN rows** — `routes/assets.ts`
    - `fields.latitude`/`longitude` go through `Number()` with no `isFinite` guard → `NaN` can be bound into SQLite (stored as `null` by better-sqlite3? no — it throws) or propagate.
    - `fields.creationDate` is passed to `parseDateComponents` unvalidated; a malformed value throws → 500.
    Validate at the boundary and fall back to the mtime path.

12. **Server-side fallback date uses UTC, not local** — `routes/assets.ts`
    The no-EXIF/no-hint fallback is `new Date().toISOString().slice(0, 19)` — UTC wall time. Photos uploaded at 21:00 EDT get filed under the next day. Use the server's local time (or the file mtime, which the plan says is the intended fallback).

13. **Failed jobs are never retried** — `jobs/queue.ts`
    The `attempts` column exists but nothing re-queues `failed` jobs; a transient sharp/ffmpeg failure permanently leaves an asset without a thumb until a manual `backfill-thumbs`. Either retry with a cap or document that backfill is the recovery path.

14. **EXIF orientation ignored for dimensions** — `ingest/exif.ts`
    `ImageWidth`/`ImageHeight` are stored raw; portrait photos with orientation 6/8 get swapped width/height, which breaks aspect-ratio layout math in clients. Swap when `Orientation` ∈ {5,6,7,8}.

15. **Purge deletes DB row even if file unlink failed** — `jobs/purge.ts`
    Unlink errors are swallowed, then the row is deleted → orphaned originals invisible to any rescan-with-dedup (rescan will actually *re-index* them, resurrecting "deleted" photos). Only delete the row after successful unlink (ENOENT is fine to ignore).

16. **`rescan` runs inside a single HTTP request** — `routes/admin.ts`
    A large library walk + hash of every file will exceed proxy/client timeouts. Also, no extension whitelist: `.DS_Store` and friends get indexed as `application/octet-stream` assets whose thumbnail jobs always fail. Run rescan as a job and filter by extension.

17. **LIKE wildcards not escaped in search** — `routes/search.ts`
    User `q` containing `%` or `_` behaves as wildcards. Harmless for a personal app but surprising; escape with `ESCAPE '\'`.

18. **Shutdown doesn't drain** — `index.ts`
    `shutdown()` calls `process.exit(0)` without awaiting `server.close()` or letting an in-flight job finish; a thumbnail job mid-write gets killed. Await close + queue idle (with a timeout).

### Low

19. `serveDerivative`/original `res.sendFile` error callbacks may attempt to send a response after headers were already sent — guard with `res.headersSent`.
20. `geocode/index.ts` comment says "~34k cities"; the shipped dataset is ~21k. Also nearest-city lookup is O(n) haversine per asset — fine at this scale, but noted.
21. `jobs/handlers/video.ts` `run()` accumulates unbounded stderr into a string; a pathological ffmpeg run could balloon memory.
22. `routes/trash.ts` is unpaginated (commented as intentional — acceptable, but will degrade with a large trash).
23. Cursor encoding (`routes/cursor.ts`) trusts decoded values without validating shape; a garbage cursor yields a confusing SQL result rather than a 400.

---

## Web (`web/src`)

### High

1. **Video tiles never use the server-generated posters** — `components/GalleryView.tsx` (`TileRow`), `AlbumsView.tsx`, `TrashView.tsx`
   Phase 3 added poster thumbnails for videos (`hasThumb` is true once generated), but all three views render a `▶` placeholder for *every* video instead of the thumb. The server work is effectively unused; the gallery looks broken for video-heavy days. Render the thumb (with the play badge overlaid) whenever `hasThumb`.

2. **401 is not handled globally** — `api/client.ts`
   `checkResponse` treats an expired token like any other error; the app shows scattered failures instead of clearing the token and returning to login. Detect 401 → clear stored token → route to LoginScreen.

3. **`AssetDetail.tzOffset` type mismatch** — `api/client.ts`
   Declared `number | null` but the server sends a string (`"+HH:MM"`). Any arithmetic on it is silently wrong; TS can't catch it because the payload is cast. Fix the type (string) and any consumers.

### Medium

4. **Auth token embedded in cached media URLs** — `api/client.ts` + `vite.config.ts` Workbox config
   Thumb/preview/original URLs carry `?token=`; Workbox CacheFirst caches them with the token in the cache key. Consequences: (a) tokens persist in Cache Storage after sign-out, (b) every token refresh invalidates the entire media cache (all keys change). Use `ignoreURLParametersMatching: [/^token$/]` for cache matching, and clear caches on sign-out.

5. **Token in `localStorage`** — `api/client.ts`
   XSS-stealable. Low risk for a personal PWA, but worth noting; HttpOnly cookie would be stronger.

6. **`sha256OfFile` reads whole file into memory** — `api/client.ts`
   `file.arrayBuffer()` on a multi-GB video will spike memory / crash mobile Safari. Hash in chunks via `crypto.subtle` streaming isn't available, but incremental hashing libs or slicing+WebCrypto-per-upload-decision are options; at minimum guard by file size.

7. **Stale favorite state in Lightbox** — `components/Lightbox.tsx`
   Local favorite state is keyed on `file.favorite` from the `files` array snapshot passed in; after toggling and navigating next/prev and back, the star can show the pre-toggle value if the parent list wasn't refreshed. Lift favorite state or sync mutations into the source list.

8. **Albums/Trash render `<img>` without `hasThumb` check** — `AlbumsView.tsx`, `TrashView.tsx`
   Assets whose thumbnail job is pending/failed show broken-image icons; GalleryView handles this case with a placeholder — do the same here.

9. **No keyboard navigation in AlbumsView's lightbox** — `AlbumsView.tsx`
   Esc/arrow handling lives in GalleryView only; opening the lightbox from an album gives mouse-only navigation. Move key handling into `Lightbox` itself.

10. **Silent `catch {}` on all mutations** — `Lightbox.tsx`, others
    Favorite/trash/add-to-album failures are swallowed with no toast or state rollback; the UI can show success (e.g. star filled) for an operation that failed.

### Low

11. `GalleryView.tsx` `groupAssets` is recomputed on every render (unmemoized) — cheap now, measurable with thousands of assets; wrap in `useMemo`.
12. AlbumPicker in `Lightbox.tsx` doesn't indicate which albums already contain the asset (server tolerates re-add, but UX is confusing).
13. `SettingsView.tsx` writes `setServerURL` on blur *and* on submit — harmless duplication; also no URL validation (a typo'd URL just breaks all requests with generic errors).

---

## iOS (`ios/whispic`)

### High

1. **Search pagination silently reverts to the unfiltered timeline** — `Services/GalleryService.swift:33-45`
   After `search(query:)`, `loadMore()` still calls `APIClient.fetchTimeline(cursor:)`. Scrolling past the first page of search results appends *unfiltered timeline* items into the "search results". The service needs a mode (timeline vs search+query) and `loadMore` must call the matching endpoint — or search should clear `nextCursor` if the search API's cursor isn't wired.

2. **Whole asset loaded into memory for upload** — `Services/APIClient.swift` (`uploadAsset`), `Services/BackupService.swift:36-45`, `PhotoLibraryService.fetchOriginalData`
   The pipeline is: accumulate full `PHAssetResource` data into `Data`, hash it, then build the *entire multipart body* as another `Data`. A 4K video of several GB means ~2× its size resident → jetsam kill mid-backup. Stream to a temp file (`PHAssetResourceManager.writeData(for:toFile:)`), hash the file incrementally, and use `URLSession.uploadTask(fromFile:)`.

### Medium

3. **`isoLocal` date formatter has no explicit time zone semantics** — `BackupService.swift:98-103`
   `DateFormatter` with no `timeZone` set formats `asset.creationDate` (a UTC instant) in the *device's current* zone — not the zone where the photo was taken. A photo taken in Tokyo, backed up in Montreal, gets a Montreal wall-clock `creationDate` hint. This only matters when EXIF is missing (hint is a fallback), but it's the exact class of date bug this migration was meant to eliminate. (`PHAsset` doesn't expose the capture zone directly; best-effort would be deriving it from `asset.location`.)

4. **Backup failure UX: one error message, no retry queue** — `BackupService.swift:56-61`
   A failed item increments `failed` and overwrites `lastError`; there's no record of *which* assets failed and no retry short of a full re-run (which re-scans, so acceptable, but the user can't see what failed).

5. **`try!` on DB open** — `BackupStore.swift:28-29`
   `DatabasePool(path:)` or `migrate()` failure (disk full, corrupted db) crashes the app at launch. Recoverable by deleting the file and re-creating (the store is just a dedup cache — the server has the truth).

6. **`fetchAllAlbums()` counts every album eagerly** — `PhotoLibraryService.swift:29,44`
   `PHAsset.fetchAssets(in:).count` per album on the main flow is slow for libraries with many albums; done twice per backup (once in the selection UI, once in `startBackup`).

7. **`URLCache.shared` unbounded default for authenticated images** — `GalleryView.swift` (`AuthenticatedAsyncImage`)
   Manual `storeCachedResponse` into `URLCache.shared` without ever configuring its capacity relies on iOS defaults; also cached entries keyed by request include the Authorization header context — after password rotation old entries are still served (stale-but-valid content, so mostly fine, but worth knowing).

8. **Silent `catch { }` across album/trash mutations** — `GalleryView.swift` (AlbumPickerView), `AlbumsView.swift`, `TrashView.swift`
   Create/add/rename/delete/restore failures are ignored with no user feedback — same smell as web #10.

### Low

9. `AlbumDetailView.onFavoriteChange` manually reconstructs `AssetSummary` field-by-field (duplicated from `GalleryService.setFavorite`) — `AssetSummary` could use a `with(favorite:)` helper or be made a mutable struct.
10. `ThumbnailView` hard-codes 100×100 while the grid uses `.adaptive(minimum: 100)` — on wide cells the image doesn't fill the tile.
11. `BackupService.startBackup` builds the full queue (all PHAssets across albums) in memory before starting — fine for tens of thousands, noted for very large libraries.
12. pbxproj is hand-written (documented in memory) — every new Swift file requires manual registration; easy to forget and get a linker-invisible file. Consider migrating to XcodeGen/Tuist eventually.

---

## Cross-cutting observations

- **Dedup + trash interaction**: an asset in trash still occupies its sha256 row; re-uploading the same photo returns the trashed asset's id (`exists?sha256=`), and the iOS client marks it "backed up" while it's invisible in the timeline and will be purged in 30 days — after which the client-side BackupStore still says it's backed up and will never re-upload it. This is the most subtle data-loss path in the system: **purge should also consider that clients believe the content is safe**. Options: `exists` endpoint restores trashed assets, or excludes trashed assets (forcing re-upload → undeletes via the UNIQUE-conflict path once #1 server fix lands).
- **Error contract**: server has no unified JSON error shape (and no error middleware); web and iOS both compensate with silent catches. Fixing server #7 + surfacing errors in both clients (web #10, iOS #8) is one coherent workstream.
- **Video posters**: server does the work (Phase 3), iOS uses it, web ignores it (web #1) — the highest-value/lowest-effort fix in this list.

## Suggested priority order

1. Server #1/#2/#4 (upload races, temp leaks, overwrite) — data integrity.
2. Cross-cutting trash/dedup interaction — data loss path.
3. Server #6 (search `to` bug) + iOS #1 (search pagination) — user-visible wrong results.
4. Web #1 (video posters) + Web #2 (401 handling) — quick wins.
5. Server #7/#5 + error surfacing in clients.
6. Everything else opportunistically.
