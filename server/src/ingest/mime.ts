import path from 'node:path';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
};

export function mimeForFilename(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}

export function typeForMime(mime: string): 'photo' | 'video' {
  return mime.startsWith('video/') ? 'video' : 'photo';
}

/**
 * Multipart clients often declare `application/octet-stream` (curl, and any
 * client that doesn't sniff), which would classify a video as a photo and
 * queue the wrong derivative job. Fall back to the extension in that case, so
 * uploads and `/api/admin/rescan` agree on the type of the same file.
 */
export function resolveMime(declared: string | undefined, filename: string): string {
  return declared && /^(image|video)\//.test(declared) ? declared : mimeForFilename(filename);
}
