import { useEffect, useMemo, useRef } from 'react';
import { skyScene, sceneCaption } from '../../learn/sky.js';
import SpeakButton from '../kid/SpeakButton.jsx';

// A live, animated picture of the sky outside: clouds drift at the real wind speed and
// direction, rain or snow falls at the real intensity, and lightning flashes in storms.
const rand = (a, b) => a + Math.random() * (b - a);

function makeCloud(w, h, x) {
  const scale = rand(0.6, 1.3);
  return {
    x: x ?? rand(-120, w),
    y: rand(h * 0.05, h * 0.45),
    scale,
    speed: rand(0.7, 1.3) * (1.4 - scale * 0.4), // smaller (farther) clouds drift a bit slower
    puffs: Array.from({ length: 5 }, (_, i) => ({ dx: i * 22 - 44 + rand(-6, 6), dy: rand(-14, 4), r: rand(18, 32) })),
  };
}

function skyGradient(ctx, h, s) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (!s.isDay) {
    g.addColorStop(0, '#0b1330');
    g.addColorStop(1, '#27345e');
  } else {
    const d = s.darkness;
    g.addColorStop(0, `rgb(${Math.round(90 - d * 30)}, ${Math.round(160 - d * 80)}, ${Math.round(235 - d * 110)})`);
    g.addColorStop(1, `rgb(${Math.round(190 - d * 70)}, ${Math.round(220 - d * 90)}, ${Math.round(250 - d * 110)})`);
  }
  return g;
}

export default function SkyScene({ weather, kidMode }) {
  const { current, units } = weather.forecast;
  const scene = useMemo(() => skyScene(current, units), [current, units]);
  const caption = sceneCaption(scene, kidMode);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let clouds = [];
    let drops = [];
    let stars = [];
    let flash = 0;
    let nextBolt = rand(2, 6);
    let bolt = null;
    let raf = 0;
    let last = performance.now();
    let visible = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clouds = Array.from({ length: scene.clouds }, () => makeCloud(w, h));
      drops = Array.from({ length: scene.drops }, () => ({ x: rand(0, w), y: rand(0, h), v: rand(0.8, 1.2), wob: rand(0, 6.28) }));
      stars = scene.stars ? Array.from({ length: 50 }, () => ({ x: rand(0, w), y: rand(0, h * 0.6), r: rand(0.5, 1.6), tw: rand(0, 6.28) })) : [];
    };

    const drawCloud = (c) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      const shade = scene.lightning ? 120 : Math.round(255 - scene.darkness * 150);
      ctx.fillStyle = scene.isDay ? `rgba(${shade}, ${shade}, ${shade + 5}, 0.92)` : 'rgba(150, 160, 190, 0.55)';
      ctx.beginPath();
      for (const p of c.puffs) {
        ctx.moveTo(p.dx + p.r, p.dy);
        ctx.arc(p.dx, p.dy, p.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    };

    const makeBolt = () => {
      const pts = [[rand(w * 0.15, w * 0.85), h * 0.3]];
      while (pts.at(-1)[1] < h * 0.92) {
        const [x, y] = pts.at(-1);
        pts.push([x + rand(-28, 28), y + rand(18, 40)]);
      }
      return pts;
    };

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const t = now / 1000;
      ctx.fillStyle = skyGradient(ctx, h, scene);
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 2 + s.tw)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (scene.sun || !scene.isDay) {
        ctx.fillStyle = scene.isDay ? '#ffd65a' : '#f3f1e6';
        ctx.shadowColor = scene.isDay ? 'rgba(255, 210, 80, 0.8)' : 'rgba(255,255,255,0.5)';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(w * 0.8, h * 0.22, Math.min(w, h) * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Gusts make the clouds surge a little faster every few seconds.
      const gust = scene.gusty ? 1 + 0.6 * Math.max(0, Math.sin(t * 0.9)) : 1;
      for (const c of clouds) {
        c.x += scene.drift * c.speed * gust * dt;
        if (scene.drift > 0 && c.x - 90 * c.scale > w) Object.assign(c, makeCloud(w, h, -90 * c.scale));
        if (scene.drift < 0 && c.x + 90 * c.scale < 0) Object.assign(c, makeCloud(w, h, w + 90 * c.scale));
        drawCloud(c);
      }

      if (scene.precip) {
        const snow = scene.precip === 'snow';
        const fall = snow ? 45 : scene.precip === 'sleet' ? 380 : 520;
        const slant = (scene.drift / 3) * (snow ? 1.2 : 0.4);
        ctx.strokeStyle = scene.isDay ? 'rgba(40, 70, 130, 0.55)' : 'rgba(190, 210, 255, 0.55)';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (const d of drops) {
          d.y += fall * d.v * dt;
          d.x += slant * dt + (snow ? Math.sin(t * 1.5 + d.wob) * 12 * dt : 0);
          if (d.y > h) { d.y = rand(-20, 0); d.x = rand(-20, w + 20); }
          if (d.x > w + 20) d.x = -20;
          if (d.x < -20) d.x = w + 20;
          if (snow) {
            ctx.moveTo(d.x + 2.2, d.y);
            ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2);
          } else {
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + slant * 0.02, d.y + 12);
          }
        }
        if (snow) ctx.fill();
        else ctx.stroke();
      }

      if (scene.lightning && !reduced) {
        nextBolt -= dt;
        if (nextBolt <= 0) {
          bolt = makeBolt();
          flash = 1;
          nextBolt = rand(3, 9);
        }
        if (flash > 0) {
          ctx.fillStyle = `rgba(255,255,240,${flash * 0.45})`;
          ctx.fillRect(0, 0, w, h);
          if (bolt && flash > 0.5) {
            ctx.strokeStyle = '#fffbd0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
          flash -= dt * 2.5;
        }
      }

      // Ground.
      ctx.fillStyle = scene.precip === 'snow' ? '#eef3fb' : scene.isDay ? '#5fae5b' : '#1f3b2a';
      ctx.fillRect(0, h * 0.9, w, h * 0.1);

      if (scene.fog) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(225,228,236,0.55)');
        g.addColorStop(1, 'rgba(232,234,240,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(245,246,250,0.35)';
        for (let i = 0; i < 4; i++) {
          const y = h * (0.35 + i * 0.16);
          const x = ((t * (8 + i * 3) + i * 140) % (w + 300)) - 300;
          ctx.beginPath();
          ctx.ellipse(x + 150, y, 220, 18, 0, 0, Math.PI * 2);
          ctx.ellipse(((x + w / 2) % (w + 300)) - 150, y + 8, 200, 14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!reduced && visible) raf = requestAnimationFrame(frame);
    };

    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { resize(); if (reduced) frame(performance.now()); }) : null;
    ro?.observe(canvas);
    // Pause when scrolled away or the tab is hidden, to save battery.
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && !document.hidden;
      if (visible && !was && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }) : null;
    io?.observe(canvas);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
    };
  }, [scene]);

  return (
    <section className="card sky-scene">
      <h2 className="card-title">{kidMode ? 'Look at the sky right now!' : 'Live sky'}</h2>
      <canvas ref={canvasRef} className="sky-canvas" role="img" aria-label={caption} />
      <p className="sky-caption">{caption}</p>
      <p className="hint">Drawn from the latest conditions: cloud cover, wind speed and direction, and what is falling. The clouds move at the real wind speed.</p>
      <SpeakButton text={caption} />
    </section>
  );
}
