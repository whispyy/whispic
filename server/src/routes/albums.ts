import { Router } from 'express';
import { ulid } from 'ulid';
import { requireAuth } from '../auth/index.js';
import { db } from '../db/index.js';
import { toAlbumSummary, toAssetSummary } from '../db/mappers.js';
import type { AlbumRow, AssetRow } from '../db/types.js';

export const albumsRouter = Router();

function getAlbum(id: string): (AlbumRow & { asset_count: number }) | undefined {
  return db
    .prepare(
      `SELECT albums.*, COUNT(album_assets.asset_id) as asset_count
       FROM albums LEFT JOIN album_assets ON album_assets.album_id = albums.id
       WHERE albums.id = ? GROUP BY albums.id`,
    )
    .get(id) as (AlbumRow & { asset_count: number }) | undefined;
}

albumsRouter.get('/api/albums', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT albums.*, COUNT(album_assets.asset_id) as asset_count
       FROM albums LEFT JOIN album_assets ON album_assets.album_id = albums.id
       GROUP BY albums.id ORDER BY albums.created_at DESC`,
    )
    .all() as Array<AlbumRow & { asset_count: number }>;
  res.json({ items: rows.map(toAlbumSummary) });
});

albumsRouter.post('/api/albums', requireAuth, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: '"name" is required' });
    return;
  }
  const id = ulid();
  db.prepare('INSERT INTO albums (id, name, cover_asset_id, created_at) VALUES (?, ?, NULL, ?)').run(
    id,
    name,
    new Date().toISOString(),
  );
  res.status(201).json(toAlbumSummary(getAlbum(id)!));
});

albumsRouter.get('/api/albums/:id', requireAuth, (req, res) => {
  const album = getAlbum(String(req.params.id));
  if (!album) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const assets = db
    .prepare(
      `SELECT assets.* FROM assets
       JOIN album_assets ON album_assets.asset_id = assets.id
       WHERE album_assets.album_id = ? AND assets.deleted_at IS NULL
       ORDER BY assets.taken_at DESC`,
    )
    .all(req.params.id) as AssetRow[];

  res.json({ album: toAlbumSummary(album), items: assets.map(toAssetSummary) });
});

albumsRouter.patch('/api/albums/:id', requireAuth, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: '"name" is required' });
    return;
  }
  const result = db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(name, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(toAlbumSummary(getAlbum(String(req.params.id))!));
});

albumsRouter.delete('/api/albums/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(204).end();
});

albumsRouter.post('/api/albums/:id/assets', requireAuth, (req, res) => {
  const album = getAlbum(String(req.params.id));
  if (!album) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const assetIds: string[] = Array.isArray(req.body?.assetIds)
    ? req.body.assetIds
    : typeof req.body?.assetId === 'string'
      ? [req.body.assetId]
      : [];
  if (assetIds.length === 0) {
    res.status(400).json({ error: '"assetId" or "assetIds" is required' });
    return;
  }

  const insert = db.prepare('INSERT OR IGNORE INTO album_assets (album_id, asset_id) VALUES (?, ?)');
  for (const assetId of assetIds) insert.run(req.params.id, assetId);

  if (!album.cover_asset_id) {
    db.prepare('UPDATE albums SET cover_asset_id = ? WHERE id = ?').run(assetIds[0], req.params.id);
  }

  res.json(toAlbumSummary(getAlbum(String(req.params.id))!));
});

albumsRouter.delete('/api/albums/:id/assets/:assetId', requireAuth, (req, res) => {
  const result = db
    .prepare('DELETE FROM album_assets WHERE album_id = ? AND asset_id = ?')
    .run(req.params.id, req.params.assetId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const album = getAlbum(String(req.params.id));
  if (album && album.cover_asset_id === req.params.assetId) {
    const next = db
      .prepare('SELECT asset_id FROM album_assets WHERE album_id = ? LIMIT 1')
      .get(req.params.id) as { asset_id: string } | undefined;
    db.prepare('UPDATE albums SET cover_asset_id = ? WHERE id = ?').run(next?.asset_id ?? null, req.params.id);
  }

  res.status(204).end();
});
