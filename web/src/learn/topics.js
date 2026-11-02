// Learning library content. Every piece has a kid version (short, read-aloud friendly)
// and a grown-up version (the real science). Kept as plain data so it is easy to edit.

export const CLOUD_TYPES = [
  { id: 'cumulus', emoji: '☁️', name: 'Cumulus', level: 'Low', kid: 'Puffy cotton balls. Fair weather!', adult: 'Fair-weather convective clouds with flat bases, formed by thermals from daytime heating.', means: 'Nice weather now. If they keep growing taller in the afternoon, showers can pop up.' },
  { id: 'cumulonimbus', emoji: '⛈️', name: 'Cumulonimbus', level: 'Low to very high', kid: 'Giant tower clouds. The thunderstorm king!', adult: 'Deep convective clouds reaching the tropopause, often with an anvil top. They produce lightning, heavy rain, hail and sometimes tornadoes.', means: 'Thunderstorms. Head inside when you hear thunder.' },
  { id: 'stratus', emoji: '🌫️', name: 'Stratus', level: 'Low', kid: 'A gray blanket over the whole sky.', adult: 'A uniform low layer formed by gentle lifting or cooling of moist air; fog is stratus at ground level.', means: 'Dull, gray skies and maybe drizzle.' },
  { id: 'nimbostratus', emoji: '🌧️', name: 'Nimbostratus', level: 'Low to middle', kid: 'Thick dark clouds that rain for hours.', adult: 'Thick, featureless layer produced by large-scale ascent ahead of warm fronts, with steady precipitation.', means: 'Long-lasting rain or snow.' },
  { id: 'altocumulus', emoji: '🐑', name: 'Altocumulus', level: 'Middle', kid: 'Little fluffy sheep in rows across the sky.', adult: 'Mid-level patches or rolls, often in bands. On a warm, humid morning they can hint at afternoon storms.', means: 'Weather may change within a day.' },
  { id: 'altostratus', emoji: '🥛', name: 'Altostratus', level: 'Middle', kid: 'A milky sheet. The sun looks like it is behind frosted glass.', adult: 'Gray or bluish mid-level sheet, often thickening ahead of a warm front.', means: 'Rain or snow could arrive in the next 12 hours.' },
  { id: 'cirrus', emoji: '🪶', name: 'Cirrus', level: 'High', kid: 'Wispy feathers made of ice, way up high!', adult: 'High, thin ice-crystal clouds near 20,000–40,000 ft; their streaks show strong winds aloft.', means: 'Fair now, but a front may come in a day or two.' },
  { id: 'cirrostratus', emoji: '🌈', name: 'Cirrostratus', level: 'High', kid: 'A thin icy veil that can make a rainbow ring around the sun!', adult: 'A transparent ice sheet that produces 22° halos as light refracts through hexagonal crystals.', means: 'A halo often means rain within 24 hours.' },
];

