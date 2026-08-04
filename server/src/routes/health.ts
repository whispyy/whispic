import { Router } from 'express';
import { db } from '../db/index.js';

export const healthRouter = Router();

healthRouter.get('/api/health', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number };
  res.json({ status: 'ok', assetCount: row.count });
});
