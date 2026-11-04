import { snowTotals, roadIce, snowDayOdds, snowText, snowDayWord, ICE_LEVELS } from '../../../../shared/winter.js';

const clock = (t) => {
  if (!t) return '';
  const [d, hm] = t.split('T');
  const h = Number(hm.slice(0, 2));
  const day = new Date(`${d}T12:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
  return `${day} ${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};

// Winter & roads: snow on the way, when roads could ice over and the chance of a
// snow day or delay for the next school morning. All from the forecast.
export default function WinterCard({ weather, kidMode, size, now = Date.now() }) {
  const fc = weather.forecast;
  const snow = snowTotals(fc, now);
  const ice = roadIce(fc, now);
  const day = snowDayOdds(fc, now);
  const lvl = ICE_LEVELS[ice.level];
  const quiet = !snow.next48 && ice.level === 'none' && !day.chance;
  return (
    <section className={`card dash-winter ${size} ${ice.level === 'high' || day.chance >= 50 ? 'alarm' : ''}`}>
      <div className="card-title"><h2>❄️ {kidMode ? 'Snow & ice' : 'Winter & roads'}</h2></div>
      {quiet && <p>{kidMode ? 'No snow or ice coming in the next two days.' : 'No snow or road ice in the next 48 hours.'}</p>}
      {!quiet && (
        <div className="winter-grid">
          <div className="winter-tile">
            <span className="winter-label">Snow, next 24 h</span>
            <b className="winter-big">{snow.next24 ? `${snow.next24}${snow.unit === 'in' ? '″' : ' cm'}` : '0'}</b>
            <span className="hint">{snow.next48 > snow.next24 ? `${snow.next48}${snow.unit === 'in' ? '″' : ' cm'} in 48 h` : snowText(snow.next24, snow.unit)}{snow.start ? ` · starts ${clock(snow.start)}` : ''}</span>
          </div>
          <div className="winter-tile">
            <span className="winter-label">Road ice</span>
            <b className="winter-big" style={{ color: lvl.color }}>{lvl.label}</b>
            <span className="hint">{ice.worst ? `${ice.worst.why}, from ${clock(ice.first.time)}` : 'Roads should stay clear of ice'}</span>
          </div>
          <div className="winter-tile">
            <span className="winter-label">{kidMode ? 'Snow day chance' : 'Snow day or delay'} ({day.name})</span>
            {day.chance == null
              ? <span className="hint">{day.reason}</span>
              : (
                <>
                  <b className="winter-big">{day.chance}%</b>
                  <span className="snowday-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={day.chance} aria-label="Snow day chance"><i style={{ width: `${day.chance}%` }} /></span>
                  <span className="hint">{snowDayWord(day.chance)} · {day.reason}</span>
                </>
              )}
          </div>
        </div>
      )}
      {kidMode && ice.level !== 'none' && <p className="storm-kid">{lvl.kid}</p>}
      {!kidMode && <p className="source">From the hourly forecast. The snow day chance is a rough guess from overnight snow, ice and bus-time cold; your district decides, and places that rarely see snow close for less.</p>}
    </section>
  );
}
