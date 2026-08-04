// Opaque (taken_at, id) pagination cursor shared by the timeline and search
// endpoints — keeps pagination stable even when many assets share a taken_at.

export function encodeCursor(takenAt: string, id: string): string {
  return Buffer.from(`${takenAt}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { takenAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf('|');
    if (sep === -1) return null;
    return { takenAt: decoded.slice(0, sep), id: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}