export const TOPICS = [
  {
    id: 'clouds', emoji: '☁️', title: 'Clouds', kidTitle: 'Cloud Spotter', color: '#6aa9ff',
    kid: 'Clouds are made of trillions of tiny drops of water or bits of ice, so small and light that they float. Different shapes tell us different weather stories!',
    adult: 'Clouds form when air cools to its dew point, usually by rising, and water vapor condenses onto aerosols called cloud condensation nuclei. They are named by height (cirro- high, alto- middle, strato- low) and form (cumulus heaped, stratus layered, nimbus rain-bearing).',
    sections: [
      { title: 'How a cloud is born', kid: 'The sun warms the ground. Warm air rises like a hot-air balloon. As it goes up, it cools, and the water vapor turns into tiny droplets. Poof, a cloud!', adult: 'Rising air expands and cools at about 5.5 °F per 1,000 ft (dry adiabatic rate) until it saturates at the lifting condensation level, which is the flat base you see on cumulus clouds. Above that, it cools more slowly as condensation releases latent heat.' },
      { title: 'Why some clouds are dark', kid: 'Thick clouds are so full of water that sunlight cannot get through. That makes them look dark underneath, and that often means rain!', adult: 'Thin clouds scatter all wavelengths and look white. Deep clouds with large droplets scatter and absorb so much light that little reaches their base, so they look gray. Darkness tracks thickness and droplet size, not "dirtiness".' },
    ],
    facts: [
      'A puffy cumulus cloud can weigh about 1 million pounds, as much as 100 elephants!',
      'Clouds on other planets can be made of acid, ammonia or even metal.',
      'Contrails behind airplanes are clouds too, made when hot, wet engine exhaust freezes.',
    ],
    quiz: [
      { q: 'Which cloud brings thunderstorms?', options: ['Cirrus', 'Cumulonimbus', 'Stratus'], answer: 1, why: 'Cumulonimbus clouds grow as tall as 10 miles and make lightning.' },
      { q: 'What is fog?', options: ['Smoke', 'A cloud on the ground', 'Steam from the ocean'], answer: 1, why: 'Fog is a stratus cloud touching the ground.' },
    ],
    links: [{ label: 'NOAA SciJinks: clouds', url: 'https://scijinks.gov/clouds/' }],
  },
  {
    id: 'pressure', emoji: '🎈', title: 'Air, wind & pressure', kidTitle: 'Invisible Air', color: '#8bd3c7',
    kid: 'Air is invisible, but it is all around us and it has weight! It pushes on you all the time, and when it moves, we call it wind.',
    adult: 'Atmospheric pressure is the weight of the air column above you, about 14.7 psi or 1013 hPa at sea level. Horizontal differences in pressure drive wind, and the pattern of highs and lows organizes most day-to-day weather.',
    sections: [
      { title: 'Highs and lows', kid: 'HIGH pressure means air is sinking down. Sinking air dries out, so we get sunny days. LOW pressure means air is rising up. Rising air makes clouds, rain and storms.', adult: 'Highs are regions of subsidence and divergence near the surface, giving stable, clear weather. Lows feature convergence and ascent, producing clouds and precipitation. Fronts are the boundaries between air masses that wrap into lows.' },
      { title: 'Dew point and humidity', kid: 'The dew point is the temperature where air gets so full of water that it makes dew, fog or clouds. A high dew point makes it feel sticky.', adult: 'Dew point is an absolute measure of moisture: the temperature to which air must cool to saturate. Relative humidity compares actual moisture with the maximum at the current temperature, so it rises at night even when moisture is unchanged.' },
      { title: 'Where wind comes from', kid: 'Wind is air zooming from high pressure to low pressure. The closer the high and the low are, the faster the wind blows!', adult: 'The pressure-gradient force pushes air from high to low; Earth\'s rotation (Coriolis) deflects it to the right in the Northern Hemisphere, so winds circle highs clockwise and lows counterclockwise.' },
    ],
    facts: [
      'The air pressing on your body weighs about as much as a small car, but you do not feel it because the air inside you pushes back.',
      'The fastest wind ever measured (not in a tornado) was 253 mph during Cyclone Olivia in Australia.',
      'Your ears pop on an airplane because the air pressure changes as you go up.',
    ],
    quiz: [
      { q: 'High pressure usually brings…', options: ['Storms', 'Clear skies', 'Snow'], answer: 1, why: 'Sinking air in a high dries out, so skies clear.' },
      { q: 'Wind blows from…', options: ['High to low pressure', 'Low to high pressure', 'North to south'], answer: 0, why: 'Air always rushes from high pressure toward low pressure.' },
    ],
    links: [{ label: 'NWS JetStream: air pressure', url: 'https://www.weather.gov/jetstream/pressure' }],
  },
  {
    id: 'drought', emoji: '🏜️', title: 'Droughts & heat', kidTitle: 'Thirsty Land', color: '#e9a15b',
    kid: 'A drought is when it does not rain enough for a long, long time. Plants get thirsty, rivers shrink, and farmers have a hard time growing food.',
    adult: 'Drought is a prolonged precipitation deficit relative to normal. It is tracked in stages: meteorological (lack of rain), agricultural (soil moisture), hydrological (streams, reservoirs, groundwater) and socioeconomic (when water demand exceeds supply).',
    sections: [
      { title: 'How a drought starts', kid: 'Sometimes a big bubble of high pressure parks over one place and will not move. It pushes the rain clouds away, so the sun bakes the ground day after day.', adult: 'Persistent ridges of high pressure (blocking patterns) divert storm tracks. Dry soils then heat up more because less energy goes into evaporation, which strengthens the ridge: a feedback that can turn dry spells into flash droughts within weeks.' },
      { title: 'How we measure it', kid: 'Scientists make a map every week that colors places from yellow (a little dry) to dark red (super dry).', adult: 'The U.S. Drought Monitor, updated every Thursday, blends precipitation, soil moisture, streamflow, vegetation health and local reports into categories D0 (abnormally dry) to D4 (exceptional drought).' },
      { title: 'How you can help', kid: 'Turn off the water while you brush your teeth. Take shorter showers. Water plants in the morning when it is cool.', adult: 'Fix leaks, water landscaping early or late in the day, choose drought-tolerant native plants and follow local watering restrictions. Outdoor irrigation is often half of summer household water use.' },
    ],
    facts: [
      'The Dust Bowl drought in the 1930s made dust storms so big they darkened the sky in New York City.',
      'A dripping faucet can waste more than 3,000 gallons of water in a year.',
      'Some desert frogs can stay buried underground for years waiting for rain!',
    ],
    quiz: [
      { q: 'What is a drought?', options: ['Too much rain', 'Not enough rain for a long time', 'A big snowstorm'], answer: 1, why: 'A drought is a long stretch with much less rain than normal.' },
      { q: 'Which saves water?', options: ['Long showers', 'Turning off the tap while brushing', 'Watering plants at noon'], answer: 1, why: 'Turning off the tap can save about 8 gallons a day.' },
    ],
    links: [
      { label: 'U.S. Drought Monitor map', url: 'https://droughtmonitor.unl.edu/' },
      { label: 'Drought.gov for kids', url: 'https://www.drought.gov/education' },
    ],
  },
  {
    id: 'elnino', emoji: '🌊', title: 'El Niño & La Niña', kidTitle: 'The Ocean\'s Mood', color: '#4fb0c6', news: /el ni[ñn]o|la ni[ñn]a|\benso\b/i,
    kid: 'Far away in the Pacific Ocean, the water near the equator sometimes gets extra warm (El Niño) or extra cool (La Niña). That changes the weather all around the world, even here!',
    adult: 'The El Niño–Southern Oscillation (ENSO) is a coupled ocean–atmosphere cycle in the tropical Pacific. El Niño is a warm phase, La Niña a cool phase, recurring every 2 to 7 years and shifting the jet stream and storm tracks worldwide.',
    sections: [
      { title: 'What happens in El Niño', kid: 'The trade winds get tired and slow down. Warm water sloshes back toward South America, like water in a bathtub.', adult: 'Easterly trade winds weaken, the warm pool shifts east, and upwelling of cold water off Peru slows. Convection follows the warm water, which reshapes global circulation. NOAA declares El Niño when the Niño-3.4 region runs at least 0.5 °C above normal.' },
      { title: 'What it means for the U.S.', kid: 'In El Niño winters, the South usually gets wetter and the North stays warmer. La Niña is often the opposite!', adult: 'El Niño winters tend to be wetter and cooler across the southern U.S. and milder and drier in the northern tier, with fewer Atlantic hurricanes. La Niña favors a drier South, a colder, snowier North and Ohio Valley, and a more active Atlantic hurricane season.' },
      { title: 'Why the name?', kid: 'Fishermen in Peru noticed warm water around Christmas, so they named it El Niño, which means "the little boy" in Spanish.', adult: 'Peruvian fishermen named the warm current around December "El Niño de Navidad." La Niña ("the little girl") was coined later for the opposite phase.' },
    ],
    facts: [
      'El Niño can make the whole planet warmer for a year.',
      'Strong El Niños can bring floods to Peru and droughts to Australia at the same time.',
      'Scientists watch the ocean with a giant network of floating robots called Argo floats.',
    ],
    quiz: [
      { q: 'El Niño means the Pacific Ocean near the equator is…', options: ['Warmer than normal', 'Colder than normal', 'Frozen'], answer: 0, why: 'El Niño is the warm phase. La Niña is the cool phase.' },
      { q: 'La Niña often means the Atlantic has…', options: ['More hurricanes', 'No weather', 'Fewer hurricanes'], answer: 0, why: 'La Niña weakens the winds that tear hurricanes apart.' },
    ],
    links: [
      { label: 'NOAA ENSO blog (latest outlook)', url: 'https://www.climate.gov/news-features/blogs/enso' },
      { label: 'Climate Prediction Center ENSO status', url: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/' },
    ],
  },
  {
    id: 'ocean', emoji: '🐢', title: 'Ocean creatures & our planet', kidTitle: 'Save the Ocean', color: '#3a9ad9',
    kid: 'The ocean covers most of our planet. It makes a lot of the air we breathe and helps keep Earth from getting too hot. The creatures living in it need our help!',
    adult: 'The ocean covers about 71% of Earth, has absorbed roughly 90% of the excess heat from greenhouse gases and about a quarter of human CO₂ emissions, and phytoplankton produce about half of Earth\'s oxygen. Warming, acidification and pollution are reshaping marine life.',
    creatures: [
      { emoji: '🐢', name: 'Sea turtles', kid: 'The temperature of the sand decides if baby turtles are boys or girls! Warmer sand means more girls.', adult: 'Sea turtle sex is set by nest temperature; warming beaches are skewing populations female. Six of seven species are threatened or endangered.' },
      { emoji: '🪸', name: 'Coral reefs', kid: 'Corals are tiny animals that build giant reef cities. When the water gets too hot, they turn white and can get sick.', adult: 'Marine heat waves expel the symbiotic algae corals rely on, causing bleaching. Reefs cover under 1% of the seafloor but support about a quarter of marine species.' },
      { emoji: '🐋', name: 'Whales', kid: 'Whale poop helps feed tiny ocean plants that make the air we breathe!', adult: 'Whales recycle iron and nitrogen to surface waters, fertilizing phytoplankton blooms that draw down carbon.' },
      { emoji: '🐧', name: 'Penguins', kid: 'Emperor penguins need sea ice to raise their chicks. Less ice makes it harder for them.', adult: 'Emperor penguins breed on stable fast ice; record-low Antarctic sea ice has caused breeding failures at several colonies.' },
      { emoji: '🦠', name: 'Plankton', kid: 'Tiny plankton you can barely see make about half of the oxygen on Earth!', adult: 'Phytoplankton perform about half of global photosynthesis and form the base of nearly every marine food web.' },
    ],
    sections: [
      { title: 'The ocean and the weather', kid: 'Warm ocean water is fuel for hurricanes. The ocean also stores heat in summer and lets it out in winter, which keeps beach towns milder.', adult: 'Sea surface temperatures above about 80 °F (26.5 °C) are needed for tropical cyclones. The ocean\'s heat capacity moderates coastal climates and drives circulation like the Gulf Stream.' },
      { title: 'How you can help', kid: 'Use a reusable water bottle, pick up trash at the beach or park, and turn off lights you are not using. Every little bit helps!', adult: 'Cut single-use plastics, choose sustainable seafood (look for MSC or Seafood Watch ratings), reduce energy use, keep storm drains clean (they flow to waterways) and join local cleanups.' },
    ],
    facts: [
      'More people have walked on the Moon than have been to the deepest part of the ocean.',
      'The blue whale is the biggest animal that has ever lived, even bigger than dinosaurs.',
      'An octopus has three hearts and blue blood!',
    ],
    quiz: [
      { q: 'How much of Earth\'s oxygen comes from the ocean?', options: ['Almost none', 'About half', 'All of it'], answer: 1, why: 'Tiny plankton make about half of the oxygen we breathe.' },
      { q: 'What makes corals turn white?', options: ['Water that is too hot', 'Too many fish', 'Moonlight'], answer: 0, why: 'Hot water makes corals lose the algae that feed them. That is called bleaching.' },
    ],
    links: [
      { label: 'NOAA Ocean Service for kids', url: 'https://oceanservice.noaa.gov/kids/' },
      { label: 'Seafood Watch', url: 'https://www.seafoodwatch.org/' },
    ],
  },
];

export const topicById = (id) => TOPICS.find((t) => t.id === id) || null;

// The cloud you are most likely looking at, from today's weather code.
export function likelyCloud(code, cover) {
  if (code >= 95) return 'cumulonimbus';
  if (code === 45 || code === 48) return 'stratus';
  if ((code >= 61 && code <= 67) || (code >= 71 && code <= 77)) return 'nimbostratus';
  if (code >= 51 && code <= 57) return 'stratus';
  if (code >= 80) return 'cumulus';
  if (code === 3 || cover >= 85) return 'altostratus';
  if (code === 2 || cover >= 30) return 'cumulus';
  if (cover > 5) return 'cirrus';
  return null;
}
