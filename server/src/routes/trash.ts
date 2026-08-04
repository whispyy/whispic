import { Router } from 'express';
import { requireAuth } from '../auth/index.js';
import { db } from '../db/index.js';
import { toAssetSummary } from '../db/mappers.js';
import type { AssetRow } from '../db/types.js';

export const trashRouter = Router();

// Trashed assets, most-recently-deleted first. Small enough a personal library
// never needs pagination here (see purge job — trash never grows unbounded).
trashRouter.get('/api/trash', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM assets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all() as AssetRow[];
  res.json({ items: rows.map(toAssetSummary) });
});
