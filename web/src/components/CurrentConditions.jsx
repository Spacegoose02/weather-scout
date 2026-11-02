import { icon, round, compass, nextRainText } from '../format.js';
import StationStrip from './stations/StationStrip.jsx';

export default function CurrentConditions({ weather, kidMode }) {
  const { current: c, units, daily, minutely } = weather.forecast;
  const today = daily[0];
  const rain = nextRainText(minutely);
  return (
    <section className="card current">
      <div className="current-main">
        <div className="big-icon" aria-hidden>{icon(c.icon, c.isDay)}</div>
        <div>
          <div className="temp">{round(c.temp)}<span>{units.temp}</span></div>
          <div className="condition">{kidMode ? c.kidLabel : c.label}</div>
          <div className="feels">Feels like {round(c.feelsLike)}{units.temp}</div>
        </div>
      </div>
      <div className="current-sub">
        {today && <span>H {round(today.high)}° · L {round(today.low)}°</span>}
        <span>💨 {round(c.windSpeed)} {units.wind} {compass(c.windDir)}{c.windGust > c.windSpeed + 5 ? `, gusts ${round(c.windGust)}` : ''}</span>
        {today && <span>☔ {round(today.precipChance)}% chance</span>}
      </div>
      {rain && <p className="nowcast">⏱️ {rain}</p>}
      <StationStrip units={units.temp === '°C' ? 'metric' : 'imperial'} kidMode={kidMode} />
    </section>
  );
}
