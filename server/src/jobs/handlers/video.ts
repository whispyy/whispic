import { spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../../config/index.js';
import { db } from '../../db/index.js';
import type { AssetRow } from '../../db/types.js';

const THUMB_SIZE = 360;
const PREVIEW_SIZE = 1600;

/** Runs a CLI tool and collects its stdout as a Buffer, rejecting on non-zero exit. */
function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

async function probeDuration(filePath: string): Promise<number | null> {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const value = Number(out.toString('utf8').trim());
  return Number.isFinite(value) ? value : null;
}

async function extractPosterFrame(filePath: string, seekSeconds: number): Promise<Buffer> {
  return run('ffmpeg', [
    '-ss', String(seekSeconds),
    '-i', filePath,
    '-frames:v', '1',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    'pipe:1',
  ]);
}

export async function generateVideoDerivatives(assetId: string): Promise<void> {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as AssetRow | undefined;
  if (!asset) throw new Error(`Asset not found: ${assetId}`);

  const originalPath = path.join(config.photosRoot, asset.rel_path);
  const thumbPath = path.join(config.thumbDir, `${assetId}.webp`);
  const previewPath = path.join(config.previewDir, `${assetId}.webp`);

  try {
    const duration = await probeDuration(originalPath);
    const seek = duration ? Math.min(1, duration / 2) : 0;
    const frame = await extractPosterFrame(originalPath, seek);

    const image = sharp(frame).rotate();
    await image.clone().resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover' }).webp({ quality: 70 }).toFile(thumbPath);
    await image
      .clone()
      .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(previewPath);

    db.prepare("UPDATE assets SET thumb_status = 'done', duration_s = ? WHERE id = ?").run(duration, assetId);
  } catch (err) {
    db.prepare("UPDATE assets SET thumb_status = 'failed' WHERE id = ?").run(assetId);
    throw err;
  }
}
