import { unlink } from 'node:fs/promises';
import path from 'node:path';
import Busboy from 'busboy';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { ulid } from 'ulid';
import { requireAuth } from '../auth/index.js';
import { config } from '../config/index.js';
import { db } from '../db/index.js';
import { toAssetDetail } from '../db/mappers.js';
import type { AssetRow } from '../db/types.js';
import { extractMetadata } from '../ingest/exif.js';
import { hashToFile } from '../ingest/hash.js';
import { resolveMime, typeForMime } from '../ingest/mime.js';
import { moveIntoOriginals } from '../ingest/store.js';
import { enqueueJob } from '../jobs/queue.js';

export const assetsRouter = Router();

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';

// Trashed content deliberately reports `exists: false`. Answering `true` would
// make the client record the content as safely backed up, and the purge job
// would then hard-delete it 30 days later with the client never re-uploading —
// silently losing a photo that is still on the device. Re-uploading restores
// the trashed asset instead (see handleUploadedFile).
assetsRouter.get('/api/assets/exists', requireAuth, (req, res) => {
  const sha256 = String(req.query.sha256 ?? '');
  if (!sha256) {
    res.status(400).json({ error: 'sha256 query param is required' });
    return;
  }
  const row = db.prepare('SELECT id, deleted_at FROM assets WHERE sha256 = ?').get(sha256) as
    | Pick<AssetRow, 'id' | 'deleted_at'>
    | undefined;
  const trashed = Boolean(row?.deleted_at);
  res.json({
    exists: Boolean(row) && !trashed,
    trashed,
    assetId: trashed ? null : (row?.id ?? null),
  });
});

assetsRouter.get('/api/assets/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as
    | AssetRow
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(toAssetDetail(row));
});

assetsRouter.post('/api/assets/:id/favorite', requireAuth, (req, res) => {
  const row = db.prepare('SELECT favorite FROM assets WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as
    | Pick<AssetRow, 'favorite'>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const favorite = row.favorite ? 0 : 1;
  db.prepare('UPDATE assets SET favorite = ? WHERE id = ?').run(favorite, req.params.id);
  res.json({ favorite: Boolean(favorite) });
});

// Soft delete: moves the asset to trash (deleted_at set). Files stay on disk
// until the periodic purge job hard-deletes anything trashed >30 days.
assetsRouter.delete('/api/assets/:id', requireAuth, (req, res) => {
  const result = db
    .prepare("UPDATE assets SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(new Date().toISOString(), req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(204).end();
});

assetsRouter.post('/api/assets/:id/restore', requireAuth, (req, res) => {
  const result = db
    .prepare('UPDATE assets SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL')
    .run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(204).end();
});

assetsRouter.get('/api/assets/:id/thumb', requireAuth, (req, res) => {
  serveDerivative(req, res, config.thumbDir, 'thumb');
});

assetsRouter.get('/api/assets/:id/preview', requireAuth, (req, res) => {
  serveDerivative(req, res, config.previewDir, 'preview');
});

// Note: no `deleted_at IS NULL` filter here — trashed assets still need to show
// a thumbnail in the trash view so the user can tell what they're restoring/purging.
function serveDerivative(req: Request, res: Response, dir: string, kind: string): void {
  const row = db
    .prepare('SELECT id, thumb_status FROM assets WHERE id = ?')
    .get(req.params.id) as Pick<AssetRow, 'id' | 'thumb_status'> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (row.thumb_status !== 'done') {
    res.status(404).json({ error: `${kind} not ready` });
    return;
  }
  res.set('Cache-Control', CACHE_IMMUTABLE);
  res.sendFile(path.join(dir, `${row.id}.webp`), (err) => {
    if (err) res.status(404).json({ error: `${kind} file missing` });
  });
}

// Range requests (video seeking) are handled for free by Express's res.sendFile
// (backed by the `send` package), so no extra work is needed here for that.
assetsRouter.get('/api/assets/:id/original', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as
    | AssetRow
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.set('Cache-Control', CACHE_IMMUTABLE);
  if (row.mime) res.type(row.mime);
  res.sendFile(path.join(config.photosRoot, row.rel_path), (err) => {
    if (err) res.status(404).json({ error: 'File missing' });
  });
});

interface UploadedFile {
  sha256: string;
  size: number;
  tempPath: string;
  originalFilename: string;
  mime: string;
}

assetsRouter.post('/api/assets', requireAuth, (req, res, next) => {
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: config.maxUploadBytes } });
  const fields: Record<string, string> = {};
  let uploadPromise: Promise<UploadedFile> | null = null;
  let tempPath: string | null = null;
  let tooLarge = false;
  let settled = false;

  bb.on('field', (name, value) => {
    fields[name] = value;
  });

  bb.on('file', (_name, stream, info) => {
    tempPath = path.join(config.tmpDir, `${ulid()}.upload`);
    const dest = tempPath;
    // Busboy signals `limit` and then silently stops emitting data, so without
    // this the truncated file would be stored as if it were complete. We let it
    // drain the rest of the request (bounded on disk by the limit itself) so the
    // 413 is delivered after the client finishes sending, instead of mid-body
    // where the client can't read it.
    stream.on('limit', () => {
      tooLarge = true;
    });
    uploadPromise = hashToFile(stream, dest).then(({ sha256, size }) => ({
      sha256,
      size,
      tempPath: dest,
      originalFilename: info.filename,
      mime: info.mimeType,
    }));
    // The promise is only awaited on `close`; without a handler attached now, a
    // rejection in between (e.g. the limit abort above) would be reported as an
    // unhandled rejection and take the process down.
    uploadPromise.catch(() => {});
  });

  // A truncated or malformed multipart body makes Busboy emit `error`. With no
  // listener that is an unhandled 'error' event, which crashes the server.
  bb.on('error', (err: unknown) => {
    req.unpipe(bb);
    if (tempPath) void unlink(tempPath).catch(() => {});
    if (settled) return;
    settled = true;
    res.status(400).json({ error: `Malformed upload: ${(err as Error).message}` });
  });

  bb.on('close', () => {
    if (settled) return;
    settled = true;
    (async () => {
      if (!uploadPromise) {
        res.status(400).json({ error: '"file" field is required' });
        return;
      }
      const upload = await uploadPromise;
      // Everything past this point owns the temp file and must not leak it.
      try {
        if (tooLarge) {
          res.status(413).json({ error: `File exceeds the ${config.maxUploadBytes} byte upload limit` });
          return;
        }
        await handleUploadedFile(upload, fields, res);
      } finally {
        await unlink(upload.tempPath).catch(() => {});
      }
    })().catch(next);
  });

  req.pipe(bb);
});

