import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ulid } from 'ulid';
import { requireAuth } from '../auth/index.js';
import { config } from '../config/index.js';
import { db } from '../db/index.js';
import type { AssetRow } from '../db/types.js';
import { extractMetadata } from '../ingest/exif.js';
import { sha256File } from '../ingest/hash.js';
import { mimeForFilename, typeForMime } from '../ingest/mime.js';
import { enqueueJob } from '../jobs/queue.js';

export const adminRouter = Router();

function isoLocalFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parentPath = (entry as unknown as { parentPath?: string; path?: string }).parentPath ?? entry.path ?? dir;
    files.push(path.join(parentPath, entry.name));
  }
  return files;
}

/**
 * Rebuilds the index from disk: walks `originals/`, and for any file whose
 * content hash isn't already known, re-extracts metadata and inserts a fresh
 * row + derivative job. This is the disaster-recovery path if the DB or
 * `derived/` directory is lost — files on disk are the source of truth.
 */
adminRouter.post('/api/admin/rescan', requireAuth, (req, res, next) => {
  (async () => {
    const files = await walkFiles(config.originalsDir);
    let scanned = 0;
    let inserted = 0;
    let skipped = 0;

    for (const filePath of files) {
      scanned += 1;
      const sha256 = await sha256File(filePath);
      const existing = db.prepare('SELECT id FROM assets WHERE sha256 = ?').get(sha256) as { id: string } | undefined;
      if (existing) {
        skipped += 1;
        continue;
      }

      const stats = await stat(filePath);
      const metadata = await extractMetadata(filePath);
      const mime = mimeForFilename(filePath);
      const type = typeForMime(mime);
      const takenAtLocal = metadata.takenAtLocal ?? isoLocalFromDate(stats.mtime);
      const relPath = path.relative(config.photosRoot, filePath);

      const id = ulid();
      db.prepare(
        `INSERT INTO assets (
          id, sha256, rel_path, filename, size, mime, type,
          taken_at, taken_at_utc, tz_offset, width, height, duration_s,
          camera_make, camera_model, lat, lon, favorite, thumb_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?)`,
      ).run(
        id,
        sha256,
        relPath,
        path.basename(filePath),
        stats.size,
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
        metadata.lat,
        metadata.lon,
        new Date().toISOString(),
      );

      enqueueJob(type === 'photo' ? 'thumbnail' : 'video', id);
      if (metadata.lat != null && metadata.lon != null) {
        enqueueJob('geocode', id);
      }
      inserted += 1;
    }

    res.json({ scanned, inserted, skipped });
  })().catch(next);
});

/** Re-enqueues the derivative job for any asset whose thumb/preview isn't done. */
adminRouter.post('/api/admin/backfill-thumbs', requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT id, type FROM assets WHERE thumb_status != 'done' AND deleted_at IS NULL")
    .all() as Pick<AssetRow, 'id' | 'type'>[];

  for (const row of rows) {
    enqueueJob(row.type === 'photo' ? 'thumbnail' : 'video', row.id);
  }

  res.json({ enqueued: rows.length });
});
