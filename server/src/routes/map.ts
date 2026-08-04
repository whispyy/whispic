import { Router } from 'express';
import { requireAuth } from '../auth/index.js';
import { db } from '../db/index.js';
import type { AssetRow } from '../db/types.js';

export const mapRouter = Router();

interface ClusterPoint {
  lat: number;
  lon: number;
  count: number;
  assetId: string | null; // set only when count === 1, for direct navigation
}

// Simple grid-based clustering: bucket points into cells sized by zoom level,
// so clusters merge/split naturally as the client zooms in/out. Good enough
// for a personal library (thousands, not millions, of geotagged assets).
mapRouter.get('/api/map/clusters', requireAuth, (req, res) => {
  const parts = String(req.query.bbox ?? '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    res.status(400).json({ error: 'bbox query param must be "minLon,minLat,maxLon,maxLat"' });
    return;
  }
  const [minLon, minLat, maxLon, maxLat] = parts;

  const zoomParam = parseInt(String(req.query.zoom ?? '3'), 10);
  const zoom = Number.isFinite(zoomParam) ? Math.min(20, Math.max(0, zoomParam)) : 3;
  const cellDeg = 45 / 2 ** zoom;

  const rows = db
    .prepare(
      `SELECT id, lat, lon FROM assets
       WHERE deleted_at IS NULL AND lat IS NOT NULL AND lon IS NOT NULL
         AND lon >= ? AND lon <= ? AND lat >= ? AND lat <= ?`,
    )
    .all(minLon, maxLon, minLat, maxLat) as Array<Pick<AssetRow, 'id' | 'lat' | 'lon'>>;

  const cells = new Map<string, { latSum: number; lonSum: number; count: number; assetId: string }>();
  for (const row of rows) {
    const lat = row.lat as number;
    const lon = row.lon as number;
    const key = `${Math.floor(lat / cellDeg)}:${Math.floor(lon / cellDeg)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.latSum += lat;
      cell.lonSum += lon;
      cell.count += 1;
    } else {
      cells.set(key, { latSum: lat, lonSum: lon, count: 1, assetId: row.id });
    }
  }

  const clusters: ClusterPoint[] = Array.from(cells.values()).map((cell) => ({
    lat: cell.latSum / cell.count,
    lon: cell.lonSum / cell.count,
    count: cell.count,
    assetId: cell.count === 1 ? cell.assetId : null,
  }));

  res.json({ clusters });
});
