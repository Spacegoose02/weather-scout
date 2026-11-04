import { useEffect, useRef, useState } from 'react';
import { clockLabel, compass, hourLabel, nextRainText, round } from '../format.js';

// ---- Next 2 hours of rain, 15 minutes at a time ------------------------------
// Rates are per hour (the 15-minute amount x 4) so the bands mean the usual thing.
const RAIN_BANDS = { imperial: [0.1, 0.3], metric: [2.5, 7.6] }; // light < 0.1 in/h <= moderate < 0.3 <= heavy
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

// Why there are no pollen tiles (set by the server when Europe's free data has none).
const POLLEN_MISSING = {
  'needs-key': 'Pollen counts: the free data only covers Europe. An admin can add a Google Pollen key under Family & settings, 🌼 Pollen counts, to get US pollen.',
  failed: "Pollen counts: Google's pollen service didn't answer just now. Try again later.",
  'no-data': 'Pollen counts: there are none for this place yet.',
};

export function rainWord(rate, units) {
  const [light, heavy] = RAIN_BANDS[units] || RAIN_BANDS.imperial;
  if (!rate) return 'Dry';
  if (rate < light) return 'Light';
  if (rate < heavy) return 'Moderate';
  return 'Heavy';
}

export function RainNext({ forecast }) {
  const [sel, setSel] = useState(null);
  const m = forecast.minutely || [];
  if (!m.length) return null;
  const units = forecast.units.precip === 'mm' ? 'metric' : 'imperial';
  const rates = m.map((x) => (x.precip || 0) * 4);
  const [, heavy] = RAIN_BANDS[units];
  const top = Math.max(heavy * 1.2, ...rates);
  const W = 100 / m.length;
  const pick = sel ?? rates.findIndex((r) => r > 0);
  const cur = pick >= 0 ? m[pick] : null;
  const snow = (x) => SNOW_CODES.has(x.code);
  const minutesFrom = (i) => (i === 0 ? 'Now' : `${i * 15} min`);

  return (
    <section className="card rain-next" aria-label="Rain in the next 2 hours">
      <div className="card-title">
        <h2>⏱️ Next 2 hours</h2>
        <span className="hint">{nextRainText(m)}</span>
      </div>
      <div className="rain-bars" role="img" aria-label={m.map((x, i) => `${minutesFrom(i)}: ${rainWord(rates[i], units)}`).join(', ')} onMouseLeave={() => setSel(null)}>
        {[heavy, RAIN_BANDS[units][0]].map((b) => <div key={b} className="rain-grid" style={{ bottom: `${(b / top) * 100}%` }}><span>{b === heavy ? 'heavy' : 'light'}</span></div>)}
        {m.map((x, i) => (
          <button
            key={x.time}
            className={`rain-bar ${snow(x) ? 'snow' : ''} ${pick === i ? 'sel' : ''}`}
            style={{ left: `${i * W}%`, width: `${W}%` }}
            onMouseEnter={() => setSel(i)}
            onFocus={() => setSel(i)}
            onClick={() => setSel(i)}
            aria-label={`${minutesFrom(i)}: ${rainWord(rates[i], units)}`}
          >
            <i style={{ height: `${Math.max(rates[i] ? 4 : 0, (rates[i] / top) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="rain-axis">{m.map((x, i) => <span key={x.time} style={{ width: `${W}%` }}>{i % 2 === 0 ? (i === 0 ? 'Now' : clockLabel(x.time).replace(':00', '')) : ''}</span>)}</div>
      <p className="tile-note">
        {cur
          ? <>{clockLabel(cur.time)}: <strong>{rainWord(rates[pick], units)} {snow(cur) ? 'snow' : 'rain'}</strong>{rates[pick] ? `, about ${rates[pick].toFixed(units === 'metric' ? 1 : 2)} ${forecast.units.precip} an hour` : ''}.</>
          : 'Dry skies for the next 2 hours. 15-minute steps from Open-Meteo, updated every 10 minutes.'}
      </p>
    </section>
  );
}

// ---- Air quality & UV breakdown ---------------------------------------------
const AQI_BANDS = [[50, 'green'], [100, 'yellow'], [150, 'orange'], [200, 'red'], [300, 'purple'], [Infinity, 'maroon']];
const aqiColor = (v) => (v == null ? '' : AQI_BANDS.find(([max]) => v <= max)[1]);
const UV_BANDS = [[2, 'green', 'Low'], [5, 'yellow', 'Moderate'], [7, 'orange', 'High'], [10, 'red', 'Very high'], [Infinity, 'purple', 'Extreme']];
const uvBand = (v) => UV_BANDS.find(([max]) => (v ?? 0) <= max + 0.49);
const NAMES = { pm25: 'PM2.5', pm10: 'PM10', ozone: 'Ozone', no2: 'NO₂' };

export function sunscreenWindow(hourly, day) {
  const hrs = hourly.filter((h) => h.time.startsWith(day) && (h.uv ?? 0) >= 3);
  if (!hrs.length) return null;
  return { from: hrs[0].time, to: hrs.at(-1).time, peak: Math.max(...hrs.map((h) => h.uv)) };
}

export function AirUv({ air, forecast }) {
  const [hover, setHover] = useState(null);
  if (!air) return null;
  const today = forecast.current.time?.slice(0, 10) || '';
  const hourly = air.hourly || [];
  const sun = sunscreenWindow(hourly, today);
  const subs = Object.entries(air.subIndex || {}).filter(([, v]) => v != null);
  const strip = hourly.slice(0, 48);
  const hov = hover != null ? strip[hover] : null;
  return (
    <section className="card air-uv" aria-label="Air quality and UV">
      <div className="card-title"><h2>🫁 Air & UV</h2><span className="hint">{air.source}</span></div>
      <div className="air-top">
        <div className={`aqi-badge ${aqiColor(air.aqi)}`}><b>{round(air.aqi)}</b><span>US AQI</span></div>
        <div>
          <strong>{air.category?.label || 'Unavailable'}</strong>
          <div className="tile-note">{air.category?.kid}</div>
          {air.main && <div className="tile-note">Main pollutant: <strong>{air.main.name}</strong>. {air.main.kid}</div>}
        </div>
      </div>

      {subs.length > 0 && (
        <div className="sub-bars" aria-label="Air quality index by pollutant">
          {subs.map(([k, v]) => (
            <div key={k} className="sub-row">
              <span className="sub-name">{NAMES[k]}</span>
              <span className="sub-track"><i className={`fill ${aqiColor(v)}`} style={{ width: `${Math.min(100, (v / 200) * 100)}%` }} /></span>
              <span className="sub-val">{round(v)}</span>
            </div>
          ))}
          <div className="tile-note">Each bar is that pollutant's own AQI. The overall AQI is the highest one. 0–50 good, 51–100 moderate, over 100 unhealthy for some.</div>
        </div>
      )}

      {strip.length > 0 && (
        <div className="strips" onMouseLeave={() => setHover(null)}>
          {[['Air quality', (h) => aqiColor(h.aqi)], ['UV', (h) => (h.uv >= 0.5 ? uvBand(h.uv)[1] : 'none')]].map(([label, fn]) => (
            <div key={label} className="strip-row">
              <span className="strip-label">{label}</span>
              <div className="strip" style={{ gridTemplateColumns: `repeat(${strip.length}, 1fr)` }}>
                {strip.map((h, i) => <i key={h.time} className={`cell ${fn(h)} ${hover === i ? 'sel' : ''}`} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
              </div>
            </div>
          ))}
          <div className="strip-row"><span className="strip-label" />
            <div className="strip-axis" style={{ gridTemplateColumns: `repeat(${strip.length}, 1fr)` }}>
              {strip.map((h, i) => <span key={h.time}>{i % 6 === 0 ? hourLabel(h.time) : ''}</span>)}
            </div>
          </div>
          <div className="tile-note strip-read" aria-live="polite">
            {hov ? <>{hourLabel(hov.time)}: AQI <strong>{round(hov.aqi)}</strong> · UV <strong>{round(hov.uv)}</strong> {hov.uv >= 0.5 ? `(${uvBand(hov.uv)[2]})` : ''}</> : 'Next 48 hours. Hover or tap an hour.'}
          </div>
        </div>
      )}

      <div className="details air-tiles">
        <div className="tile">
          <div className="tile-label">🧴 Sunscreen</div>
          <div className="tile-value">{sun ? `${clockLabel(sun.from).replace(':00', '')}–${clockLabel(sun.to).replace(':00', '')}` : 'Not needed'}</div>
          <div className="tile-note">{sun ? `UV peaks at ${round(sun.peak)} (${uvBand(sun.peak)[2].toLowerCase()}) today. Hat and shades too!` : 'UV stays low today.'}</div>
        </div>
        {air.pollen && ['tree', 'grass', 'weed'].map((k) => (
          <div className="tile" key={k}>
            <div className="tile-label">{k === 'tree' ? '🌳' : k === 'grass' ? '🌾' : '🌼'} {k[0].toUpperCase() + k.slice(1)} pollen</div>
            <div className="tile-value">{air.pollen[k].level || '–'}</div>
            <div className="tile-note">{air.pollen[k].value == null ? '' : air.pollen.unit === 'index' ? `Index ${round(air.pollen[k].value)} of ${air.pollen.scaleMax || 5}` : `${round(air.pollen[k].value)} grains/m³`}</div>
          </div>
        ))}
      </div>
      {air.pollen?.source && air.pollen.unit === 'index' && <p className="hint">Pollen: {air.pollen.source}, today's index from 0 (none) to {air.pollen.scaleMax || 5} (very high).</p>}
      {!air.pollen && <p className="hint">{POLLEN_MISSING[air.pollenMissing] || POLLEN_MISSING['no-data']}</p>}
    </section>
  );
}

// ---- Wind ---------------------------------------------------------------
export function windWord(mph) {
  if (mph == null) return '';
  if (mph < 4) return 'Calm';
  if (mph < 13) return 'Breezy';
  if (mph < 25) return 'Windy';
  if (mph < 39) return 'Very windy';
  return 'Dangerous winds';
}

export function useWidth(initial = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Wind({ forecast }) {
  const [hover, setHover] = useState(null);
  const [box, W] = useWidth();
  const c = forecast.current;
  const u = forecast.units;
  const metric = u.wind === 'km/h';
  const toMph = (v) => (v == null ? null : metric ? v / 1.609 : v);
  const hrs = forecast.hourly.slice(0, 24);
  if (!hrs.length) return null;
  const max = Math.max(10, ...hrs.map((h) => h.windGust ?? h.windSpeed ?? 0)) * 1.1;
  const H = 130;
  const x = (i) => 30 + (i / (hrs.length - 1)) * (W - 40);
  const y = (v) => 8 + (1 - v / max) * (H - 28);
  const line = (k) => hrs.map((h, i) => (h[k] == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h[k]).toFixed(1)}`)).join('');
  const kite = toMph(c.windSpeed) >= 8 && toMph(c.windGust ?? c.windSpeed) <= 25;
  const hv = hover != null ? hrs[hover] : null;
  const ticks = [0, Math.round(max / 2), Math.round(max * 0.9)];
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(hrs.length - 1, Math.round(((px - 30) / (W - 40)) * (hrs.length - 1)))));
  };
  return (
    <section className="card wind" aria-label="Wind">
      <div className="card-title"><h2>🌬️ Wind</h2><span className="hint">{windWord(toMph(c.windSpeed))}{kite ? ' · Good kite weather! 🪁' : ''}</span></div>
      <div className="wind-top">
        <svg className="rose" viewBox="-50 -50 100 100" role="img" aria-label={`Wind from the ${compass(c.windDir)} at ${round(c.windSpeed)} ${u.wind}`}>
          <circle r="44" className="rose-ring" />
          {['N', 'E', 'S', 'W'].map((d, i) => <text key={d} x={Math.sin(i * Math.PI / 2) * 36} y={-Math.cos(i * Math.PI / 2) * 36 + 4} textAnchor="middle" className="rose-dir">{d}</text>)}
          {/* Arrow points where the wind is blowing to (from + 180°). */}
          <g transform={`rotate(${(c.windDir ?? 0) + 180})`}><path d="M0,-26 L8,4 L0,-2 L-8,4 Z" className="rose-arrow" /><line y1="-2" y2="22" className="rose-tail" /></g>
        </svg>
        <div>
          <div className="tile-value">{round(c.windSpeed)} <small>{u.wind}</small></div>
          <div className="tile-note">From the {compass(c.windDir) || '–'}{c.windGust ? `, gusts to ${round(c.windGust)} ${u.wind}` : ''}</div>
          <div className="tile-note">Today's strongest gust: {round(forecast.daily[0]?.gustMax)} {u.wind}</div>
        </div>
      </div>
      <div className="wind-chart" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Wind and gusts, next 24 hours" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <g key={t}><line x1="30" x2={W - 10} y1={y(t)} y2={y(t)} className="grid" /><text x="24" y={y(t) + 4} textAnchor="end" className="axis">{t}</text></g>)}
          {hrs.map((h, i) => (i % (W < 420 ? 8 : 6) === 0 ? <text key={h.time} x={x(i)} y={H - 4} textAnchor="middle" className="axis">{hourLabel(h.time)}</text> : null))}
          <path d={line('windGust')} className="series gust" />
          <path d={line('windSpeed')} className="series speed" />
          {hv && <line x1={x(hover)} x2={x(hover)} y1="8" y2={H - 20} className="cross" />}
        </svg>
        <div className="legend-row">
          <span><i className="key speed" /> Wind</span><span><i className="key gust" /> Gusts</span>
          <span className="tile-note" aria-live="polite">{hv ? `${hourLabel(hv.time)}: ${round(hv.windSpeed)} ${u.wind}, gusts ${round(hv.windGust)} from the ${compass(hv.windDir)}` : `${u.wind}, next 24 hours`}</span>
        </div>
      </div>
    </section>
  );
}
