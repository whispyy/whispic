# Whispic Evolution Plan

Goal: a personal Google-Photos-like system — iOS backup + smooth gallery (iOS & web PWA) —
backed by a **dedicated server** instead of piggybacking on `local-link-downloader`.

Decisions taken:
- **New dedicated `whispic-server`** (Node/TS), living in this repo under `server/`.
- **Full scope**: correct EXIF dates + timeline, solid thumbnails (incl. video), location/map, search & albums.
- **Fresh start**: existing HDD photos are ignored; everything re-uploads from the phone through the new pipeline.

---

## 1. Why the current design hits a wall

| Problem | Root cause |
|---|---|
| Date = folder path (`YYYY/MM/DD` parsed client-side) | No server-side metadata; `PHAsset.creationDate` is trusted once and frozen into the path |
| Gallery loads the entire tree on every refresh | `GET /api/browse/photos?recursive=true` walks the filesystem, no index, no pagination |
| Thumbnails: images only, single size, upload-time only, silent failure | `sharp` best-effort in link-downloader; no video posters, no backfill, no HEIC guarantee |
| Dedup only on one device | GRDB manifest keyed by `PHAsset.localIdentifier`; server is stateless, web uploads / reinstall / second device duplicate files |
| No location, camera, search, albums | No metadata extraction, no database |
| Photo logic entangled in a 2,300-line `app.ts` built for torrents/yt-dlp | Server reuse was expedient, not designed |

**Core fix: the server owns a metadata index (SQLite) fed by an ingest pipeline.**
The filesystem stays human-browsable (`originals/YYYY/MM/DD/`), and the index is always
rebuildable by rescanning disk — the DB is a cache of truth, the files are the truth.

---

## 2. Target architecture

```
whispic/
├── ios/        SwiftUI app (backup + gallery)          — existing, adapted
├── web/        React PWA (gallery + upload + map)      — existing, adapted
└── server/     whispic-server (NEW)                    — Node 22 + TS + Express 5
```

### Storage layout (on the HDD)

```
PHOTOS_ROOT/
├── originals/YYYY/MM/DD/IMG_0042.heic     ← immutable originals, tree from taken_at
├── derived/
│   ├── thumb/{assetId}.webp               ← ~360px grid thumbnail
│   ├── preview/{assetId}.webp             ← ~1600px lightbox preview
│   └── poster/{assetId}.webp              ← video poster frames
└── db/whispic.sqlite                      ← index (regenerable via rescan)
```

- Originals are never modified; `derived/` and the DB can be deleted and rebuilt.
- Filename collision within a day → suffix `-1`, `-2`.

### Server stack

| Concern | Choice | Note |
|---|---|---|
| Runtime/API | Node 22, TypeScript, Express 5 | consistent with existing skills/code |
| DB | `better-sqlite3` | single-user, sync, fast, one file on the HDD |
| EXIF/metadata | `exiftool-vendored` | the only tool that reliably reads HEIC + QuickTime/MOV dates, GPS, offsets |
| Image thumbs | `sharp` against **system libvips** (Debian base image) | prebuilt sharp lacks HEIC decode; Debian libvips includes libheif |
| Video posters | `ffmpeg` (spawned) | poster frame at ~1s + duration probe |
| Hashing | streaming SHA-256 | content-addressed dedup |
| Reverse geocoding | `local-reverse-geocoder` (offline GeoNames) | no external API, city-level names are enough |
| Auth | same HMAC token scheme as today (`APP_PASSWORD`, `{expiry}.{sig}` Bearer) | port `server/auth.ts` logic |
| Jobs | in-process queue backed by a SQLite `jobs` table | thumbs/geocode run async after upload; survives restart |

Fallback if HEIC decoding proves painful in the container: the iOS app attaches a
client-generated thumbnail (`PHImageManager` output) with the upload. Keep the upload API
ready for an optional `thumb` part, but implement server-side generation first.

### Database schema (v1)

```sql
assets(
  id TEXT PK,                 -- ulid
  sha256 TEXT UNIQUE NOT NULL,
  rel_path TEXT NOT NULL,     -- originals/2026/07/14/IMG_0042.heic
  filename TEXT, size INT, mime TEXT,
  type TEXT,                  -- photo | video
  taken_at TEXT NOT NULL,     -- ISO8601 local time of capture
  taken_at_utc TEXT, tz_offset TEXT,
  width INT, height INT, duration_s REAL,
  camera_make TEXT, camera_model TEXT,
  lat REAL, lon REAL,
  place_city TEXT, place_country TEXT,
  favorite INT DEFAULT 0,
  thumb_status TEXT DEFAULT 'pending',   -- pending|done|failed
  created_at TEXT, deleted_at TEXT       -- soft delete (trash)
)
-- indexes: taken_at DESC, (lat,lon), place_city, camera_model, type
albums(id, name, cover_asset_id, created_at)
album_assets(album_id, asset_id, PK(album_id, asset_id))
jobs(id, kind, asset_id, status, attempts, created_at)
```

### Ingest pipeline — `POST /api/assets`

1. Stream multipart upload to temp file, computing SHA-256 on the fly.
2. Hash already in DB → respond `200 {duplicate: true, assetId}` (cross-device dedup for free).
3. `exiftool` extraction: `DateTimeOriginal` + `OffsetTimeOriginal` (or QuickTime `CreationDate` for video), GPS, dimensions, camera. Date fallback chain: **EXIF → client hint (`creationDate` form field) → file mtime**.
4. Move to `originals/YYYY/MM/DD/` (from `taken_at`), insert DB row.
5. Enqueue async jobs: thumbnail + preview (or poster+probe for video), reverse geocode if GPS.
6. Respond immediately with the asset record; thumbs appear when ready (`thumb_status`).

