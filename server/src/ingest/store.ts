import { existsSync } from 'node:fs';
import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

function parseDateComponents(takenAtLocal: string): { y: string; m: string; d: string } {
  const match = takenAtLocal.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Cannot parse date from taken_at: ${takenAtLocal}`);
  const [, y, m, d] = match;
  return { y, m, d };
}

function resolveUniquePath(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = filename;
  let suffix = 0;
  while (existsSync(path.join(dir, candidate))) {
    suffix += 1;
    candidate = `${base}-${suffix}${ext}`;
  }
  return candidate;
}

/**
 * Moves an uploaded temp file into `originals/YYYY/MM/DD/`, derived from the
 * asset's taken-at date, resolving filename collisions within that day.
 */
export async function moveIntoOriginals(
  tempPath: string,
  takenAtLocal: string,
  originalFilename: string,
): Promise<{ relPath: string; absPath: string }> {
  const { y, m, d } = parseDateComponents(takenAtLocal);
  const dir = path.join(config.originalsDir, y, m, d);
  await mkdir(dir, { recursive: true });

  const safeName = path.basename(originalFilename).replace(/[/\\]/g, '_') || 'file';
  const finalName = resolveUniquePath(dir, safeName);
  const absPath = path.join(dir, finalName);

  try {
    await rename(tempPath, absPath);
  } catch (err) {
    // Cross-device temp dirs (e.g. tmpfs vs. the HDD mount) can't be renamed.
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(tempPath, absPath);
      await unlink(tempPath);
    } else {
      throw err;
    }
  }

  return { relPath: path.relative(config.photosRoot, absPath), absPath };
}
