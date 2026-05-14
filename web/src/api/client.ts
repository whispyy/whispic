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

export interface GalleryFile {
  name: string;
  path: string;      // e.g. "2026/05/13/IMG_0042.jpg"
  size: number;
  modifiedAt: string;
}

export interface BrowseResponse {
  files: GalleryFile[];
  total: number;
}

export async function fetchGallery(): Promise<BrowseResponse> {
  const res = await fetch(`${baseURL()}/api/browse/photos?recursive=true`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  await checkResponse(res);
  return res.json() as Promise<BrowseResponse>;
}

export function photoURL(file: GalleryFile): string {
  const parts = file.path.split('/');
  const filename = parts[parts.length - 1];
  const subpath = parts.slice(0, -1).join('/');
  const tok = getToken() ?? '';
  return (
    `${baseURL()}/api/browse/photos/${encodeURIComponent(filename)}` +
    `?subpath=${encodeURIComponent(subpath)}&token=${encodeURIComponent(tok)}`
  );
}

export function uploadFile(
  file: File,
  subpath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('folderKey', 'photos');
    body.append('subpath', subpath);
    body.append('filenameOverride', file.name);
    body.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseURL()}/api/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${requireToken()}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status < 400) {
        resolve();
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
