// Turns the current conditions into numbers the animated sky scene can draw.
// Pure so it can be tested without a canvas.

const SNOW = [71, 73, 75, 77, 85, 86];
const FREEZING = [56, 57, 66, 67];
const HEAVY = [55, 57, 65, 67, 75, 82, 86, 99];
const LIGHT = [51, 56, 61, 71, 77, 80, 85];

export const toMph = (speed, unit) => {
  if (speed == null || Number.isNaN(speed)) return 0;
  if (unit === 'km/h') return speed / 1.609;
  if (unit === 'm/s') return speed * 2.237;
  if (unit === 'kn') return speed * 1.151;
  return speed;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Clouds move toward where the wind is blowing to (wind direction is where it comes FROM).
// On a side-on scene only the east/west part shows: a west wind (270°) pushes clouds right.
export function driftDirection(windDir) {
  if (windDir == null) return 1;
  const east = -Math.sin((windDir * Math.PI) / 180);
  if (Math.abs(east) < 0.15) return east >= 0 ? 0.25 : -0.25; // mostly north/south wind: slow sideways drift
  return east;
}

export function precipType(code) {
  if (SNOW.includes(code)) return 'snow';
  if (FREEZING.includes(code)) return 'sleet';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain';
  return null;
}

export function skyScene(current = {}, units = {}) {
  const code = current.code ?? 0;
  const mph = toMph(current.windSpeed, units.wind);
  const gustMph = toMph(current.windGust, units.wind);
  const cover = clamp(current.cloudCover ?? (code >= 3 ? 90 : code === 2 ? 45 : 10), 0, 100);
  const precip = precipType(code);
  const storm = code >= 95;
  const fog = code === 45 || code === 48;
  const intensity = !precip ? 0 : HEAVY.includes(code) ? 1 : LIGHT.includes(code) ? 0.35 : 0.65;
  // Real wind sets the speed. 1 mph is drawn as about 3 px/s, so a 10 mph breeze crosses a
  // phone screen in about 12 seconds; capped so hurricane winds stay watchable.
  const pxPerSec = clamp(mph * 3, 4, 220);
  return {
    isDay: current.isDay !== false,
    mph: Math.round(mph),
    gustMph: Math.round(gustMph),
    cloudCover: cover,
    clouds: Math.round((cover / 100) * 12),
    darkness: storm ? 0.65 : precip ? 0.25 + intensity * 0.25 : fog ? 0.2 : cover > 85 ? 0.18 : 0,
    drift: driftDirection(current.windDir) * pxPerSec,
    gusty: gustMph >= mph + 10,
    precip,
    intensity,
    drops: precip ? Math.round(40 + intensity * 220) : 0,
    lightning: storm,
    fog,
    stars: current.isDay === false && cover < 60,
    sun: current.isDay !== false && cover < 90 && !fog,
  };
}

// A one-sentence caption that explains what the picture shows.
export function sceneCaption(s, kid = false) {
  const parts = [];
  if (s.clouds === 0) parts.push(kid ? 'No clouds right now' : 'Clear sky');
  else parts.push(`${s.cloudCover}% cloud cover`);
  if (s.clouds > 0) parts.push(s.mph < 2 ? (kid ? 'clouds are barely moving' : 'calm winds') : `clouds drifting at ${s.mph} mph`);
  if (s.precip) parts.push(`${s.intensity >= 1 ? 'heavy ' : s.intensity < 0.5 ? 'light ' : ''}${s.precip === 'sleet' ? 'icy rain' : s.precip}`);
  if (s.lightning) parts.push(kid ? 'lightning (stay inside)' : 'thunderstorm');
  if (s.fog) parts.push('fog');
  if (s.gusty) parts.push(`gusts to ${s.gustMph} mph`);
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.';
}
