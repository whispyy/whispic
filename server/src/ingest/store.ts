import { createReadStream } from 'node:fs';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from '../config/index.js';

function parseDateComponents(takenAtLocal: string): { y: string; m: string; d: string } {
  const match = takenAtLocal.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Cannot parse date from taken_at: ${takenAtLocal}`);
  const [, y, m, d] = match;
  return { y, m, d };
}

const MAX_NAME_ATTEMPTS = 10_000;

function candidateName(safeName: string, suffix: number): string {
  if (suffix === 0) return safeName;
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  return `${base}-${suffix}${ext}`;
}

function isCode(err: unknown, ...codes: string[]): boolean {
  return codes.includes((err as NodeJS.ErrnoException).code ?? '');
}

/**
 * Copies `tempPath` to `absPath`, failing with EEXIST if the name is already
 * taken. Used when the temp dir and originals live on different filesystems,
 * where hard links are not possible. `open(..., 'wx')` reserves the name
 * atomically before any bytes are written, so two concurrent uploads can never
 * pick the same destination.
 */
async function copyExclusive(tempPath: string, absPath: string): Promise<void> {
  const handle = await open(absPath, 'wx');
  try {
    await pipeline(createReadStream(tempPath), handle.createWriteStream());
  } catch (err) {
    await handle.close();
    await unlink(absPath).catch(() => {});
    throw err;
  }
  await handle.close();
}

/**
 * Moves an uploaded temp file into `originals/YYYY/MM/DD/`, derived from the
 * asset's taken-at date, resolving filename collisions within that day.
 *
 * Collision handling must be atomic: an exists-then-rename check would let two
 * concurrent uploads of same-named files on the same day resolve to the same
 * destination, and `rename` silently overwrites — losing an original. Both
 * paths below (link / open-wx) fail with EEXIST instead, so we just try the
 * next suffix.
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
  let canHardLink = true;

  for (let suffix = 0; suffix < MAX_NAME_ATTEMPTS; suffix += 1) {
    const absPath = path.join(dir, candidateName(safeName, suffix));
    try {
      if (canHardLink) {
        try {
          await link(tempPath, absPath);
        } catch (err) {
          // Cross-device temp dirs (e.g. tmpfs vs. the HDD mount) and some
          // filesystems can't hard link; fall back to an exclusive copy.
          if (!isCode(err, 'EXDEV', 'EPERM', 'ENOSYS', 'EOPNOTSUPP')) throw err;
          canHardLink = false;
          await copyExclusive(tempPath, absPath);
        }
      } else {
        await copyExclusive(tempPath, absPath);
      }
      await unlink(tempPath);
      return { relPath: path.relative(config.photosRoot, absPath), absPath };
    } catch (err) {
      if (isCode(err, 'EEXIST')) continue;
      throw err;
    }
  }

  throw new Error(`Could not find a free filename for ${safeName} in ${dir}`);
}
