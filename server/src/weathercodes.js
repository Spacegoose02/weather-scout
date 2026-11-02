// WMO weather interpretation codes (used by Open-Meteo) with grown-up and
// kid-friendly descriptions.
const CODES = {
  0: ['Clear sky', 'Sunny and clear!', 'clear'],
  1: ['Mainly clear', 'Mostly sunny', 'clear'],
  2: ['Partly cloudy', 'Some clouds playing peekaboo', 'partly-cloudy'],
  3: ['Overcast', 'Cloudy all over', 'cloudy'],
  45: ['Fog', 'Foggy, like walking in a cloud', 'fog'],
  48: ['Freezing fog', 'Icy fog', 'fog'],
  51: ['Light drizzle', 'A tiny sprinkle', 'drizzle'],
  53: ['Drizzle', 'Drizzly', 'drizzle'],
  55: ['Heavy drizzle', 'Lots of drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'Icy sprinkles', 'sleet'],
  57: ['Heavy freezing drizzle', 'Icy sprinkles', 'sleet'],
  61: ['Light rain', 'A little rain', 'rain'],
  63: ['Rain', 'Rainy', 'rain'],
  65: ['Heavy rain', 'Pouring rain!', 'rain'],
  66: ['Freezing rain', 'Icy rain, slippery!', 'sleet'],
  67: ['Heavy freezing rain', 'Lots of icy rain', 'sleet'],
  71: ['Light snow', 'A few snowflakes', 'snow'],
  73: ['Snow', 'Snowy!', 'snow'],
  75: ['Heavy snow', 'Big snow!', 'snow'],
  77: ['Snow grains', 'Tiny snow grains', 'snow'],
  80: ['Rain showers', 'Rain showers', 'rain'],
  81: ['Heavy rain showers', 'Big rain showers', 'rain'],
  82: ['Violent rain showers', 'Super heavy rain', 'rain'],
  85: ['Snow showers', 'Snow showers', 'snow'],
  86: ['Heavy snow showers', 'Big snow showers', 'snow'],
  95: ['Thunderstorm', 'Thunderstorm! Stay inside', 'thunder'],
  96: ['Thunderstorm with hail', 'Thunder and hail! Stay inside', 'thunder'],
  99: ['Severe thunderstorm with hail', 'Big storm with hail! Stay inside', 'thunder'],
};

export function describeCode(code) {
  const c = CODES[code] || ['Unknown', 'Hmm, not sure', 'cloudy'];
  return { code, label: c[0], kidLabel: c[1], icon: c[2] };
}

export const isThunder = (code) => code >= 95;
export const isSnow = (code) => [71, 73, 75, 77, 85, 86].includes(code);
export const isFreezing = (code) => [48, 56, 57, 66, 67].includes(code);
export const isWet = (code) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
