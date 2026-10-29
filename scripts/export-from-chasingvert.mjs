// One-off export: pulls elevation data for the featured activities from a locally running
// chasingVert server (http://localhost:3001) and writes slim JSON files into src/data.
// Only position, altitude and distance are kept; no names, dates, or other Strava fields.
//   node scripts/export-from-chasingvert.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const BASE = process.env.CHASINGVERT_URL || 'http://localhost:3001';
const MAX_POINTS = 6000;

// slug -> Strava activity id
const PEAKS = {
  camelback: 14282463185,
  enchantments: 3748583521,
  'grand-canyon': 4509996191,
  'utah-trail-run': 15064020348,
};

const round = (v, d) => Number(v.toFixed(d));
const thin = (arr, keep) => arr.filter((_, i) => keep.has(i));

fs.mkdirSync(OUT, { recursive: true });
for (const [slug, id] of Object.entries(PEAKS)) {
  const res = await fetch(`${BASE}/api/activities/${id}/streams`);
  if (!res.ok) { console.error(`${slug}: HTTP ${res.status}`); process.exitCode = 1; continue; }
  const s = await res.json();
  const n = s.latlng.length;
  const step = Math.max(1, Math.ceil(n / MAX_POINTS));
  const keep = new Set();
  for (let i = 0; i < n; i += step) keep.add(i);
  keep.add(n - 1);
  const out = {
    latlng: thin(s.latlng, keep).map(([a, b]) => [round(a, 5), round(b, 5)]),
    altitude: thin(s.altitude, keep).map((v) => round(v, 1)),
    distance: thin(s.distance, keep).map((v) => round(v, 1)),
  };
  fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(out));
  console.log(`${slug}: ${n} -> ${out.latlng.length} points`);
}
