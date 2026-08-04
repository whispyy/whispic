#!/usr/bin/env node
// One-off/refresh build script: converts raw GeoNames dumps into the compact
// cities.json bundled with the server for offline reverse geocoding.
//
// Usage:
//   node scripts/build-geocode-data.mjs <cities15000.txt> <countryInfo.txt> <out.json>
//
// Source data: https://download.geonames.org/export/dump/ (CC-BY 4.0, GeoNames.org)

import { readFileSync, writeFileSync } from 'node:fs';

const [, , citiesPath, countryInfoPath, outPath] = process.argv;
if (!citiesPath || !countryInfoPath || !outPath) {
  console.error('Usage: node build-geocode-data.mjs <cities15000.txt> <countryInfo.txt> <out.json>');
  process.exit(1);
}

const countryNames = {};
for (const line of readFileSync(countryInfoPath, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const cols = line.split('\t');
  const [iso, , , , name] = cols;
  if (iso && name) countryNames[iso] = name;
}

const parsed = [];
for (const line of readFileSync(citiesPath, 'utf8').split('\n')) {
  if (!line) continue;
  const cols = line.split('\t');
  const name = cols[1];
  const lat = Number(cols[4]);
  const lon = Number(cols[5]);
  const countryCode = cols[8];
  const population = Number(cols[14]) || 0;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || !countryCode) continue;
  parsed.push({ lat, lon, name, country: countryNames[countryCode] ?? countryCode, population });
}

// GeoNames' cities15000 lists boroughs/arrondissements as separate entries
// (e.g. Montreal's "Ville-Marie", Paris's "Paris 04 Hôtel-de-Ville"), which
// nearest-neighbor lookup would pick over the parent city they sit inside.
// Fix: process cities most-populous first, and drop any city that falls
// within DOMINANCE_RADIUS_KM of an already-accepted (larger) city — a grid
// index keeps this roughly O(n) instead of the O(n^2) a naive scan would be.
const DOMINANCE_RADIUS_KM = 12;
const CELL_DEG = 0.15;
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

parsed.sort((a, b) => b.population - a.population);

const grid = new Map(); // "cellLat:cellLon" -> accepted city entries in that cell
const accepted = [];

for (const city of parsed) {
  const cellLat = Math.floor(city.lat / CELL_DEG);
  const cellLon = Math.floor(city.lon / CELL_DEG);
  let dominated = false;
  for (let dLat = -1; dLat <= 1 && !dominated; dLat++) {
    for (let dLon = -1; dLon <= 1 && !dominated; dLon++) {
      const neighbors = grid.get(`${cellLat + dLat}:${cellLon + dLon}`);
      if (!neighbors) continue;
      for (const other of neighbors) {
        if (haversineKm(city.lat, city.lon, other.lat, other.lon) <= DOMINANCE_RADIUS_KM) {
          dominated = true;
          break;
        }
      }
    }
  }
  if (dominated) continue;

  accepted.push(city);
  const key = `${cellLat}:${cellLon}`;
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(city);
}

const cities = accepted.map((c) => [c.lat, c.lon, c.name, c.country]);

writeFileSync(outPath, JSON.stringify(cities));
console.log(`Wrote ${cities.length} cities to ${outPath} (dropped ${parsed.length - cities.length} dominated entries)`);
