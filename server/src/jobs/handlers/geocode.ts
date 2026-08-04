import { reverseGeocode } from '../../geocode/index.js';
import { db } from '../../db/index.js';
import type { AssetRow } from '../../db/types.js';

export async function generatePlace(assetId: string): Promise<void> {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as AssetRow | undefined;
  if (!asset) throw new Error(`Asset not found: ${assetId}`);
  if (asset.lat == null || asset.lon == null) return;

  const place = reverseGeocode(asset.lat, asset.lon);
  if (!place) return;

  db.prepare('UPDATE assets SET place_city = ?, place_country = ? WHERE id = ?').run(place.city, place.country, assetId);
}
