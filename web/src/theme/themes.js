// The color themes people can pick. Each one is a set of CSS variables in
// theme.css, keyed by id. Pure data and logic here so it can be tested.

// Two "modes" pick a real theme for you: the device setting, or Rocky
// choosing one that matches the weather outside right now.
export const MODES = [
  { id: 'auto', name: 'Match my device', emoji: '🌓', blurb: 'Light by day, dark when your device is in dark mode.' },
  { id: 'weather', name: 'Let Rocky pick', emoji: '🦝', blurb: 'Rocky changes the colors to match the weather outside.' },
];

export const THEMES = [
  // Everyday
  { id: 'light', group: 'everyday', name: 'Clear skies', emoji: '🌤️', dark: false, color: '#2f6fde', blurb: 'The classic bright blue look.' },
  { id: 'dark', group: 'everyday', name: 'Night sky', emoji: '🌙', dark: true, color: '#0f1522', blurb: 'Easy on the eyes at night.' },
  { id: 'contrast', group: 'everyday', name: 'High contrast', emoji: '🔳', dark: true, color: '#000000', blurb: 'Bold colors and thick lines, easiest to read.' },

  // Storms & weather
  { id: 'sunny', group: 'weather', name: 'Sunny summer', emoji: '☀️', dark: false, color: '#f59e0b', blurb: 'Warm yellows and oranges.' },
  { id: 'rainy', group: 'weather', name: 'Rainy day', emoji: '🌧️', dark: false, color: '#3d7ea6', blurb: 'Cool blues and wet slate.' },
  { id: 'cloudy', group: 'weather', name: 'Foggy morning', emoji: '🌫️', dark: false, color: '#7b8794', blurb: 'Soft silvers and grays.' },
  { id: 'thunderstorm', group: 'weather', name: 'Thunderstorm', emoji: '⛈️', dark: true, color: '#2a1f4a', blurb: 'Dark purple clouds with lightning yellow.' },
  { id: 'tornado', group: 'weather', name: 'Tornado alley', emoji: '🌪️', dark: true, color: '#2f3d2f', blurb: 'That eerie green storm sky.' },
  { id: 'hurricane', group: 'weather', name: 'Hurricane', emoji: '🌀', dark: true, color: '#12343b', blurb: 'Deep ocean teal with warning orange.' },
  { id: 'blizzard', group: 'weather', name: 'Blizzard', emoji: '❄️', dark: false, color: '#9ec9e8', blurb: 'Icy whites and frosty blues.' },
  { id: 'heatwave', group: 'weather', name: 'Heat wave', emoji: '🔥', dark: false, color: '#e2552c', blurb: 'Sizzling reds and desert sand.' },
  { id: 'aurora', group: 'weather', name: 'Aurora night', emoji: '🌌', dark: true, color: '#0b1d2a', blurb: 'Northern lights green and pink.' },

  // Rocky's themes: Rocky shows up dressed for the look.
  { id: 'rocky-forest', group: 'rocky', name: "Rocky's forest", emoji: '🌲', dark: false, color: '#3f7d30', blurb: 'Pine greens and bark browns, where Rocky lives.', outfit: ['jacket', 'boots'] },
  { id: 'rocky-campfire', group: 'rocky', name: "Rocky's campfire", emoji: '🏕️', dark: true, color: '#3a2216', blurb: 'Cozy night colors around the fire.', outfit: ['winter-coat', 'beanie'] },
  { id: 'rocky-chaser', group: 'rocky', name: 'Rocky the storm chaser', emoji: '🌩️', dark: true, color: '#1c2430', blurb: 'Storm gray with Rocky’s yellow raincoat.', outfit: ['raincoat', 'boots'] },
  { id: 'rocky-beach', group: 'rocky', name: "Rocky's beach day", emoji: '🏖️', dark: false, color: '#16a3b8', blurb: 'Sand, surf and sunshine.', outfit: ['t-shirt', 'swim-trunks', 'sunglasses', 'sun-hat'] },
  { id: 'rocky-snow', group: 'rocky', name: "Rocky's snow day", emoji: '⛄', dark: false, color: '#3a6ea5', blurb: 'Snowball fight colors.', outfit: ['winter-coat', 'mittens', 'beanie', 'snow-boots'] },
];

export const GROUPS = [
  ['everyday', 'Everyday'],
  ['weather', 'Storms & weather'],
  ['rocky', "Rocky's themes"],
];

const BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const themeById = (id) => BY_ID[id] || BY_ID.light;
export const isMode = (id) => MODES.some((m) => m.id === id);
export const DEFAULT_THEME = 'auto';

const SNOW = [71, 73, 75, 77, 85, 86];
const RAIN = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);

// Picks a theme for the weather right now and says why, in Rocky's words.
// Alerts win over conditions: a hurricane warning on a sunny morning is still
// a hurricane day.
export function weatherTheme(weather) {
  const c = weather?.forecast?.current || {};
  const events = (weather?.alerts || []).map((a) => String(a.event || '').toLowerCase());
  const alert = (re) => events.some((e) => re.test(e));
  const code = c.code ?? null;
  const night = c.isDay === false;
  const temp = c.temp;
  const metric = weather?.forecast?.units?.temp === '°C';
  const hot = temp != null && (metric ? temp >= 35 : temp >= 95);

  if (alert(/hurricane|tropical storm|storm surge/)) return { id: 'hurricane', why: 'There’s a tropical storm alert, so I switched to hurricane colors. Stay safe!' };
  if (alert(/tornado/)) return { id: 'tornado', why: 'There’s a tornado alert. Tornado colors are on. Get to your safe spot!' };
  if (alert(/blizzard|winter storm|ice storm/)) return { id: 'blizzard', why: 'A winter storm alert is out. Blizzard mode, bundle up!' };
  if (alert(/excessive heat|extreme heat|heat advisory/)) return { id: 'heatwave', why: 'It’s a heat alert day. Heat wave colors, and drink lots of water!' };
  if (code != null && code >= 95) return { id: 'thunderstorm', why: 'I hear thunder! Thunderstorm colors are on.' };
  if (code != null && SNOW.includes(code)) return { id: 'rocky-snow', why: 'It’s snowing! Time for my snow day look.' };
  if (code != null && RAIN(code)) return { id: 'rainy', why: 'It’s raining, so I picked rainy day colors.' };
  if (code === 45 || code === 48) return { id: 'cloudy', why: 'It’s foggy out there. Foggy morning colors!' };
  if (night) return code != null && code <= 1 ? { id: 'aurora', why: 'Clear night sky! Aurora colors for stargazing.' } : { id: 'dark', why: 'It’s nighttime, so I dimmed things down.' };
  if (hot) return { id: 'heatwave', why: 'It’s really hot today. Heat wave colors!' };
  if (code === 3) return { id: 'cloudy', why: 'Lots of clouds today, so I went with soft grays.' };
  if (code != null && code <= 1) return { id: 'sunny', why: 'The sun is out! Sunny summer colors.' };
  return { id: 'light', why: 'A nice regular day. Clear skies colors.' };
}

// Turns what the person picked into the theme that should be on screen.
export function resolveTheme(choice, { weather, systemDark = false } = {}) {
  const pick = choice || DEFAULT_THEME;
  if (pick === 'auto') return { id: systemDark ? 'dark' : 'light', why: '' };
  if (pick === 'weather') return weather ? weatherTheme(weather) : { id: systemDark ? 'dark' : 'light', why: '' };
  return { id: BY_ID[pick] ? pick : 'light', why: '' };
}
