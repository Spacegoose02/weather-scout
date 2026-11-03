import { useEffect, useMemo, useRef } from 'react';
import { DBZ_SCALE, dbzColor, radarField, velocityColor, velocityField } from '../../../kid/chaser/radar.js';

const W = 200;
const H = 150;

// A pretend radar screen. Draws a scene (or the velocity view), and reports
// taps as { x: 0..1, y: 0..0.75 } so lessons can check "tap the hook".
export default function RadarScope({ scene, seed = 3, ox = 0, oy = 0, onTap, mark, label }) {
  const canvas = useRef();
  const velocity = scene === 'velocity';
  const field = useMemo(() => (velocity ? velocityField({ w: W, h: H }) : radarField(scene, { w: W, h: H, seed, ox, oy })), [scene, seed, ox, oy, velocity]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext?.('2d');
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    for (let k = 0; k < field.length; k += 1) {
      const col = velocity ? velocityColor(field[k]) : dbzColor(field[k]);
      const o = k * 4;
      if (col) {
        [img.data[o], img.data[o + 1], img.data[o + 2]] = col;
        img.data[o + 3] = 235;
      }
    }
    ctx.clearRect(0, 0, W, H);
    ctx.putImageData(img, 0, 0);
  }, [field, velocity]);

  const tap = (e) => {
    if (!onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    onTap({ x: (e.clientX - r.left) / r.width, y: ((e.clientY - r.top) / r.height) * 0.75 });
  };

  return (
    <figure className="radar-scope">
      <div className={`radar-screen ${onTap ? 'tappable' : ''}`} onClick={tap} role={onTap ? 'button' : 'img'} aria-label={label || 'Practice radar picture'}>
        <svg className="radar-map" viewBox="0 0 400 300" aria-hidden>
          <path d="M0 210 C80 190 140 240 220 215 S340 180 400 200" />
          <path d="M120 0 L135 300 M260 0 L280 300 M0 90 L400 100" className="county" />
          <circle cx="135" cy="96" r="4" /><text x="142" y="92">Maple</text>
          <circle cx="278" cy="200" r="4" /><text x="285" y="196">Riverton</text>
          <text x="370" y="22" className="north">N ↑</text>
          {velocity && <g className="dish"><circle cx="14" cy="150" r="7" /><text x="26" y="155">Radar</text></g>}
        </svg>
        <canvas ref={canvas} width={W} height={H} />
        {mark && (
          <svg className="radar-mark" viewBox="0 0 400 300" aria-hidden>
            <circle cx={mark.x * 400} cy={(mark.y / 0.75) * 300} r="14" className={mark.hit ? 'hit' : 'miss'} />
          </svg>
        )}
        <span className="radar-tag">{velocity ? 'VELOCITY' : 'REFLECTIVITY'} · practice radar</span>
      </div>
      <figcaption className="radar-legend" aria-label="Color key">
        {velocity ? (
          <>
            <span><i style={{ background: 'rgb(20,230,40)' }} /> Toward the radar</span>
            <span><i style={{ background: 'rgb(240,20,30)' }} /> Away from the radar</span>
          </>
        ) : (
          DBZ_SCALE.filter((_, i) => i % 2 === 1 || i === DBZ_SCALE.length - 1).map((s) => (
            <span key={s.min}><i style={{ background: `rgb(${s.color.join(',')})` }} /> {s.label}</span>
          ))
        )}
      </figcaption>
    </figure>
  );
}
