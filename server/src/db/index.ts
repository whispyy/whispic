import Database from 'better-sqlite3';
import { config } from '../config/index.js';

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  sha256 TEXT UNIQUE NOT NULL,
  rel_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT,
  type TEXT NOT NULL, -- photo | video
  taken_at TEXT NOT NULL,
  taken_at_utc TEXT,
  tz_offset TEXT,
  width INTEGER,
  height INTEGER,
  duration_s REAL,
  camera_make TEXT,
  camera_model TEXT,
  lat REAL,
  lon REAL,
  place_city TEXT,
  place_country TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  thumb_status TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_assets_taken_at ON assets (taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_location ON assets (lat, lon);
CREATE INDEX IF NOT EXISTS idx_assets_place_city ON assets (place_city);
CREATE INDEX IF NOT EXISTS idx_assets_camera_model ON assets (camera_model);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (type);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cover_asset_id TEXT REFERENCES assets(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS album_assets (
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (album_id, asset_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
`);

// Self-heal: a job stuck 'running' means the process died mid-execution
// (e.g. crash/restart). Re-queue it rather than leaving it stuck forever.
db.prepare("UPDATE jobs SET status = 'pending' WHERE status = 'running'").run();
