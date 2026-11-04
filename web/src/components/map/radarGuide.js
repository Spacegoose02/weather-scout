// Color scales and plain-language guides for the radar products. The server
// lists the products; this file explains what each one is showing.

export const LEGENDS = {
  dbz: { label: 'Rain & snow', stops: ['#04e9e7', '#019ff4', '#0300f4', '#02fd02', '#01c501', '#008e00', '#fdf802', '#e5bc00', '#fd9500', '#fd0000', '#d40000', '#bc0000', '#f800fd', '#9854c6'], ends: ['light', 'heavy', 'hail'] },
  eet: { label: 'Storm tops', stops: ['#5ebaff', '#00d1c1', '#26d000', '#f4f400', '#ff9900', '#ff0000', '#c0007f'], ends: ['10k ft', '30k', '50k+ ft'] },
  rain1: { label: 'Rain in the last hour', stops: ['#cbe4ff', '#6bb6ff', '#2a78d6', '#1baf7a', '#eda100', '#e34948', '#9b2fae'], ends: ['a little', '', 'a lot'] },
  rain24: { label: 'Rain in the last 24 hours', stops: ['#cbe4ff', '#6bb6ff', '#2a78d6', '#1baf7a', '#eda100', '#e34948', '#9b2fae'], ends: ['a little', '', 'a lot'] },
  vel: { label: 'Wind speed', stops: ['#b4ffb4', '#00e000', '#008a00', '#3c5a3c', '#777777', '#5a3c3c', '#9a0000', '#e00000', '#ffb4b4'], ends: ['fast toward radar', 'calm', 'fast away'] },
  cc: { label: 'How alike', stops: ['#1a1a6e', '#2f2fc8', '#8a8ae6', '#4cc6f0', '#3fd03f', '#ffff00', '#ff9900', '#ff0000', '#b0006e'], ends: ['all mixed up (debris?)', 'rain + hail', 'all the same'] },
  zdr: { label: 'Shape', stops: ['#3a3a3a', '#8c8c8c', '#cfcfcf', '#3c78ff', '#00c000', '#ffff00', '#ff8c00', '#ff0000', '#ff6bd8'], ends: ['round (hail)', '', 'flat (big drops)'] },
  kdp: { label: 'Water in the air', stops: ['#d8d8d8', '#8ccfff', '#2a78d6', '#00b000', '#ffff00', '#ff8c00', '#ff0000', '#c000c0'], ends: ['a little', '', 'buckets'] },
};

export const legendFor = (product) => LEGENDS[product?.legend] || LEGENDS.dbz;

// "What am I looking at?" for each product. `look` lists the patterns worth
// hunting for; `pair` names the product to flip to for a second opinion.
export const GUIDES = {
  site: {
    emoji: '🌧️',
    title: 'Reflectivity: how much is falling',
    body: 'The radar sends out a pulse and listens for the echo. More rain, snow or hail sends back a stronger echo and a brighter color.',
    look: ['Red, pink or purple cores: very heavy rain or hail.', 'A hook shape curling off the back of a storm can mean it is spinning.'],
    pair: 'velocity',
  },
  velocity: {
    emoji: '🟢🔴',
    title: 'Velocity: which way the wind blows',
    body: 'This map shows wind, not rain. Green means the wind inside the storm is blowing toward the radar dish. Red means it is blowing away. Brighter means faster.',
    look: [
      'Bright green touching bright red is a spin, called a couplet. Rotating storms can make tornadoes.',
      'A big splash of bright color spreading out from one spot can be a downburst (microburst): a strong push of wind hitting the ground.',
      'Gray and dull colors mean the wind is calm or moving sideways to the radar.',
    ],
    pair: 'srv',
  },
  srv: {
    emoji: '🌀',
    title: 'Storm-relative velocity: wind inside the storm',
    body: 'Storms move, and that movement can hide the spin. This view takes away the storm\'s own motion, like watching a merry-go-round while riding along with it, so the spin inside stands out.',
    look: [
      'A tight green-and-red pair is a rotating storm (a mesocyclone). The tighter and brighter it is, the stronger the spin.',
      'Forecasters watch for this to decide when to send a tornado warning.',
    ],
    pair: 'cc',
  },
  cc: {
    emoji: '🧩',
    title: 'Correlation coefficient: are the pieces all alike?',
    body: 'The radar checks whether everything it hits is the same shape and size. Plain rain or plain snow is all alike, so it shows red and pink. A mix, like rain with hail or melting snow, drops to yellow and green.',
    look: [
      'A small blue spot right on top of a velocity spin is a debris ball: leaves, branches and pieces of buildings thrown up by a tornado on the ground. Forecasters call it a tornado debris signature.',
      'A ring of lower values around a storm often marks melting snow (the bright band) or bugs and birds, not danger.',
    ],
    safety: 'If a debris signature is near you, a tornado is likely on the ground. Go to your shelter spot right away.',
    pair: 'velocity',
  },
  zdr: {
    emoji: '🍔',
    title: 'Differential reflectivity: flat or round?',
    body: 'The radar sends one wave side to side and one up and down, then compares them. Big raindrops fall flattened like hamburger buns, so they look wider than tall and show orange and red. Hail tumbles as it falls, so it looks round and shows gray, near zero.',
    look: [
      'A storm core that is bright on Reflectivity but gray here is probably hail.',
      'A strip of high values along the front edge of a big storm (a ZDR arc) means huge drops falling where the storm pulls in air.',
    ],
    pair: 'kdp',
  },
  kdp: {
    emoji: '🪣',
    title: 'Specific differential phase: how much water?',
    body: 'Lots of liquid water slows down the side-to-side radar wave a little. The more water packed into the air, the more it slows, and the brighter this map gets. Hail barely changes it.',
    look: [
      'Bright yellow, red or purple means pouring rain. Watch for flash flooding there.',
      'A core that looks heavy on Reflectivity but stays low here is likely hail, not rain.',
    ],
    pair: 'zdr',
  },
};

export const guideFor = (product) => (product ? GUIDES[product.id] || null : null);

// The products picker: the whole-US mosaics first, then the one-radar products.
export function productGroups(products = []) {
  const groups = [
    { label: 'Whole US', products: products.filter((p) => !p.site) },
    { label: 'One radar (tap a radar pin)', products: products.filter((p) => p.site) },
  ];
  return groups.filter((g) => g.products.length);
}

// Short labels for the full-screen bar, which has little room.
const SHORT = { site: 'Reflectivity', velocity: 'Velocity', srv: 'Storm-relative', cc: 'CC', zdr: 'ZDR', kdp: 'KDP' };
export const shortName = (p) => SHORT[p.id] || p.name;