function parseCoordinate(raw: string | undefined, max: number): number | null {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= max ? value : null;
}

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

/** Local wall-clock time, matching the `YYYY-MM-DDTHH:MM:SS` shape stored in `taken_at`. */
function nowLocalIso(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Resolves an upload whose content already exists. A trashed match is restored:
 * the client is offering this content again, so it belongs in the library rather
 * than sitting in the trash waiting to be purged out from under the device that
 * still holds it.
 */
function resolveExisting(sha256: string, res: Response): boolean {
  const existing = db.prepare('SELECT id, deleted_at FROM assets WHERE sha256 = ?').get(sha256) as
    | Pick<AssetRow, 'id' | 'deleted_at'>
    | undefined;
  if (!existing) return false;
  if (existing.deleted_at) {
    db.prepare('UPDATE assets SET deleted_at = NULL WHERE id = ?').run(existing.id);
    res.json({ restored: true, assetId: existing.id });
    return true;
  }
  res.json({ duplicate: true, assetId: existing.id });
  return true;
}

async function handleUploadedFile(upload: UploadedFile, fields: Record<string, string>, res: Response): Promise<void> {
  if (resolveExisting(upload.sha256, res)) return;

  const metadata = await extractMetadata(upload.tempPath);
  const clientHint = LOCAL_DATETIME_RE.test(fields.creationDate ?? '') ? fields.creationDate : undefined;
  const takenAtLocal = metadata.takenAtLocal ?? clientHint ?? nowLocalIso();
  const lat = metadata.lat ?? parseCoordinate(fields.latitude, 90);
  const lon = metadata.lon ?? parseCoordinate(fields.longitude, 180);
  const mime = resolveMime(upload.mime, upload.originalFilename);
  const type = typeForMime(mime);

  const { relPath, absPath } = await moveIntoOriginals(upload.tempPath, takenAtLocal, upload.originalFilename);

  const id = ulid();
  try {
    db.prepare(
      `INSERT INTO assets (
        id, sha256, rel_path, filename, size, mime, type,
        taken_at, taken_at_utc, tz_offset, width, height, duration_s,
        camera_make, camera_model, lat, lon, favorite, thumb_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(
      id,
      upload.sha256,
      relPath,
      path.basename(absPath),
      upload.size,
      mime,
      type,
      takenAtLocal,
      metadata.takenAtUtc,
      metadata.tzOffset,
      metadata.width,
      metadata.height,
      metadata.durationS,
      metadata.cameraMake,
      metadata.cameraModel,
      lat,
      lon,
      fields.favorite === 'true' ? 1 : 0,
      new Date().toISOString(),
    );
  } catch (err) {
    // Two concurrent uploads of the same content both pass the exists-check
    // above; the loser lands here. Drop the redundant copy we just placed and
    // report the winner's id, same as the fast dedup path.
    if (isUniqueViolation(err)) {
      await unlink(absPath).catch(() => {});
      if (resolveExisting(upload.sha256, res)) return;
    }
    throw err;
  }

  enqueueJob(type === 'photo' ? 'thumbnail' : 'video', id);
  if (lat != null && lon != null) {
    enqueueJob('geocode', id);
  }

  res.status(201).json({
    id,
    relPath,
    takenAt: takenAtLocal,
    type,
    thumbStatus: 'pending',
  });
}
