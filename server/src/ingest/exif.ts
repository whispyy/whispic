import { exiftool, ExifDateTime } from 'exiftool-vendored';
import type { Tags } from 'exiftool-vendored';

export interface ExtractedMetadata {
  takenAtLocal: string | null; // "YYYY-MM-DDTHH:MM:SS", no offset baked in
  takenAtUtc: string | null; // ISO8601 UTC, only when the offset is known
  tzOffset: string | null; // "+HH:MM" / "-HH:MM", only when known
  width: number | null;
  height: number | null;
  durationS: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lat: number | null;
  lon: number | null;
}

interface ParsedDate {
  local: string;
  utc: string | null;
  offset: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Rejects placeholder dates — MP4/MOV containers written without a real clock
 * report `0000:00:00 00:00:00`, which would otherwise be stored verbatim and
 * file the asset under `originals/0000/00/00/`. Returning null here lets the
 * caller fall back to the client hint or file mtime.
 */
function isPlausibleDate(year: number, month: number, day: number): boolean {
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function parseDateTag(value: ExifDateTime | string | number | undefined): ParsedDate | null {
  if (value == null) return null;

  if (value instanceof ExifDateTime) {
    if (!isPlausibleDate(value.year, value.month, value.day)) return null;
    const local = `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
    if (typeof value.tzoffsetMinutes !== 'number') {
      return { local, utc: null, offset: null };
    }
    const sign = value.tzoffsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(value.tzoffsetMinutes);
    const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    let utc: string | null = null;
    try {
      utc = value.toDate().toISOString();
    } catch {
      utc = null;
    }
    return { local, utc, offset };
  }

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:([+-]\d{2}:\d{2}))?/);
    if (!match) return null;
    const [, y, mo, da, h, mi, s, offset] = match;
    if (!isPlausibleDate(Number(y), Number(mo), Number(da))) return null;
    return { local: `${y}-${mo}-${da}T${h}:${mi}:${s}`, utc: null, offset: offset ?? null };
  }

  return null;
}

function parseNumericTag(value: number | string | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Priority chain: photo EXIF date first, then video container dates.
const DATE_TAG_PRIORITY: Array<keyof Tags> = [
  'DateTimeOriginal',
  'CreateDate',
  'MediaCreateDate',
  'TrackCreateDate',
  'CreationDate',
];

export async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
  const tags: Tags = await exiftool.read(filePath);

  let taken: ParsedDate | null = null;
  for (const tagName of DATE_TAG_PRIORITY) {
    taken = parseDateTag(tags[tagName] as ExifDateTime | string | number | undefined);
    if (taken) break;
  }

  return {
    takenAtLocal: taken?.local ?? null,
    takenAtUtc: taken?.utc ?? null,
    tzOffset: taken?.offset ?? null,
    width: tags.ImageWidth ?? null,
    height: tags.ImageHeight ?? null,
    durationS: parseNumericTag(tags.Duration),
    cameraMake: tags.Make ?? null,
    cameraModel: tags.Model ?? null,
    lat: parseNumericTag(tags.GPSLatitude),
    lon: parseNumericTag(tags.GPSLongitude),
  };
}

export async function shutdownExif(): Promise<void> {
  await exiftool.end();
}
