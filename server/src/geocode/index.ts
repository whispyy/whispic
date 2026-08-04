import rawCities from './data/cities.json' with { type: 'json' };

// [lat, lon, name, country] — built from GeoNames `cities15000` + `countryInfo`
// via `scripts/build-geocode-data.mjs`. See that script for provenance/refresh.
type CityEntry = [number, number, string, string];

const cities = rawCities as CityEntry[];

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export interface PlaceResult {
  city: string;
  country: string;
}

/** Nearest-neighbor lookup against a bundled ~34k-city GeoNames dataset (population >= 15000). */
export function reverseGeocode(lat: number, lon: number): PlaceResult | null {
  let best: CityEntry | null = null;
  let bestDist = Infinity;
  for (const entry of cities) {
    const dist = haversineKm(lat, lon, entry[0], entry[1]);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best ? { city: best[2], country: best[3] } : null;
}
