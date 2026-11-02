// Kid Mode brain: turns raw numbers into an outfit for the raccoon mascot, a
// morning gear checklist, a playground/recess rating and "Why is this
// happening?" mini-lessons. Pure functions, so they are easy to test.
import { isThunder, isSnow, isFreezing, isWet } from './weathercodes.js';

// Work internally in °F, mph and inches regardless of display units.
function imperial(forecast) {
  const metric = forecast.units?.temp === '°C';
  const t = (v) => (v == null ? v : metric ? v * 9 / 5 + 32 : v);
  const w = (v) => (v == null ? v : metric ? v / 1.609 : v);
  const p = (v) => (v == null ? v : metric ? v / 25.4 : v);
  const c = forecast.current;
  return {
    temp: t(c.temp), feelsLike: t(c.feelsLike), dewPoint: t(c.dewPoint), wind: w(c.windSpeed), gust: w(c.windGust),
    uv: c.uv, code: c.code, isDay: c.isDay, humidity: c.humidity, pressure: c.pressure, pressureTrend: c.pressureTrend3h,
    cloudCover: c.cloudCover,
    next12: (forecast.hourly || []).slice(0, 12).map((h) => ({ ...h, temp: t(h.temp), feelsLike: t(h.feelsLike), windGust: w(h.windGust), precip: p(h.precip) })),
    rain6h: p(forecast.recent?.precipLast6h ?? 0),
    rain24h: p(forecast.recent?.precipLast24h ?? 0),
  };
}

export function outfit(forecast) {
  const x = imperial(forecast);
  const maxChance = Math.max(0, ...x.next12.map((h) => h.precipChance ?? 0));
  const minFeels = Math.min(x.feelsLike ?? 99, ...x.next12.map((h) => h.feelsLike ?? 99));
  const maxUv = Math.max(x.uv ?? 0, ...x.next12.map((h) => h.uv ?? 0));
  const snowy = isSnow(x.code) || x.next12.some((h) => isSnow(h.code));
  const items = new Set();
  if (maxChance >= 60 || isWet(x.code)) items.add('raincoat').add('boots');
  if (minFeels < 35) items.add('beanie').add('mittens').add('winter-coat');
  else if (minFeels < 55 && !items.has('raincoat')) items.add('jacket');
  if (snowy) items.add('snow-boots').add('beanie').add('mittens');
  if (maxUv >= 6 && x.isDay && maxChance < 60) items.add('sunglasses').add('sun-hat');
  if ((x.temp ?? 0) >= 80 && maxChance < 60) items.add('t-shirt');
  let mood = 'happy';
  if (isThunder(x.code)) mood = 'worried';
  else if (minFeels < 20) mood = 'shivering';
  else if ((x.feelsLike ?? 0) >= 95) mood = 'hot';
  return { items: [...items], mood, maxPrecipChance: maxChance, minFeelsLike: Math.round(minFeels), maxUv: Math.round(maxUv) };
}

const CHECKLIST_ITEMS = {
  raincoat: ['🧥', 'Rain jacket', 'Good chance of rain today.'],
  boots: ['🥾', 'Rain boots', 'Puddles ahead!'],
  umbrella: ['☂️', 'Umbrella', 'Rain is likely.'],
  'winter-coat': ['🧥', 'Warm coat', 'It feels freezing outside.'],
  jacket: ['🧥', 'Light jacket', 'It is a bit chilly.'],
  beanie: ['🧢', 'Warm hat', 'Keep your ears warm.'],
  mittens: ['🧤', 'Mittens or gloves', 'Cold fingers are no fun.'],
  'snow-boots': ['🥾', 'Snow boots', 'Snow is around.'],
  sunglasses: ['🕶️', 'Sunglasses', 'The sun is strong.'],
  'sun-hat': ['👒', 'Sun hat', 'Shade for your face.'],
  sunscreen: ['🧴', 'Sunscreen', 'UV is high enough to burn.'],
  water: ['💧', 'Water bottle', 'It is hot, stay hydrated.'],
  't-shirt': ['👕', 'T-shirt weather', 'Warm and nice!'],
};

