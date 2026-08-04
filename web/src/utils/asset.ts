import type { AssetSummary } from '../api/client';

export function isVideo(file: AssetSummary): boolean {
  return file.type === 'video';
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatTime(takenAt: string): string {
  const d = new Date(takenAt);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
