import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const photosRoot = requireEnv('PHOTOS_ROOT');

if (!existsSync(photosRoot)) {
  throw new Error(`PHOTOS_ROOT does not exist: ${photosRoot}`);
}

const originalsDir = path.join(photosRoot, 'originals');
const derivedDir = path.join(photosRoot, 'derived');
const thumbDir = path.join(derivedDir, 'thumb');
const previewDir = path.join(derivedDir, 'preview');
const posterDir = path.join(derivedDir, 'poster');
const dbDir = path.join(photosRoot, 'db');
const tmpDir = path.join(photosRoot, 'tmp');

for (const dir of [originalsDir, thumbDir, previewDir, posterDir, dbDir, tmpDir]) {
  mkdirSync(dir, { recursive: true });
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  appPassword: process.env.APP_PASSWORD,
  sessionTtlHours: (() => {
    const hours = parseInt(process.env.SESSION_TTL_HOURS || '168', 10);
    return isNaN(hours) || hours <= 0 ? 168 : hours;
  })(),
  // Caps a single upload so one client can't fill the disk. Default 20 GiB is
  // well above any phone-captured video.
  maxUploadBytes: (() => {
    const bytes = parseInt(process.env.MAX_UPLOAD_BYTES || '', 10);
    return isNaN(bytes) || bytes <= 0 ? 20 * 1024 * 1024 * 1024 : bytes;
  })(),
  photosRoot,
  originalsDir,
  derivedDir,
  thumbDir,
  previewDir,
  posterDir,
  dbDir,
  tmpDir,
  dbPath: path.join(dbDir, 'whispic.sqlite'),
};
