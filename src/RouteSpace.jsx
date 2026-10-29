import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Deck, MapView, WebMercatorViewport } from '@deck.gl/core';
import { LineLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TerrainLayer } from '@deck.gl/geo-layers';
import { pointValues } from './elevation.js';
import { RAMP_CSS } from './colors.js';

const toRgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const BASEMAPS = {
  satellite: { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', credit: 'Imagery © Esri, Maxar, Earthstar Geographics' },
  topo: { label: 'Topo', url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', credit: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors' },
  esritopo: { label: 'Esri Topo', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', credit: 'Map © Esri, HERE, Garmin, USGS, NPS' },
  streets: { label: 'Streets', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', credit: '© OpenStreetMap contributors' },
};
const LIFT = 8; // metres above the route's recorded altitude, so it isn't buried by DEM mismatch
const MARGIN = 0.35; // how far beyond the route (as a fraction of its size) the map extends
const MAX_ZOOM = 16;

function gradeAt(i, alt, dist) {
  const a = Math.max(0, i - 5), b = Math.min(alt.length - 1, i + 5);
  const d = dist[b] - dist[a];
  return d > 0 ? ((alt[b] - alt[a]) / d) * 100 : 0;
}

// Light moving average to take the GPS zig-zag out of the drawn line.
function smoothLatLng(latlng, r = 2) {
  return latlng.map((_, i) => {
    let la = 0, lo = 0, c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(latlng.length - 1, i + r); j++) { la += latlng[j][0]; lo += latlng[j][1]; c++; }
    return [la / c, lo / c];
  });
}

export default function RouteSpace({ streams, mode }) {
  const parent = useRef(null);
  const deckRef = useRef(null);
  const viewRef = useRef(null);
  const [exag, setExag] = useState(2);
  const [terrain, setTerrain] = useState(true);
  const [basemap, setBasemap] = useState('satellite');
  const [sel, setSel] = useState(null);
  const { latlng, altitude, distance } = streams;
  const n = altitude.length;

  const { colors } = useMemo(() => pointValues(streams, mode), [streams, mode]);
  const minAlt = Math.min(...altitude), maxAlt = Math.max(...altitude);
  const midAlt = (minAlt + maxAlt) / 2;
  const pts = useMemo(() => smoothLatLng(latlng), [latlng]);
  const segs = useMemo(() => pts.slice(1).map((p, i) => ({ i: i + 1, a: pts[i], b: p, ai: i, color: toRgb(colors[i + 1]) })), [pts, colors]);
  // [west, south, east, north] of the route plus a margin: the only area we load detail for.
  const extent = useMemo(() => {
    const lats = latlng.map((p) => p[0]), lngs = latlng.map((p) => p[1]);
    const [s, nn, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const dLat = Math.max(nn - s, 0.004) * MARGIN, dLng = Math.max(e - w, 0.004) * MARGIN;
    return [w - dLng, s - dLat, e + dLng, nn + dLat];
  }, [latlng]);

  // Cap tile detail so the area is at most ~6 tiles wide: big routes stay light, small ones get full detail.
  const maxTileZoom = Math.min(15, Math.floor(Math.log2((6 * 360) / Math.max(extent[2] - extent[0], 0.001))));

  const layers = useMemo(() => {
    // z is metres relative to the route's mid-altitude, times the exaggeration (matches the terrain decoder).
    // Keeping the scene centred on z=0 is what lets the tile loader pick the right tiles.
    const pos = (ll, k) => [ll[1], ll[0], (altitude[k] + LIFT - midAlt) * exag];
    const floor = (minAlt - 5 - midAlt) * exag;
    const step = Math.max(1, Math.floor(segs.length / 300));
    const L = [];
    if (terrain) {
      L.push(new TerrainLayer({
        id: 'terrain', elevationData: DEM, texture: BASEMAPS[basemap].url, extent, minZoom: 8, maxZoom: maxTileZoom, zoomOffset: 1, meshMaxError: 2,
        elevationDecoder: { rScaler: 256 * exag, gScaler: exag, bScaler: exag / 256, offset: (-32768 - midAlt) * exag },
        color: [255, 255, 255],
      }));
    } else {
      // no terrain: show a ground trace and curtain so heights are readable
      L.push(
        new LineLayer({ id: 'ground', data: segs, getSourcePosition: (d) => [d.a[1], d.a[0], floor], getTargetPosition: (d) => [d.b[1], d.b[0], floor], getColor: [90, 90, 90, 160], getWidth: 2 }),
        new LineLayer({ id: 'curtain', data: segs.filter((_, k) => k % step === 0), getSourcePosition: (d) => [d.a[1], d.a[0], floor],
          getTargetPosition: (d) => pos(d.a, d.ai), getColor: (d) => [...d.color, 70], getWidth: 2, updateTriggers: { getTargetPosition: exag } }),
      );
    }
    // Rounded caps make the per-segment paths join up smoothly.
    const path = (d) => [pos(d.a, d.ai), pos(d.b, d.i)];
    L.push(new PathLayer({
      id: 'route-casing', data: segs, getPath: path, getColor: [0, 0, 0, 200], getWidth: 9, widthUnits: 'pixels', capRounded: true, jointRounded: true,
      parameters: { depthCompare: 'always' }, updateTriggers: { getPath: exag },
    }), new PathLayer({
      id: 'route', data: segs, pickable: true, getPath: path, getColor: (d) => [...d.color, 255], getWidth: 5, widthUnits: 'pixels', capRounded: true, jointRounded: true,
      parameters: { depthCompare: 'always' }, updateTriggers: { getPath: exag },
    }));
    if (sel != null) {
      L.push(new ScatterplotLayer({
        id: 'marker', data: [sel], getPosition: (k) => pos(latlng[k], k), getRadius: 9, radiusUnits: 'pixels',
        getFillColor: [255, 255, 255], getLineColor: [0, 0, 0], stroked: true, lineWidthMinPixels: 2,
        parameters: { depthCompare: 'always' }, updateTriggers: { getPosition: exag },
      }));
    }
    return L;
  }, [segs, exag, sel, terrain, basemap, latlng, altitude, minAlt, midAlt, extent, maxTileZoom]);

  useEffect(() => {
    const el = parent.current;
    const vp = new WebMercatorViewport({ width: el.clientWidth || 800, height: el.clientHeight || 600 })
      .fitBounds([[extent[0], extent[1]], [extent[2], extent[3]]], { padding: 20 });
    const minZoom = vp.zoom - 0.5;
    // Keep the camera inside the detailed area.
    const clamp = (v) => ({
      ...v,
      longitude: Math.min(Math.max(v.longitude, extent[0]), extent[2]),
      latitude: Math.min(Math.max(v.latitude, extent[1]), extent[3]),
      zoom: Math.min(Math.max(v.zoom, minZoom), MAX_ZOOM),
      pitch: Math.min(v.pitch, 80),
    });
    viewRef.current = { longitude: vp.longitude, latitude: vp.latitude, zoom: vp.zoom, pitch: 60, bearing: -20 };
    const deck = new Deck({
      parent: el,
      views: new MapView({ repeat: false }),
      viewState: viewRef.current,
      controller: true,
      onViewStateChange: ({ viewState }) => { viewRef.current = clamp(viewState); deck.setProps({ viewState: viewRef.current }); },
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
      onClick: (info) => { if (info.layer?.id === 'route') setSel(info.object.i); },
    });
    deckRef.current = deck;
    return () => { deck.finalize(); deckRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extent]);

  useEffect(() => { deckRef.current?.setProps({ layers }); }, [layers]);
  useEffect(() => { setSel(null); }, [streams]);

  // Elevation profile (click to select).
  const W = 300, H = 70, total = distance[n - 1] || 1, range = maxAlt - minAlt || 1;
  const px = (i) => (distance[i] / total) * W;
  const py = (a) => H - 4 - ((a - minAlt) / range) * (H - 8);
  const profile = altitude.map((a, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(a).toFixed(1)}`).join('');
  const pickProfile = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const target = ((e.clientX - r.left) / r.width) * total;
    let best = 0;
    for (let i = 0; i < n; i++) if (Math.abs(distance[i] - target) < Math.abs(distance[best] - target)) best = i;
    setSel(best);
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div ref={parent} style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#e8eef5, #fff)' }} />
      <div className="legend" style={{ bottom: 20, width: 320 }}>
        <b>{mode === 'grade' ? 'Grade' : 'Elevation'}</b> · {Math.round(minAlt)}–{Math.round(maxAlt)} m
        <div className="bar" style={{ background: RAMP_CSS, width: '100%' }} />
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" onClick={pickProfile} style={{ cursor: 'crosshair', background: '#f6f8fa', borderRadius: 4 }}>
          <path d={profile} fill="none" stroke="#fc4c02" strokeWidth="1.5" />
          {sel != null && <line x1={px(sel)} x2={px(sel)} y1="0" y2={H} stroke="#000" strokeWidth="1" />}
        </svg>
        {sel != null ? (
          <div>{(distance[sel] / 1000).toFixed(2)} km · {Math.round(altitude[sel])} m · grade {gradeAt(sel, altitude, distance).toFixed(1)}%</div>
        ) : <div>Click the route or the profile to inspect a point</div>}
        <label>Vertical exaggeration {exag.toFixed(1)}×
          <input type="range" min="1" max="6" step="0.5" value={exag} onChange={(e) => setExag(+e.target.value)} style={{ width: '100%' }} />
        </label>
        <div className="controls">
          {Object.entries(BASEMAPS).map(([k, b]) => (
            <button key={k} className={basemap === k ? 'active' : ''} onClick={() => setBasemap(k)}>{b.label}</button>
          ))}
        </div>
        <label><input type="checkbox" checked={terrain} onChange={(e) => setTerrain(e.target.checked)} /> Terrain</label>
        <div style={{ color: '#666', fontSize: 10 }}>{BASEMAPS[basemap].credit} · Terrain: Mapzen/AWS</div>
        <div style={{ color: '#666' }}>Drag to pan · right-drag (or Ctrl-drag) to rotate and tilt · scroll to zoom</div>
      </div>
    </div>
  );
}
