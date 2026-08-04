import type { AlbumRow, AssetRow } from './types.js';

/** Lightweight shape used in timeline listings. */
export function toAssetSummary(row: AssetRow) {
  return {
    id: row.id,
    takenAt: row.taken_at,
    type: row.type,
    width: row.width,
    height: row.height,
    durationS: row.duration_s,
    favorite: Boolean(row.favorite),
    hasThumb: row.thumb_status === 'done',
  };
}

/** Full shape used for the single-asset detail endpoint. */
export function toAssetDetail(row: AssetRow) {
  return {
    id: row.id,
    takenAt: row.taken_at,
    takenAtUtc: row.taken_at_utc,
    tzOffset: row.tz_offset,
    type: row.type,
    filename: row.filename,
    size: row.size,
    mime: row.mime,
    width: row.width,
    height: row.height,
    durationS: row.duration_s,
    cameraMake: row.camera_make,
    cameraModel: row.camera_model,
    lat: row.lat,
    lon: row.lon,
    placeCity: row.place_city,
    placeCountry: row.place_country,
    favorite: Boolean(row.favorite),
    thumbStatus: row.thumb_status,
    createdAt: row.created_at,
  };
}

/** Album shape for list/detail endpoints; `assetCount` comes from a joined query, not the row itself. */
export function toAlbumSummary(row: AlbumRow & { asset_count: number }) {
  return {
    id: row.id,
    name: row.name,
    coverAssetId: row.cover_asset_id,
    assetCount: row.asset_count,
    createdAt: row.created_at,
  };
}
