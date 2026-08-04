import path from 'node:path';
import sharp from 'sharp';
import { config } from '../../config/index.js';
import { db } from '../../db/index.js';
import type { AssetRow } from '../../db/types.js';

const THUMB_SIZE = 360;
const PREVIEW_SIZE = 1600;

export async function generateImageDerivatives(assetId: string): Promise<void> {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as AssetRow | undefined;
  if (!asset) throw new Error(`Asset not found: ${assetId}`);

  const originalPath = path.join(config.photosRoot, asset.rel_path);
  const thumbPath = path.join(config.thumbDir, `${assetId}.webp`);
  const previewPath = path.join(config.previewDir, `${assetId}.webp`);

  try {
    // .rotate() auto-orients using the EXIF Orientation tag before resizing.
    const image = sharp(originalPath, { failOn: 'none' }).rotate();
    await image.clone().resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover' }).webp({ quality: 70 }).toFile(thumbPath);
    await image
      .clone()
      .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(previewPath);

    db.prepare("UPDATE assets SET thumb_status = 'done' WHERE id = ?").run(assetId);
  } catch (err) {
    db.prepare("UPDATE assets SET thumb_status = 'failed' WHERE id = ?").run(assetId);
    throw err;
  }
}
