const STORAGE_URL_KEY = 'whispic.serverURL';
const STORAGE_TOKEN_KEY = 'whispic.token';

export function getServerURL(): string {
  return localStorage.getItem(STORAGE_URL_KEY) ?? '';
}

export function setServerURL(url: string): void {
  localStorage.setItem(STORAGE_URL_KEY, url.trim().replace(/\/$/, ''));
}

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
}

function baseURL(): string {
  const url = getServerURL();
  if (!url) throw new Error('Server URL not configured');
  return url;
}

function requireToken(): string {
  const t = getToken();
  if (!t) throw new Error('Not authenticated');
  return t;
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const msg = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }
}

export async function authenticate(password: string): Promise<void> {
  const res = await fetch(`${baseURL()}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  await checkResponse(res);
  const body = await res.json() as { token: string };
  localStorage.setItem(STORAGE_TOKEN_KEY, body.token);
}

export interface AssetSummary {
  id: string;
  takenAt: string;         // "2026-05-13T10:00:00" (local capture time)
  type: 'photo' | 'video';
  width: number | null;
  height: number | null;
  durationS: number | null;
  favorite: boolean;
  hasThumb: boolean;
}

export interface TimelineResponse {
  items: AssetSummary[];
  nextCursor: string | null;
}

export async function fetchTimeline(cursor: string | null, limit = 200): Promise<TimelineResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${baseURL()}/api/timeline?${params}`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  return res.json() as Promise<TimelineResponse>;
}

export interface AssetDetail {
  id: string;
  takenAt: string;
  takenAtUtc: string | null;
  tzOffset: number | null;
  type: 'photo' | 'video';
  filename: string;
  size: number;
  mime: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lat: number | null;
  lon: number | null;
  placeCity: string | null;
  placeCountry: string | null;
  favorite: boolean;
  thumbStatus: string;
  createdAt: string;
}

export async function fetchAssetDetail(id: string): Promise<AssetDetail> {
  const res = await fetch(`${baseURL()}/api/assets/${id}`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  return res.json() as Promise<AssetDetail>;
}

export interface MapCluster {
  lat: number;
  lon: number;
  count: number;
  assetId: string | null;
}

export async function fetchMapClusters(
  bbox: [number, number, number, number],
  zoom: number,
): Promise<MapCluster[]> {
  const params = new URLSearchParams({ bbox: bbox.join(','), zoom: String(Math.round(zoom)) });
  const res = await fetch(`${baseURL()}/api/map/clusters?${params}`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  const body = await res.json() as { clusters: MapCluster[] };
  return body.clusters;
}

export interface SearchParams {
  q?: string;
  type?: 'photo' | 'video';
  camera?: string;
  place?: string;
  favorite?: boolean;
  from?: string;
  to?: string;
}

export async function searchAssets(params: SearchParams, cursor: string | null, limit = 200): Promise<TimelineResponse> {
  const usp = new URLSearchParams({ limit: String(limit) });
  if (cursor) usp.set('cursor', cursor);
  if (params.q) usp.set('q', params.q);
  if (params.type) usp.set('type', params.type);
  if (params.camera) usp.set('camera', params.camera);
  if (params.place) usp.set('place', params.place);
  if (params.favorite) usp.set('favorite', 'true');
  if (params.from) usp.set('from', params.from);
  if (params.to) usp.set('to', params.to);

  const res = await fetch(`${baseURL()}/api/search?${usp}`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  return res.json() as Promise<TimelineResponse>;
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const res = await fetch(`${baseURL()}/api/assets/${id}/favorite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  const body = await res.json() as { favorite: boolean };
  return body.favorite;
}

export async function trashAsset(id: string): Promise<void> {
  const res = await fetch(`${baseURL()}/api/assets/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
}

export async function restoreAsset(id: string): Promise<void> {
  const res = await fetch(`${baseURL()}/api/assets/${id}/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
}

export async function fetchTrash(): Promise<{ items: AssetSummary[] }> {
  const res = await fetch(`${baseURL()}/api/trash`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  return res.json() as Promise<{ items: AssetSummary[] }>;
}

export interface Album {
  id: string;
  name: string;
  coverAssetId: string | null;
  assetCount: number;
  createdAt: string;
}

export async function fetchAlbums(): Promise<Album[]> {
  const res = await fetch(`${baseURL()}/api/albums`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  const body = await res.json() as { items: Album[] };
  return body.items;
}

export async function createAlbum(name: string): Promise<Album> {
  const res = await fetch(`${baseURL()}/api/albums`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await checkResponse(res);
  return res.json() as Promise<Album>;
}

export async function renameAlbum(id: string, name: string): Promise<Album> {
  const res = await fetch(`${baseURL()}/api/albums/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${requireToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await checkResponse(res);
  return res.json() as Promise<Album>;
}

export async function deleteAlbum(id: string): Promise<void> {
  const res = await fetch(`${baseURL()}/api/albums/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
}

export async function fetchAlbum(id: string): Promise<{ album: Album; items: AssetSummary[] }> {
  const res = await fetch(`${baseURL()}/api/albums/${id}`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  return res.json() as Promise<{ album: Album; items: AssetSummary[] }>;
}

export async function addAssetToAlbum(albumId: string, assetId: string): Promise<Album> {
  const res = await fetch(`${baseURL()}/api/albums/${albumId}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId }),
  });
  await checkResponse(res);
  return res.json() as Promise<Album>;
}

export async function removeAssetFromAlbum(albumId: string, assetId: string): Promise<void> {
  const res = await fetch(`${baseURL()}/api/albums/${albumId}/assets/${assetId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
}

export function assetThumbURL(id: string): string {
  return `${baseURL()}/api/assets/${id}/thumb?token=${encodeURIComponent(getToken() ?? '')}`;
}

export function assetPreviewURL(id: string): string {
  return `${baseURL()}/api/assets/${id}/preview?token=${encodeURIComponent(getToken() ?? '')}`;
}

export function assetOriginalURL(id: string): string {
  return `${baseURL()}/api/assets/${id}/original?token=${encodeURIComponent(getToken() ?? '')}`;
}

export async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkAssetExists(sha256: string): Promise<{ exists: boolean; assetId: string | null }> {
  const res = await fetch(`${baseURL()}/api/assets/exists?sha256=${encodeURIComponent(sha256)}`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  return res.json();
}

function localIsoNoTZ(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export interface UploadResult {
  id: string;
  duplicate?: boolean;
  assetId?: string;
}

export function uploadAsset(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('file', file);
    body.append('creationDate', localIsoNoTZ(new Date(file.lastModified)));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseURL()}/api/assets`);
    xhr.setRequestHeader('Authorization', `Bearer ${requireToken()}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status < 400) {
        resolve(JSON.parse(xhr.responseText) as UploadResult);
      } else {
        try {
          const b = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(b.error ?? `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(body);
  });
}
