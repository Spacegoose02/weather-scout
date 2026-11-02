// "On this day": past years' weather for today's date, records, normals and how
// today compares. See providers/history.js for the sources.
import * as history from './providers/history.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export function registerHistory(app, { cache, fetchImpl, latLonSchema, loc, forecast, settle }) {
  app.get('/api/history/today', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    const fc = await settle(forecast(l));
    const today = fc?.daily?.[0] || null;
    // Today's date where the place is, not where the server is.
    const date = today?.time || new Date(Date.now() + (fc?.utcOffsetSeconds || 0) * 1000).toISOString().slice(0, 10);
    const monthDay = date.slice(5, 10);
    const thisYear = Number(date.slice(0, 4));
    const lastYear = thisYear - 1;
    // ERA5 is about 25 km across, so places within ~10 km share one download.
    const near = { lat: Math.round(l.lat * 10) / 10, lon: Math.round(l.lon * 10) / 10 };

    return cache.wrap(`hist:${l.lat},${l.lon},${l.units}:${date}`, 30 * MIN, async () => {
      const [archive, official] = await Promise.all([
        cache.wrap(`hist-arc:${near.lat},${near.lon}:${lastYear}`, 7 * DAY, () => history.getArchive(near, fetchImpl, { lastYear })),
        settle(cache.wrap(`hist-acis:${l.lat},${l.lon}:${monthDay}:${lastYear}`, DAY, () => history.getOfficial(l, monthDay, lastYear, fetchImpl))),
      ]);
      const day = history.analyzeDay(archive, {
        monthDay,
        thisYear,
        units: l.units,
        official,
        today: today ? { high: today.high, low: today.low, precip: today.precipTotal, icon: today.icon, kidLabel: today.kidLabel } : null,
      });
      if (!day) {
        const err = new Error('No history for this place yet.');
        err.statusCode = 404;
        throw err;
      }
      return {
        date,
        ...day,
        today: today ? { high: today.high, low: today.low, precip: today.precipTotal, icon: today.icon, label: today.label, kidLabel: today.kidLabel } : null,
        source: official ? `NOAA ACIS (${official.station.name}) and Open-Meteo Historical (ERA5)` : 'Open-Meteo Historical (ERA5 reanalysis)',
      };
    });
  });
}
