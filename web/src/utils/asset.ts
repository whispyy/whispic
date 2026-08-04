import type { AssetSummary } from '../api/client';

export function isVideo(file: AssetSummary): boolean {
  return file.type === 'video';
}

export function formatTime(takenAt: string): string {
  const d = new Date(takenAt);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
