import { useState, useCallback, useRef } from 'react';
import { fetchTimeline, searchAssets, AssetSummary, SearchParams } from '../api/client';

export interface GalleryGroup {
  date: string;          // "2026-05-13"
  displayDate: string;   // "May 13, 2026"
  files: AssetSummary[];
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

function groupAssets(items: AssetSummary[]): GalleryGroup[] {
  const byDate: Record<string, AssetSummary[]> = {};
  for (const item of items) {
    const date = item.takenAt.slice(0, 10);
    (byDate[date] ??= []).push(item);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, files]) => ({ date, displayDate: formatDate(date), files }));
}

function hasFilters(f?: SearchParams): boolean {
  if (!f) return false;
  return Boolean(f.q || f.type || f.camera || f.place || f.favorite || f.from || f.to);
}

export function useGallery(filters?: SearchParams) {
  const [items, setItems] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchPage = useCallback((cursor: string | null) => {
    const f = filtersRef.current;
    return hasFilters(f) ? searchAssets(f!, cursor) : fetchTimeline(cursor);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPage(null);
      setItems(res.items);
      cursorRef.current = res.nextCursor;
      setHasMore(res.nextCursor !== null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !cursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetchPage(cursorRef.current);
      setItems(prev => [...prev, ...res.items]);
      cursorRef.current = res.nextCursor;
      setHasMore(res.nextCursor !== null);
    } catch {
      // leave cursor as-is; next scroll trigger will retry
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage]);

  const updateItem = useCallback((id: string, patch: Partial<AssetSummary>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);

  const groups = groupAssets(items);

  return { groups, loading, loadingMore, hasMore, error, refresh, loadMore, updateItem, removeItem };
}
