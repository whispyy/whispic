import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';

export interface HashedFile {
  sha256: string;
  size: number;
}

/** Streams `source` to `destPath` while computing its SHA-256, in a single pass. */
export function hashToFile(source: Readable, destPath: string): Promise<HashedFile> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let size = 0;
    const out = createWriteStream(destPath);

    source.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      size += chunk.length;
    });
    source.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => resolve({ sha256: hash.digest('hex'), size }));

    source.pipe(out);
  });
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