export function gearChecklist(forecast) {
  const o = outfit(forecast);
  const keys = new Set(o.items);
  if (o.maxPrecipChance >= 50) keys.add('umbrella');
  if (o.maxUv >= 5) keys.add('sunscreen');
  const x = imperial(forecast);
  if ((x.feelsLike ?? 0) >= 85) keys.add('water');
  return [...keys]
    .filter((k) => CHECKLIST_ITEMS[k])
    .map((k) => ({ id: k, emoji: CHECKLIST_ITEMS[k][0], label: CHECKLIST_ITEMS[k][1], why: CHECKLIST_ITEMS[k][2] }));
}

export function playgroundRating(forecast, { alerts = [], air = null } = {}) {
  const x = imperial(forecast);
  const red = [];
  const yellow = [];
  const serious = alerts.filter((a) => a.severity === 'Extreme' || a.severity === 'Severe');
  if (serious.length) red.push(`There is a ${serious[0].event}.`);
  if (isThunder(x.code) || x.next12.slice(0, 2).some((h) => isThunder(h.code))) red.push('Thunder and lightning nearby. When thunder roars, go indoors!');
  if ((x.feelsLike ?? 50) < 15) red.push('It feels dangerously cold.');
  if ((x.feelsLike ?? 50) >= 103) red.push('It is dangerously hot.');
  if (isFreezing(x.code)) red.push('Ice makes the playground slippery.');
  if ((air?.aqi ?? 0) > 150) red.push('The air is not healthy to breathe hard outside.');
  if ((x.gust ?? 0) >= 45) red.push('Wind gusts are strong enough to knock things over.');

  if ((x.rain6h ?? 0) >= 0.1 || isWet(x.code)) yellow.push('It has been raining, so it may be wet or muddy.');
  if ((x.feelsLike ?? 50) < 32) yellow.push('It is cold, so bundle up.');
  if ((x.feelsLike ?? 50) >= 90 && (x.feelsLike ?? 50) < 103) yellow.push('It is hot, so take water breaks in the shade.');
  if ((x.uv ?? 0) >= 8) yellow.push('The sun is very strong. Wear sunscreen.');
  if ((x.gust ?? 0) >= 30 && (x.gust ?? 0) < 45) yellow.push('It is pretty windy.');
  if ((air?.aqi ?? 0) > 100 && (air?.aqi ?? 0) <= 150) yellow.push('Air is a bit hazy. Kids with asthma should take it easy.');

  if (red.length) return { rating: 'red', label: 'Inside day', emoji: '🏠', reasons: red };
  if (yellow.length) return { rating: 'yellow', label: 'Okay, with care', emoji: '⚠️', reasons: yellow };
  return { rating: 'green', label: 'Great for playing outside!', emoji: '🛝', reasons: ['Dry, comfy and safe. Have fun!'] };
}

