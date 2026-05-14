import { useState, useCallback } from 'react';
import { fetchGallery, GalleryFile } from '../api/client';

export interface GalleryGroup {
  date: string;          // "2026-05-13"
  displayDate: string;   // "May 13, 2026"
  files: GalleryFile[];
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function groupFiles(files: GalleryFile[]): GalleryGroup[] {
  const byDate: Record<string, GalleryFile[]> = {};
  for (const file of files) {
    const parts = file.path.split('/');
    if (parts.length < 4) continue;   // expect YYYY/MM/DD/filename
    const date = `${parts[0]}-${parts[1]}-${parts[2]}`;
    (byDate[date] ??= []).push(file);
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
