import { icon, round, compass, nextRainText } from '../format.js';
import StationStrip from './stations/StationStrip.jsx';
import { t, lang, condLabel } from '../i18n.js';

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
          <div className="condition">{kidMode && lang() === 'en' ? c.kidLabel : condLabel(c.code, c.label)}</div>
          <div className="feels">{t('Feels like {temp}', { temp: `${round(c.feelsLike)}${units.temp}` })}</div>
        </div>
      </div>
      <div className="current-sub">
        {today && <span>{t('H {high}° · L {low}°', { high: round(today.high), low: round(today.low) })}</span>}
        <span>💨 {round(c.windSpeed)} {units.wind} {compass(c.windDir)}{c.windGust > c.windSpeed + 5 ? `, ${t('gusts {n}', { n: round(c.windGust) })}` : ''}</span>
        {today && <span>☔ {t('{n}% chance', { n: round(today.precipChance) })}</span>}
      </div>
      {rain && <p className="nowcast">⏱️ {rain}</p>}
      <StationStrip units={units.temp === '°C' ? 'metric' : 'imperial'} kidMode={kidMode} />
    </section>
  );
}
