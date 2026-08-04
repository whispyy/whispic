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
import { moveIntoOriginals } from '../ingest/store.js';
import { enqueueJob } from '../jobs/queue.js';

export const assetsRouter = Router();

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';

assetsRouter.get('/api/assets/exists', requireAuth, (req, res) => {
  const sha256 = String(req.query.sha256 ?? '');
  if (!sha256) {
    res.status(400).json({ error: 'sha256 query param is required' });
    return;
  }
  const row = db.prepare('SELECT id FROM assets WHERE sha256 = ?').get(sha256) as { id: string } | undefined;
  res.json({ exists: Boolean(row), assetId: row?.id ?? null });
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
  const bb = Busboy({ headers: req.headers, limits: { files: 1 } });
  const fields: Record<string, string> = {};
  let uploadPromise: Promise<UploadedFile> | null = null;

  bb.on('field', (name, value) => {
    fields[name] = value;
  });

  bb.on('file', (_name, stream, info) => {
    const tempPath = path.join(config.tmpDir, `${ulid()}.upload`);
    uploadPromise = hashToFile(stream, tempPath).then(({ sha256, size }) => ({
      sha256,
      size,
      tempPath,
      originalFilename: info.filename,
      mime: info.mimeType,
    }));
  });

  bb.on('close', () => {
    (async () => {
      if (!uploadPromise) {
        res.status(400).json({ error: '"file" field is required' });
        return;
      }
      const upload = await uploadPromise;
      await handleUploadedFile(upload, fields, res);
    })().catch(next);
  });

  req.pipe(bb);
});

async function handleUploadedFile(upload: UploadedFile, fields: Record<string, string>, res: Response): Promise<void> {
  const existing = db.prepare('SELECT id FROM assets WHERE sha256 = ?').get(upload.sha256) as { id: string } | undefined;
  if (existing) {
    await unlink(upload.tempPath).catch(() => {});
    res.json({ duplicate: true, assetId: existing.id });
    return;
  }

  const metadata = await extractMetadata(upload.tempPath);
  const takenAtLocal = metadata.takenAtLocal ?? fields.creationDate ?? new Date().toISOString().slice(0, 19);
  const lat = metadata.lat ?? (fields.latitude ? Number(fields.latitude) : null);
  const lon = metadata.lon ?? (fields.longitude ? Number(fields.longitude) : null);
  const type: 'photo' | 'video' = upload.mime.startsWith('video/') ? 'video' : 'photo';

  const { relPath, absPath } = await moveIntoOriginals(upload.tempPath, takenAtLocal, upload.originalFilename);

  const id = ulid();
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
    upload.mime,
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
