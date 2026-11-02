// "Why is this happening?" micro-lessons built from the real numbers outside right now.
// Each lesson has a kid version, a grown-up version, the reading that triggered it,
// and the Learn topic to dig into next.

const r = (v) => (v == null || Number.isNaN(v) ? '–' : Math.round(v));
const isSnow = (c) => [71, 73, 75, 77, 85, 86].includes(c);
const isWet = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

export function whyLessons(forecast, { alerts = [] } = {}) {
  if (!forecast?.current) return [];
  const c = forecast.current;
  const u = forecast.units || {};
  const metric = u.temp === '°C';
  const toF = (v) => (v == null ? null : metric ? (v * 9) / 5 + 32 : v);
  const tempF = toF(c.temp);
  const dewF = toF(c.dewPoint);
  const feelsF = toF(c.feelsLike);
  const spreadF = tempF != null && dewF != null ? tempF - dewF : null;
  const deg = u.temp || '°';
  const spreadShown = spreadF == null ? null : metric ? r((spreadF * 5) / 9) : r(spreadF);
  const code = c.code ?? 0;
  const out = [];
  const add = (l) => out.push(l);

  // Fog and the dew point.
  if (code === 45 || code === 48 || (spreadF != null && spreadF <= 3 && (c.humidity ?? 0) >= 90)) {
    add({
      id: 'fog', emoji: '🌫️', topic: 'clouds', priority: 9,
      title: code === 45 || code === 48 ? 'Why is it foggy?' : 'Why might fog form?',
      reading: `Temperature ${r(c.temp)}${deg}, dew point ${r(c.dewPoint)}${deg}`,
      kid: `The air is ${r(c.temp)} degrees and the dew point is ${r(c.dewPoint)}. They are only ${spreadShown} ${spreadShown === 1 ? 'degree' : 'degrees'} apart! When air cools down to its dew point, it cannot hold all its water vapor, so the vapor turns into tiny droplets. Fog is just a cloud sitting on the ground.`,
      adult: `The temperature–dew point spread is only ${spreadShown}${deg} with ${r(c.humidity)}% relative humidity. Once air cools to its dew point it is saturated, and water vapor condenses on tiny aerosols into droplets small enough to stay suspended. Radiation fog forms on clear, calm nights as the ground loses heat; advection fog forms when moist air slides over a colder surface.`,
    });
  }

  // Thunder and lightning.
  if (code >= 95) {
    add({
      id: 'thunder', emoji: '⚡', topic: 'storms', priority: 10,
      title: 'Why is there lightning and thunder?',
      reading: c.label,
      kid: 'Inside a storm cloud, bits of ice and slushy hail crash into each other and build up static electricity, like rubbing your socks on a carpet. Lightning is a giant spark. It heats the air so fast that the air goes BOOM. That is thunder! Count the seconds from flash to boom and divide by 5 to see how many miles away it is.',
      adult: 'Collisions between graupel and ice crystals in the mixed-phase region of a cumulonimbus separate charge, leaving the upper cloud positive and the middle negative. When the field exceeds the breakdown strength of air, a stepped leader connects to an upward streamer. The return stroke heats the channel to roughly 30,000 °C (five times the Sun\'s surface), and the explosive expansion is thunder. Sound travels about a mile every 5 seconds, a kilometer every 3.',
    });
  }

  // Rain or snow.
  if (isSnow(code)) {
    add({
      id: 'snow', emoji: '❄️', topic: 'clouds', priority: 8,
      title: 'Why is it snowing instead of raining?',
      reading: `${c.label}, ${r(c.temp)}${deg}`,
      kid: 'Almost all rain starts as snow high up in the clouds! Today the air is cold all the way down to the ground, so the snowflakes never melt. Every flake grows six arms as water vapor freezes onto it.',
      adult: 'Most mid-latitude precipitation begins as ice through the Bergeron process. Snow reaches the ground when the whole column stays near or below freezing; a warm layer aloft would melt it into rain, sleet or freezing rain depending on how deep the cold layer is near the surface.',
    });
  } else if (isWet(code) && code < 95) {
    add({
      id: 'rain', emoji: '🌧️', topic: 'clouds', priority: 8,
      title: 'Why is it raining?',
      reading: `${c.label}${c.precip ? `, ${c.precip} ${u.precip || ''} in the last hour` : ''}`,
      kid: 'Clouds are made of trillions of teeny droplets. They bump into each other and join together. When a drop gets too heavy for the rising air to hold up, down it falls! A raindrop is about a million cloud droplets stuck together.',
      adult: 'Cloud droplets are around 10 microns across; a raindrop is about 2 mm, roughly a million times the volume. Drops grow by collision–coalescence in warm clouds, or begin as ice crystals that grow at the expense of supercooled droplets and melt on the way down. Rising air (fronts, terrain, daytime heating) keeps feeding the cloud.',
    });
  }

  // Air pressure: always explain highs and lows.
  const p = c.pressure;
  const trend = c.pressureTrend3h;
  if (p != null) {
    const high = p >= 1018;
    const low = p <= 1008;
    const trendText = trend == null ? '' : trend <= -1 ? `, falling ${Math.abs(trend)} hPa in 3 hours` : trend >= 1 ? `, rising ${trend} hPa in 3 hours` : ', steady';
    add({
      id: 'pressure', emoji: trend != null && trend <= -1 ? '📉' : trend != null && trend >= 1 ? '📈' : '🎈', topic: 'pressure',
      priority: (trend != null && Math.abs(trend) >= 2) || low ? 7 : 3,
      title: low ? 'Why is low pressure bringing clouds?' : high ? 'Why does high pressure mean nice weather?' : 'What is air pressure doing?',
      reading: `${r(p)} hPa${trendText}`,
      kid: `${low ? 'We are under LOW pressure. ' : high ? 'We are under HIGH pressure. ' : ''}Air has weight, and it pushes down on you all the time! When pressure is high, air is sinking, and sinking air dries out, so skies are usually clear. When pressure is low, air is rising, and rising air cools and makes clouds and rain.${trend != null && trend <= -2 ? ' Right now the pressure is dropping fast, so a change in the weather may be coming.' : ''}`,
      adult: `Sea-level pressure is ${r(p)} hPa (average is 1013)${trendText}. In a high, air converges aloft and subsides, warming adiabatically and suppressing cloud. In a low, surface convergence forces air upward, it cools to saturation, and clouds and precipitation develop. Air flows clockwise out of highs and counterclockwise into lows in the Northern Hemisphere. A fall of 2+ hPa in 3 hours often signals an approaching front or storm.`,
    });
  }

  // Muggy or dry air.
  if (dewF != null && dewF >= 65) {
    add({
      id: 'muggy', emoji: '💦', topic: 'pressure', priority: 5,
      title: 'Why does it feel so sticky?',
      reading: `Dew point ${r(c.dewPoint)}${deg}`,
      kid: 'The dew point tells us how much water is floating in the air. Today it is really high, so the air is already full of water. Your sweat cannot dry off your skin, and that is why you feel sticky.',
      adult: `A dew point of ${r(c.dewPoint)}${deg} means a lot of water vapor. Evaporative cooling from skin slows down because the vapor-pressure gradient is small, so it feels hotter than the thermometer says. Dew point is a better comfort gauge than relative humidity, which changes with temperature through the day.`,
    });
  } else if (dewF != null && dewF < 30) {
    add({
      id: 'dry', emoji: '🏜️', topic: 'drought', priority: 4,
      title: 'Why is the air so dry?',
      reading: `Dew point ${r(c.dewPoint)}${deg}, humidity ${r(c.humidity)}%`,
      kid: 'There is very little water vapor in the air today. That is why lips get chapped and you might get little shocks when you touch a doorknob!',
      adult: 'A low dew point means little water vapor. Dry air lets temperatures swing widely between day and night, boosts static electricity, and dries out vegetation, which raises fire danger when it is also windy.',
    });
  }

  // Wind.
  const windMph = u.wind === 'km/h' ? (c.windSpeed ?? 0) / 1.609 : c.windSpeed ?? 0;
  if (windMph >= 12 || (c.windGust ?? 0) > (c.windSpeed ?? 0) * 1.6 + 5) {
    add({
      id: 'wind', emoji: '💨', topic: 'pressure', priority: 6,
      title: 'Why is it so windy?',
      reading: `Wind ${r(c.windSpeed)} ${u.wind || ''}${c.windGust ? `, gusts ${r(c.windGust)}` : ''}`,
      kid: 'Wind is air rushing from high pressure to low pressure, like air zooming out of a balloon when you let go. The bigger the difference in pressure, the faster the air rushes!',
      adult: 'Wind is driven by the pressure-gradient force and turned by the Coriolis effect, so it blows nearly along isobars aloft and slightly toward low pressure near the ground, where friction slows it. Gusts come from turbulent eddies mixing faster air down from above, which is why it is often gustiest on sunny afternoons.',
    });
  }

  // Feels-like.
  if (feelsF != null && tempF != null && tempF - feelsF >= 5) {
    add({
      id: 'windchill', emoji: '🥶', topic: 'pressure', priority: 6,
      title: 'Why does it feel colder than it is?',
      reading: `${r(c.temp)}${deg}, feels like ${r(c.feelsLike)}${deg}`,
      kid: 'Your body keeps a thin blanket of warm air right next to your skin. Wind blows that warm blanket away, so you feel colder. That is called wind chill!',
      adult: 'Wind chill estimates heat loss from exposed skin. Wind strips away the insulating boundary layer of warm air, increasing convective heat loss, so skin cools as if the air were colder. It does not lower the actual temperature of objects below the air temperature.',
    });
  } else if (feelsF != null && tempF != null && feelsF - tempF >= 4 && tempF >= 80) {
    add({
      id: 'heatindex', emoji: '🥵', topic: 'drought', priority: 6,
      title: 'Why does it feel hotter than it is?',
      reading: `${r(c.temp)}${deg}, feels like ${r(c.feelsLike)}${deg}`,
      kid: 'When the air is hot AND full of water, your sweat cannot dry and cool you off. So your body feels even hotter. Drink lots of water and take shade breaks!',
      adult: 'The heat index combines temperature and humidity to estimate how hot it feels in the shade. High humidity slows sweat evaporation, the body\'s main cooling mechanism. Direct sun can add up to 15 °F more.',
    });
  }

  // Clouds.
  const cover = c.cloudCover;
  if (cover != null && code < 45) {
    const clear = cover < 25;
    add({
      id: clear ? 'blue' : 'clouds', emoji: clear ? '🔵' : '☁️', topic: 'clouds', priority: 2,
      title: clear ? (c.isDay === false ? 'Why is the sky so clear tonight?' : 'Why is the sky blue?') : 'Why are there clouds today?',
      reading: `${r(cover)}% cloud cover`,
      kid: clear
        ? (c.isDay === false
          ? 'With no clouds acting like a blanket, the ground lets its heat float away into space. Clear nights get chilly, but they are great for stargazing!'
          : 'Sunlight has every color of the rainbow in it. Tiny bits of air bounce blue light around much more than red light, so blue comes at your eyes from every direction!')
        : 'Clouds form when warm, wet air rises and cools. The cool air cannot hold all its water vapor, so the vapor turns into tiny droplets around specks of dust. Trillions of droplets together make a cloud!',
      adult: clear
        ? (c.isDay === false
          ? 'Without cloud cover, longwave radiation escapes directly to space, so surface temperatures drop quickly overnight. Clouds re-emit infrared back to the ground, which is why cloudy nights stay milder.'
          : 'Rayleigh scattering by nitrogen and oxygen molecules scales with 1/λ⁴, so blue light scatters about 5.5 times more than red. Near sunset, light crosses more atmosphere, the blue is scattered out, and reds and oranges remain.')
        : `With ${r(cover)}% of the sky covered, rising air is reaching saturation. Lift comes from daytime heating (cumulus), fronts and large-scale ascent (stratus and nimbostratus), or terrain (orographic clouds). The cloud type tells you how the air is moving.`,
    });
  }

  // UV.
  if ((c.uv ?? 0) >= 6) {
    add({
      id: 'uv', emoji: '☀️', topic: null, priority: 4,
      title: 'Why do I need sunscreen today?',
      reading: `UV index ${r(c.uv)}`,
      kid: 'The sun sends out invisible light called UV. Too much can burn your skin, even when you feel cool. Today the UV is strong, so wear sunscreen, a hat and sunglasses!',
      adult: `A UV index of ${r(c.uv)} means unprotected skin can burn in about 15–25 minutes. UV peaks near solar noon and is stronger at altitude and near water, sand and snow, which reflect it. Thin clouds block very little.`,
    });
  }

  if (alerts.length) {
    add({
      id: 'alerts', emoji: '📢', topic: 'storms', priority: 9,
      title: 'Who sends weather alerts?',
      reading: alerts.slice(0, 2).map((a) => a.event).join(', '),
      kid: 'Weather scientists at the National Weather Service watch radar and satellites all day and all night. A WATCH means "get ready". A WARNING means "do your safety steps now!"',
      adult: 'National Weather Service forecast offices issue watches (conditions favorable, be prepared), warnings (hazard occurring or imminent, act now) and advisories (less serious but inconvenient). Warnings for tornadoes and severe storms are drawn as polygons around the threat, not whole counties.',
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
