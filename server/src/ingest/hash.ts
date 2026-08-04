import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface HashedFile {
  sha256: string;
  size: number;
}

/**
 * Streams `source` to `destPath` while computing its SHA-256, in a single pass.
 * On failure the partial file is removed so aborted uploads can't accumulate in
 * the temp dir.
 */
export async function hashToFile(source: Readable, destPath: string): Promise<HashedFile> {
  const hash = createHash('sha256');
  let size = 0;
  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          hash.update(chunk);
          size += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(destPath),
    );
  } catch (err) {
    await unlink(destPath).catch(() => {});
    throw err;
  }
  return { sha256: hash.digest('hex'), size };
}

/** Hashes a file already on disk (used by rescan, which reads existing originals). */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