Client hints sent by iOS (cheap insurance, EXIF wins when present): `creationDate`,
`latitude`/`longitude` (PHAsset has location even when some exports lose it), `favorite`.

### API surface (v1)

```
POST   /api/auth                          password → bearer token (as today)
POST   /api/assets                        multipart upload (+ hints)
GET    /api/assets/exists?sha256=...      pre-upload dedup check (skip upload entirely)
GET    /api/timeline?cursor&limit         paginated, taken_at DESC, day-grouped
GET    /api/timeline/buckets              {month|day → count} for scrubber/jump-to-date
GET    /api/assets/:id                    full metadata
GET    /api/assets/:id/thumb              360px webp
GET    /api/assets/:id/preview            1600px webp / video poster
GET    /api/assets/:id/original           original file (range support for video)
GET    /api/search?q&type&camera&place&favorite&from&to
GET    /api/map/clusters?bbox&zoom        clustered points for map view
POST   /api/assets/:id/favorite           toggle
DELETE /api/assets/:id                    → trash (soft delete); purge job after 30 days
CRUD   /api/albums, /api/albums/:id/assets
POST   /api/admin/rescan                  rebuild index from originals/ tree
POST   /api/admin/backfill-thumbs         regenerate missing/failed derived files
```

`rescan` is the resilience guarantee: DB or `derived/` lost → full rebuild from disk
(EXIF re-extracted, hashes recomputed, thumbs regenerated).

---

## 3. Client changes

### iOS (`ios/`)

- **APIClient**: new endpoints; compute SHA-256 of resource data, call `exists` before upload; send hint fields.
- **BackupStore**: schema v2 — add `sha256`, `serverAssetId`; fresh-start = new DB file (drop v1 table).
- **BackupService**: unchanged flow, but skip-by-hash when server already has the file; drop `subpath` computation (server decides placement from EXIF).
- **GalleryService/GalleryView**: switch from recursive-browse+path-parsing to `timeline` pagination (infinite scroll) with server-provided dates; thumb/preview URLs by asset id. `AuthenticatedAsyncImage` + URLCache stay as-is.
- Later: detail view shows metadata (place, camera), favorite toggle, search.

### Web (`web/`)

- **api/client.ts + useGallery**: timeline pagination + buckets; asset-id thumb URLs (virtualizer already handles the rest).
- **UploadView**: hash via Web Crypto → `exists` → upload with hints (file `lastModified` as date hint).
- **Workbox**: cache `/api/assets/*/thumb|preview` CacheFirst (keeps offline browsing), timeline NetworkFirst.
- New (later phases): map view (`maplibre-gl` + clusters endpoint), search bar, albums, favorites, trash.

---

## 4. Deployment (home-automation)

- New Ansible role `whispic` + quadlet `whispic.container` (mirrors linkdownloader role):
  - Volume: `{{ whispic_photos_root }}:/photos:Z` (e.g. `/media/srv-admin/TOSHIBA EXT/WhispicPhotos` — new empty dir, fresh start)
  - Env: `APP_PASSWORD`, `PHOTOS_ROOT=/photos`, `SESSION_TTL_HOURS`
  - Image: Debian-slim base with `libvips`, `ffmpeg`, exiftool vendored by npm; serves built `web/` as static frontend
  - Port + proxy network entry like linkdownloader
- **Cutover cleanup** (after whispic runs): revert the 3 photo edits in `local-link-downloader/server/app.ts` and the `photos` volume/`DOWNLOAD_FOLDERS` additions in the linkdownloader role; old `Photos/` dir on HDD can be archived/deleted once re-upload is verified.

---

## 5. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Scaffold** | `server/` project, auth, config, SQLite bootstrap, health endpoint, Dockerfile | container boots, auth works |
| **1. Ingest** | upload + hash dedup + exiftool + storage layout + image thumbs/previews + jobs queue | uploading a HEIC/JPEG yields correct `taken_at`, files on disk, thumbs generated |
| **2. Timeline** | timeline + buckets API; iOS & web galleries switched over; iOS backup uses new endpoint + fresh manifest | full re-upload from phone; smooth paginated browsing on both clients |
| **3. Video & robustness** | ffmpeg posters, duration, range streaming, rescan + backfill-thumbs admin jobs | videos show posters and play; deleting DB + rescan restores everything |
| **4. Location** | reverse geocode job, place fields, map clusters endpoint, web map view, place in detail view | photos browsable on a map, places searchable |
| **5. Search & albums** | search endpoint + UI, favorites, manual albums, trash with purge | filter by date/type/camera/place; albums usable on web + iOS |
| **6. Deploy & cutover** | Ansible role, proxy entry, full phone re-upload, linkdownloader photo-code removal | whispic self-contained in prod; linkdownloader back to its original job |

Phase order is dependency-driven; each phase ships something usable end-to-end.

## 6. Risks & mitigations

- **HEIC decode in container**: use Debian libvips; fallback = iOS-supplied thumbnail part (API reserves the field).
- **Timezone correctness**: store local `taken_at` + offset; group/display by local capture time (what Google Photos does). Videos often lack offset → fall back to client hint.
- **Full re-upload volume**: `exists`-by-hash makes it resumable and idempotent; backup already batches and survives restarts via manifest.
- **SQLite on external HDD**: WAL mode + single writer is fine for one user; rescan is the disaster-recovery path.
- **Live Photos**: out of scope v1 — the photo part uploads normally; paired video resource deferred (schema can add `paired_asset_id` later).
