import { useState, useCallback } from 'react';
import { fetchGallery, GalleryFile } from '../api/client';

export interface GalleryGroup {
  date: string;          // "2026-05-13"
  displayDate: string;   // "May 13, 2026"
  files: GalleryFile[];
}

function formatDate(dateStr: string): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yesterday = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;

  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';

  const d = new Date(`${dateStr}T00:00:00`);
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function groupFiles(files: GalleryFile[]): GalleryGroup[] {
  // Derive has_thumbnail from presence of matching file in .thumbnails dirs
  const thumbPaths = new Set(
    files
      .filter(f => f.path.includes('/.thumbnails/'))
      .map(f => f.path.replace('/.thumbnails/', '/'))
  );

  const byDate: Record<string, GalleryFile[]> = {};
  for (const file of files.filter(f => !f.path.includes('/.thumbnails/'))) {
    const parts = file.path.split('/');
    if (parts.length < 4) continue;   // expect YYYY/MM/DD/filename
    const date = `${parts[0]}-${parts[1]}-${parts[2]}`;
    (byDate[date] ??= []).push({ ...file, has_thumbnail: thumbPaths.has(file.path) });
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, grpFiles]) => ({
      date,
      displayDate: formatDate(date),
      files: grpFiles.sort((a, b) => a.path.localeCompare(b.path)),
    }));
}

export function useGallery() {
  const [groups, setGroups] = useState<GalleryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGallery();
      setGroups(groupFiles(res.files));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  return { groups, loading, error, refresh };
}
