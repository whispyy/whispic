export interface AssetRow {
  id: string;
  sha256: string;
  rel_path: string;
  filename: string;
  size: number;
  mime: string | null;
  type: 'photo' | 'video';
  taken_at: string;
  taken_at_utc: string | null;
  tz_offset: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  camera_make: string | null;
  camera_model: string | null;
  lat: number | null;
  lon: number | null;
  place_city: string | null;
  place_country: string | null;
  favorite: number;
  thumb_status: 'pending' | 'done' | 'failed';
  created_at: string;
  deleted_at: string | null;
}

export interface AlbumRow {
  id: string;
  name: string;
  cover_asset_id: string | null;
  created_at: string;
}

export interface JobRow {
  id: string;
  kind: string;
  asset_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  created_at: string;
}
