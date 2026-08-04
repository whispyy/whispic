import { Router } from 'express';
import { requireAuth } from '../auth/index.js';
import { db } from '../db/index.js';
import { toAssetSummary } from '../db/mappers.js';
import type { AssetRow } from '../db/types.js';
import { encodeCursor, decodeCursor } from './cursor.js';

export const timelineRouter = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

// Paginated, taken_at-DESC listing. Cursor is an opaque (taken_at, id) pair so
// pagination stays stable even when many assets share the same taken_at.
timelineRouter.get('/api/timeline', requireAuth, (req, res) => {
  const parsedLimit = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT));
  const cursor = typeof req.query.cursor === 'string' ? decodeCursor(req.query.cursor) : null;

  const rows = cursor
    ? (db
        .prepare(
          `SELECT * FROM assets
           WHERE deleted_at IS NULL
             AND (taken_at < ? OR (taken_at = ? AND id < ?))
           ORDER BY taken_at DESC, id DESC
           LIMIT ?`,
        )
        .all(cursor.takenAt, cursor.takenAt, cursor.id, limit) as AssetRow[])
    : (db
        .prepare('SELECT * FROM assets WHERE deleted_at IS NULL ORDER BY taken_at DESC, id DESC LIMIT ?')
        .all(limit) as AssetRow[]);

  const last = rows[rows.length - 1];
  const nextCursor = rows.length === limit && last ? encodeCursor(last.taken_at, last.id) : null;

  res.json({ items: rows.map(toAssetSummary), nextCursor });
});

// Per-day/month asset counts, for a future jump-to-date scrubber.
timelineRouter.get('/api/timeline/buckets', requireAuth, (req, res) => {
  const granularity = req.query.granularity === 'month' ? 'month' : 'day';
  const substrLen = granularity === 'month' ? 7 : 10; // "YYYY-MM" vs "YYYY-MM-DD"

  const rows = db
    .prepare(
      `SELECT substr(taken_at, 1, ?) as bucket, COUNT(*) as count
       FROM assets
       WHERE deleted_at IS NULL
       GROUP BY bucket
       ORDER BY bucket DESC`,
    )
    .all(substrLen) as Array<{ bucket: string; count: number }>;

  res.json({ granularity, buckets: rows });
});
