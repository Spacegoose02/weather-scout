import { round, pressureWord } from '../format.js';

const uvWord = (uv) => (uv == null ? '' : uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme');
const dewWord = (d, metric) => {
  const f = metric ? d * 9 / 5 + 32 : d;
  return f < 50 ? 'Dry' : f < 60 ? 'Comfortable' : f < 65 ? 'Getting humid' : f < 70 ? 'Sticky' : 'Oppressive';
};

export default function Details({ weather }) {
  const { current: c, units, recent } = weather.forecast;
  const air = weather.air;
  const metric = units.temp === '°C';
  const tiles = [
    ['Dew point', `${round(c.dewPoint)}${units.temp}`, dewWord(c.dewPoint, metric)],
    ['Humidity', `${round(c.humidity)}%`, ''],
    ['Pressure', `${round(c.pressure)} ${units.pressure}`, pressureWord(c.pressureTrend3h)],
    ['UV index', round(c.uv), uvWord(c.uv)],
    ['Air quality', air?.aqi != null ? round(air.aqi) : '–', air?.category?.label || 'Unavailable', air?.category?.color],
    ['Rain, last 24h', `${recent.precipLast24h} ${units.precip}`, ''],
    ['Visibility', c.visibility != null ? (metric ? `${round(c.visibility / 1000)} km` : `${round(c.visibility / 1609)} mi`) : '–', ''],
    ['Cloud cover', `${round(c.cloudCover)}%`, ''],
  ];
  return (
    <section className="card details" aria-label="Details">
      {tiles.map(([label, value, note, color]) => (
        <div className="tile" key={label}>
          <div className="tile-label">{label}</div>
          <div className="tile-value">
            {color && <i className={`dot ${color}`} aria-hidden />} {value}
          </div>
          {note && <div className="tile-note">{note}</div>}
        </div>
      ))}
      {air?.pm25 != null && (
        <div className="tile wide">
          <div className="tile-label">Particles & ozone</div>
          <div className="tile-note">PM2.5 {round(air.pm25)} · PM10 {round(air.pm10)} · Ozone {round(air.ozone)} µg/m³</div>
        </div>
      )}
    </section>
  );
}
