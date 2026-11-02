// Storm Center: how big storms work, how they are measured, and how to stay safe,
// paired with what is live near you right now.

export const HAZARDS = [
  {
    id: 'tornado', emoji: '🌪️', title: 'Tornadoes', noun: 'tornado', color: '#8e7cc3',
    alerts: /tornado/i,
    kid: 'A tornado is a spinning tube of wind that reaches from a thunderstorm cloud all the way down to the ground. It is the fastest wind on Earth!',
    adult: 'A tornado is a violently rotating column of air in contact with the ground and a cumuliform cloud. Most strong tornadoes come from supercells, thunderstorms with a persistent rotating updraft called a mesocyclone.',
    forms: [
      { kid: 'Winds near the ground blow one way, and winds up high blow faster another way. That makes the air roll like a pencil between your hands.', adult: 'Vertical wind shear creates horizontal vorticity in the low levels.' },
      { kid: 'A strong storm\'s updraft tips that rolling air up on its end, so the whole storm starts spinning.', adult: 'A strong updraft tilts and stretches that vorticity into the vertical, forming a mesocyclone 2–6 miles wide.' },
      { kid: 'The spin tightens like a figure skater pulling in their arms, and it reaches down to the ground.', adult: 'Interaction with the rear-flank downdraft concentrates rotation near the surface; stretching spins it up (conservation of angular momentum) into a tornado.' },
    ],
    scale: { name: 'Enhanced Fujita (EF) scale', rows: [
      ['EF0', '65–85 mph', 'Broken branches, shingles off'],
      ['EF1', '86–110 mph', 'Windows broken, mobile homes pushed over'],
      ['EF2', '111–135 mph', 'Roofs torn off, big trees snapped'],
      ['EF3', '136–165 mph', 'Walls of houses knocked down'],
      ['EF4', '166–200 mph', 'Well-built houses flattened'],
      ['EF5', 'Over 200 mph', 'Houses swept away'],
    ] },
    safety: [
      'Go to the lowest floor, in a small room in the middle of the building, away from windows (a closet, bathroom or basement).',
      'Get under something sturdy and cover your head and neck with your arms, a pillow or a bike helmet.',
      'If you are in a car or mobile home, get to a sturdy building if you can.',
      'Know the difference: a Tornado WATCH means get ready. A Tornado WARNING means take shelter NOW.',
    ],
    facts: [
      'The United States gets more tornadoes than any other country, about 1,200 a year.',
      'Tornado Alley stretches across Texas, Oklahoma, Kansas and Nebraska, and "Dixie Alley" covers the Southeast.',
      'Doppler radar can see a storm spinning before a tornado forms, which gives people time to hide.',
    ],
    quiz: { q: 'A Tornado WARNING means…', options: ['Tornadoes might happen later', 'Take shelter right now', 'The tornado is over'], answer: 1, why: 'A warning means a tornado is happening or about to. Go to your safe place!' },
    links: [{ label: 'Storm Prediction Center outlooks', url: 'https://www.spc.noaa.gov/' }, { label: 'Ready.gov tornado safety', url: 'https://www.ready.gov/tornadoes' }],
  },
  {
    id: 'wildfire', emoji: '🔥', title: 'Wildfires', noun: 'fire weather or smoke', color: '#e76f51',
    alerts: /red flag|fire weather|fire warning|smoke/i,
    kid: 'A wildfire is a big fire burning in a forest, grassland or brush. Hot, dry and windy weather helps wildfires spread really fast.',
    adult: 'Wildfires are unplanned fires in vegetation. Weather drives fire behavior through fuel moisture, wind and atmospheric stability, and large fires can even create their own weather, including pyrocumulonimbus clouds and fire whirls.',
    forms: [
      { kid: 'Fire needs three things: fuel (dry plants), heat (a spark) and air. That is called the fire triangle.', adult: 'Ignition requires fuel, heat and oxygen. Most U.S. wildfires (about 85%) are started by people; lightning starts most of the rest.' },
      { kid: 'When it has not rained in a while, grass and leaves get dry like paper and catch fire easily.', adult: 'Low relative humidity and drought dry out fine fuels within hours and heavy fuels over weeks, raising fire danger.' },
      { kid: 'Strong wind blows sparks far ahead and feeds the fire more air, so it moves faster than you can run.', adult: 'Wind tilts flames onto unburned fuel and lofts embers that start spot fires up to a mile ahead. Fire also spreads faster uphill.' },
    ],
    scale: { name: 'Fire danger rating', rows: [
      ['Low', 'Green', 'Fires do not start or spread easily'],
      ['Moderate', 'Blue', 'Fires can start from open flames'],
      ['High', 'Yellow', 'Fires start easily and spread fast'],
      ['Very high', 'Orange', 'Fires spread very fast and burn hot'],
      ['Extreme', 'Red', 'Fires explode and are very hard to fight'],
    ] },
    safety: [
      'During a Red Flag Warning, do not use anything that makes sparks or flames outside.',
      'Have a "go bag" ready and know two ways out of your neighborhood.',
      'If smoke is thick, stay inside with windows closed and run an air purifier if you have one.',
      'Leave right away when officials say to evacuate. Do not wait!',
    ],
    facts: [
      'Some pine cones only open and drop their seeds after a fire!',
      'Giant fires can make their own thunderstorm clouds called pyrocumulonimbus.',
      'Smokey Bear has been reminding people to prevent wildfires since 1944.',
    ],
    quiz: { q: 'What are the three parts of the fire triangle?', options: ['Fuel, heat and air', 'Rain, snow and wind', 'Sun, moon and stars'], answer: 0, why: 'Take away any one of fuel, heat or air and the fire goes out.' },
    links: [{ label: 'Fire weather outlooks (SPC)', url: 'https://www.spc.noaa.gov/products/fire_wx/' }, { label: 'AirNow fire & smoke map', url: 'https://fire.airnow.gov/' }],
  },
  {
    id: 'hurricane', emoji: '🌀', title: 'Hurricanes', noun: 'hurricane or tropical storm', color: '#2a9d8f',
    alerts: /hurricane|tropical storm|storm surge/i,
    kid: 'A hurricane is a giant spinning storm that forms over warm ocean water. It can be hundreds of miles wide, with a calm "eye" in the middle!',
    adult: 'Hurricanes are tropical cyclones with sustained winds of at least 74 mph. They are heat engines powered by evaporation from warm seas, with a warm core, a clear eye surrounded by the eyewall, and spiral rainbands.',
    forms: [
      { kid: 'The ocean has to be as warm as bath water, at least 80 degrees.', adult: 'Sea surface temperatures of about 80 °F (26.5 °C) or more, through a deep layer, supply the heat and moisture.' },
      { kid: 'Warm, wet air rises up from the ocean and makes lots of thunderstorms.', adult: 'Rising air condenses and releases latent heat, warming the core, lowering surface pressure and drawing in more moist air.' },
      { kid: 'Earth spinning makes the storms twirl together into one big pinwheel.', adult: 'With low wind shear and enough Coriolis force (at least about 5° from the equator), the convection organizes around a closed low into a tropical depression, storm, and then hurricane.' },
    ],
    scale: { name: 'Saffir-Simpson scale', rows: [
      ['Tropical storm', '39–73 mph', 'Gets a name!'],
      ['Category 1', '74–95 mph', 'Some roof and tree damage'],
      ['Category 2', '96–110 mph', 'Big roof damage, power out for days'],
      ['Category 3', '111–129 mph', 'Major hurricane'],
      ['Category 4', '130–156 mph', 'Severe damage to homes'],
      ['Category 5', '157+ mph', 'Catastrophic damage'],
    ] },
    safety: [
      'Know if you live in an evacuation zone, and leave when told to.',
      'Storm surge (ocean water pushed onto land) is the most dangerous part. Run from water, hide from wind.',
      'Turn around, don\'t drown: never walk or drive through flood water.',
      'Have water, food, flashlights, batteries and medicine for at least 3 days.',
    ],
    facts: [
      'The same kind of storm is called a typhoon in the western Pacific and a cyclone in the Indian Ocean.',
      'Hurricane Hunters fly airplanes right into the eye to measure the storm.',
      'A big hurricane can release more energy in a day than all the power plants on Earth make in a year.',
    ],
    quiz: { q: 'What do hurricanes need to form?', options: ['Cold mountains', 'Warm ocean water', 'Lots of snow'], answer: 1, why: 'Hurricanes get their energy from warm ocean water.' },
    links: [{ label: 'National Hurricane Center', url: 'https://www.nhc.noaa.gov/' }, { label: 'Know your evacuation zone', url: 'https://www.ready.gov/hurricanes' }],
  },
];

export const hazardById = (id) => HAZARDS.find((h) => h.id === id) || HAZARDS[0];

// Alerts for your location that belong to this hazard.
export const hazardAlerts = (alerts = [], hazard) => alerts.filter((a) => hazard.alerts.test(a.event || ''));

// Great-circle distance in miles.
export function milesBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// Active tropical systems, nearest first, with distance from you.
export function nearbyStorms(storms = [], location) {
  return storms
    .filter((s) => s.lat != null && s.lon != null)
    .map((s) => ({ ...s, miles: location ? Math.round(milesBetween(location, s)) : null }))
    .sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity));
}