export function lessons(forecast, { alerts = [] } = {}) {
  const x = imperial(forecast);
  const out = [];
  const add = (id, emoji, title, body) => out.push({ id, emoji, title, body });
  if ([45, 48].includes(x.code)) {
    add('fog', '🌫️', 'Why is it foggy?', 'Fog is a cloud touching the ground. When the air cools down to the dew point, the water vapor in it turns into tiny droplets you can see.');
  }
  if (isThunder(x.code)) {
    add('thunder', '⚡', 'What makes thunder?', 'Lightning heats the air hotter than the surface of the sun in a split second. The air expands so fast it makes a BOOM. Count seconds between flash and boom, then divide by 5 to get miles away.');
  }
  if (isSnow(x.code)) {
    add('snow', '❄️', 'How do snowflakes form?', 'High in a cold cloud, water vapor freezes onto a speck of dust and grows six arms. No two snowflakes take the exact same path, so no two look exactly alike.');
  }
  if (isWet(x.code) && !isThunder(x.code)) {
    add('rain', '🌧️', 'Where does rain come from?', 'Clouds are made of trillions of tiny water droplets. When they bump together and grow too heavy to float, they fall as rain.');
  }
  if (x.pressureTrend != null && x.pressureTrend <= -2) {
    add('pressure-low', '📉', 'Pressure is dropping', 'Air pressure is the weight of the air above you. When it drops quickly, air is rising, which often means clouds, rain or storms are on the way.');
  } else if (x.pressureTrend != null && x.pressureTrend >= 2) {
    add('pressure-high', '📈', 'Pressure is rising', 'Rising pressure means air is sinking. Sinking air dries out and clears the sky, so nicer weather is usually coming.');
  }
  if ((x.dewPoint ?? 0) >= 65) {
    add('muggy', '💦', 'Why does it feel sticky?', 'The dew point tells you how much water is in the air. Above 65°F, sweat cannot dry off your skin very well, so you feel sticky and hot.');
  }
  if ((x.wind ?? 0) >= 15 || (x.gust ?? 0) >= 25) {
    add('wind', '💨', 'What makes wind?', 'Wind is air moving from high pressure to low pressure, like air rushing out of a balloon. The bigger the difference, the stronger the wind.');
  }
  if ((x.uv ?? 0) >= 6) {
    add('uv', '☀️', 'What is the UV index?', 'The sun sends invisible ultraviolet light that can burn skin. A UV index of 6 or more means you can burn in under 30 minutes without sunscreen.');
  }
  if (x.feelsLike != null && x.temp != null && x.temp - x.feelsLike >= 5) {
    add('windchill', '🥶', 'Why does it feel colder than it is?', 'Wind blows away the thin layer of warm air around your body. That is called wind chill, and it makes you lose heat faster.');
  }
  if (alerts.length) {
    add('alerts', '📢', 'Who sends weather alerts?', 'Meteorologists at the National Weather Service watch radar and satellites all day and night. A watch means "be ready", a warning means "take action now".');
  }
  if (!out.length && (x.cloudCover ?? 100) < 30) {
    add('blue-sky', '🔵', 'Why is the sky blue?', 'Sunlight has every color in it. Tiny bits of air scatter blue light much more than red light, so blue comes at your eyes from every direction.');
  }
  if (!out.length) {
    add('clouds', '☁️', 'What are clouds made of?', 'Clouds are made of tiny water droplets or ice crystals, so small and light that they float on rising air.');
  }
  return out;
}

export function skyTimes(forecast, now = Date.now()) {
  const today = forecast.daily?.[0];
  if (!today?.sunset) return null;
  const offset = forecast.utcOffsetSeconds ?? null;
  const toEpoch = (t) => (offset == null ? Date.parse(t) : Date.parse(`${t}Z`) - offset * 1000);
  const sunset = toEpoch(today.sunset);
  const sunrise = toEpoch(today.sunrise);
  const tonight = (forecast.hourly || []).filter((h) => !h.isDay).slice(0, 4);
  const clouds = tonight.length ? tonight.reduce((s, h) => s + (h.cloudCover ?? 0), 0) / tonight.length : null;
  return {
    sunrise: today.sunrise,
    sunset: today.sunset,
    goldenHourStartsAt: new Date(sunset - 60 * 60_000).toISOString(),
    minutesToSunset: Math.round((sunset - now) / 60_000),
    minutesToSunrise: Math.round((sunrise - now) / 60_000),
    stargazing: clouds == null ? null : clouds < 30
      ? { good: true, text: 'Clear skies tonight. Great for spotting stars, planets and the Moon!' }
      : { good: false, text: 'Clouds will probably hide the stars tonight.' },
  };
}

export function kidReport(forecast, ctx = {}) {
  return {
    raccoon: outfit(forecast),
    checklist: gearChecklist(forecast),
    playground: playgroundRating(forecast, ctx),
    lessons: lessons(forecast, ctx),
    sky: skyTimes(forecast),
  };
}
