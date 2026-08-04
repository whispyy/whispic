import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { db } from '../db/index.js';
import type { AssetRow } from '../db/types.js';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, per PLAN.md

/** Hard-deletes any asset that's been in trash longer than the retention window. */
export async function purgeTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
  const rows = db
    .prepare('SELECT * FROM assets WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .all(cutoff) as AssetRow[];

  for (const row of rows) {
    await unlink(path.join(config.photosRoot, row.rel_path)).catch(() => {});
    await unlink(path.join(config.thumbDir, `${row.id}.webp`)).catch(() => {});
    await unlink(path.join(config.previewDir, `${row.id}.webp`)).catch(() => {});
    // FK cascades (jobs, album_assets) handle the rest.
    db.prepare('DELETE FROM assets WHERE id = ?').run(row.id);
  }

  if (rows.length > 0) {
    console.log(`Purged ${rows.length} trashed asset(s) older than 30 days`);
  }
}

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function startPurgeWorker(): void {
  void purgeTrash();
  setInterval(() => void purgeTrash(), PURGE_INTERVAL_MS);
}
