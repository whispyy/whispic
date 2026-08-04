import { Router } from 'express';
import { requireAuth } from '../auth/index.js';
import { db } from '../db/index.js';
import { toAssetSummary } from '../db/mappers.js';
import type { AssetRow } from '../db/types.js';
import { encodeCursor, decodeCursor } from './cursor.js';

export const searchRouter = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

// Filtered, paginated listing — same taken_at-DESC cursor shape as /api/timeline
// so the web/iOS clients can reuse their existing infinite-scroll logic.
searchRouter.get('/api/search', requireAuth, (req, res) => {
  const parsedLimit = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT));
  const cursor = typeof req.query.cursor === 'string' ? decodeCursor(req.query.cursor) : null;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params: Array<string | number> = [];

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    conditions.push('(filename LIKE ? OR place_city LIKE ? OR place_country LIKE ? OR camera_make LIKE ? OR camera_model LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const type = req.query.type === 'photo' || req.query.type === 'video' ? req.query.type : null;
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  const camera = typeof req.query.camera === 'string' ? req.query.camera.trim() : '';
  if (camera) {
    conditions.push('(camera_make LIKE ? OR camera_model LIKE ?)');
    params.push(`%${camera}%`, `%${camera}%`);
  }

  const place = typeof req.query.place === 'string' ? req.query.place.trim() : '';
  if (place) {
    conditions.push('(place_city LIKE ? OR place_country LIKE ?)');
    params.push(`%${place}%`, `%${place}%`);
  }

  if (req.query.favorite === 'true') {
    conditions.push('favorite = 1');
  }

  const from = typeof req.query.from === 'string' ? req.query.from : '';
  if (from) {
    conditions.push('taken_at >= ?');
    params.push(from);
  }

  const to = typeof req.query.to === 'string' ? req.query.to : '';
  if (to) {
    // `taken_at` carries a time ("2024-03-15T14:30:00"), so a bare `to` date
    // compared with <= would exclude everything taken on that day. Extend a
    // date-only bound to the end of the day.
    conditions.push('taken_at <= ?');
    params.push(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59` : to);
  }

  if (cursor) {
    conditions.push('(taken_at < ? OR (taken_at = ? AND id < ?))');
    params.push(cursor.takenAt, cursor.takenAt, cursor.id);
  }

  const rows = db
    .prepare(
      `SELECT * FROM assets WHERE ${conditions.join(' AND ')} ORDER BY taken_at DESC, id DESC LIMIT ?`,
    )
    .all(...params, limit) as AssetRow[];

  const last = rows[rows.length - 1];
  const nextCursor = rows.length === limit && last ? encodeCursor(last.taken_at, last.id) : null;

  res.json({ items: rows.map(toAssetSummary), nextCursor });
});
