import React, { useState } from 'react';
import { PEAKS } from './peaks.js';
import RouteSpace from './RouteSpace.jsx';

const km = (m) => `${(m / 1000).toFixed(1)} km · ${(m / 1609.344).toFixed(1)} mi`;
const metres = (m) => `${Math.round(m).toLocaleString()} m · ${Math.round(m * 3.28084).toLocaleString()} ft`;

export default function App() {
  const [slug, setSlug] = useState(PEAKS[0].slug);
  const [mode, setMode] = useState('elevation');
  const peak = PEAKS.find((p) => p.slug === slug);
  const { stats } = peak;

  return (
    <div className="page">
      <header>
        <h1>Kate's Peaks</h1>
        <nav>
          {PEAKS.map((p) => (
            <button key={p.slug} className={p.slug === slug ? 'active' : ''} onClick={() => setSlug(p.slug)}>{p.name}</button>
          ))}
        </nav>
        <div className="modes">
          {['elevation', 'grade'].map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>Color by {m}</button>
          ))}
        </div>
      </header>
      <section className="info">
        <div>
          <h2>{peak.name}</h2>
          <div className="sub">{peak.place} · {peak.kind} · {peak.date}</div>
          <p>{peak.note}</p>
        </div>
        <dl>
          <div><dt>Distance</dt><dd>{km(stats.distance)}</dd></div>
          <div><dt>Gain</dt><dd>▲ {metres(stats.gain)}</dd></div>
          <div><dt>Descent</dt><dd>▼ {metres(stats.descent)}</dd></div>
          <div><dt>High / low</dt><dd>{metres(stats.high)} / {metres(stats.low)}</dd></div>
        </dl>
      </section>
      <main>
        <RouteSpace key={peak.slug} streams={peak.streams} mode={mode} />
      </main>
    </div>
  );
}
