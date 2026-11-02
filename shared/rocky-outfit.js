// Rocky's outfit pieces as plain SVG markup, in the master art's 1024x1024
// coordinates. One drawing for everywhere Rocky gets dressed: the web app's
// <Raccoon> (web/src/components/Raccoon.jsx) and the ready-to-show picture other
// family apps load from /api/connect/rocky.svg (Den-Duty's weather card).
// No JSX and no dependencies, so the server and the web bundle can both import it.

// Same crop as BODY in scripts/make-brand-assets.py.
export const BODY = { x: 220, y: 60, w: 710, h: 910 };

/** Every piece Rocky can wear (server/src/kid.js and the Kid Zone pick from these). */
export const ITEMS = [
  'raincoat', 'winter-coat', 'jacket', 't-shirt', 'pants', 'shorts', 'swim-trunks',
  'mittens', 'boots', 'snow-boots', 'sunglasses', 'beanie', 'sun-hat',
];
export const MOODS = ['happy', 'worried', 'shivering', 'hot'];

const INK = '#1d1d21';
const LINE = `stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"`;

const COATS = {
  raincoat: { fill: '#ffcf33', trim: '#e0a800' },
  'winter-coat': { fill: '#3a6ea5', trim: '#24507f' },
  jacket: { fill: '#5fa84a', trim: '#3f7d30' },
};

// Sleeves follow Rocky's arms down to the wrists; the paws stay out.
const LEFT_SLEEVE = 'M362 428 L338 446 L300 540 L268 640 L336 650 L372 562 L392 500 Z';
const RIGHT_SLEEVE = 'M662 428 L686 446 L724 540 L756 640 L688 650 L652 562 L632 500 Z';
const LEFT_SHORT = 'M362 428 L338 446 L306 528 L366 548 L392 500 Z';
const RIGHT_SHORT = 'M662 428 L686 446 L718 528 L658 548 L632 500 Z';
// Drawn under the shirt and coat so their hems cover the waistband.
const PANTS = 'M378 636 L354 770 L358 890 L498 890 L512 742 L526 890 L666 890 L670 770 L646 636 Q512 652 378 636 Z';
const SHORTS = 'M378 636 L358 786 L500 792 L512 736 L524 792 L666 786 L646 636 Q512 652 378 636 Z';

function coat(kind) {
  const { fill, trim } = COATS[kind];
  const fasten = kind === 'jacket'
    ? `<rect x="503" y="440" width="18" height="30" rx="5" fill="#d9d9d9" stroke="${INK}" stroke-width="4"/>`
    : [500, 580, 660, 740].map((y) => `<circle cx="488" cy="${y}" r="11" fill="${trim}" stroke="${INK}" stroke-width="4"/>`).join('');
  return `<g class="coat ${kind}">`
    + `<path d="${LEFT_SLEEVE}" fill="${fill}" ${LINE}/>`
    + `<path d="${RIGHT_SLEEVE}" fill="${fill}" ${LINE}/>`
    + `<path d="M420 410 C384 414 362 424 352 440 L388 520 L370 700 L362 806 Q512 836 662 806 L654 700 L636 520 L672 440 C662 424 640 414 604 410 Q512 446 420 410 Z" fill="${fill}" ${LINE}/>`
    + `<path d="M268 640 L336 650 M688 650 L756 640" stroke="${trim}" stroke-width="18" stroke-linecap="round"/>`
    + `<path d="M512 434 L512 818" stroke="${trim}" stroke-width="6"/>`
    + fasten
    + `<path d="M400 620 h60 M564 620 h60" stroke="${trim}" stroke-width="8" stroke-linecap="round"/>`
    + '</g>';
}

const SHIRT = '<g class="tshirt">'
  + `<path d="${LEFT_SHORT}" fill="#ff7a59" ${LINE}/>`
  + `<path d="${RIGHT_SHORT}" fill="#ff7a59" ${LINE}/>`
  + `<path d="M420 410 C384 414 362 424 352 440 L388 520 L380 650 Q512 676 644 650 L636 520 L672 440 C662 424 640 414 604 410 Q512 450 420 410 Z" fill="#ff7a59" ${LINE}/>`
  + `<path d="M472 540 l40 -26 l40 26 l-40 40z" fill="#ffd23f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
  + '</g>';

function bottoms(kind) {
  if (kind === 'pants') {
    return '<g class="pants">'
      + `<path d="${PANTS}" fill="#3d5a99" ${LINE}/>`
      + '<path d="M430 700 L428 880 M594 700 L596 880" stroke="#2c437a" stroke-width="5"/>'
      + '<path d="M378 636 Q512 652 646 636" stroke="#2c437a" stroke-width="14" fill="none"/>'
      + '</g>';
  }
  const swim = kind === 'swim-trunks';
  const flower = ([x, y]) => `<g transform="translate(${x} ${y})">`
    + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-11" rx="7" ry="11" fill="#ffd23f" transform="rotate(${a})"/>`).join('')
    + '<circle r="6" fill="#ff7a59"/></g>';
  const trim = swim
    ? [[420, 700], [600, 690], [460, 760], [580, 765], [512, 690]].map(flower).join('')
      + '<path d="M500 652 q-10 30 -22 40 M524 652 q10 30 22 40" stroke="#f1faee" stroke-width="6" fill="none" stroke-linecap="round"/>'
    : '<path d="M410 700 h50 M564 700 h50" stroke="#a07c48" stroke-width="6" stroke-linecap="round"/>';
  return `<g class="${swim ? 'swim-trunks' : 'shorts'}"><path d="${SHORTS}" fill="${swim ? '#19b5a5' : '#c8a06a'}" ${LINE}/>${trim}</g>`;
}

const SCARF = '<g class="scarf">'
  + `<path d="M404 396 Q512 452 620 396 L630 440 Q512 500 394 440 Z" fill="#e63946" ${LINE}/>`
  + `<path d="M560 452 L600 456 L616 590 L572 596 Z" fill="#e63946" ${LINE}/>`
  + '<path d="M578 500 l30 -3 M584 540 l28 -3" stroke="#f1faee" stroke-width="10"/>'
  + '<path d="M440 432 Q512 470 584 432" stroke="#f1faee" stroke-width="10" fill="none"/>'
  + '</g>';

const mitt = (cx, cy, flip) => `<g transform="translate(${cx} ${cy}) scale(${flip ? -1 : 1} 1)">`
  + `<ellipse cx="-30" cy="-6" rx="17" ry="30" transform="rotate(-24 -30 -6)" fill="#e63946" ${LINE}/>`
  + `<ellipse cx="0" cy="8" rx="40" ry="52" fill="#e63946" ${LINE}/>`
  + `<rect x="-40" y="-56" width="80" height="24" rx="10" fill="#f1faee" ${LINE}/>`
  + '</g>';
const MITTENS = `<g class="mittens">${mitt(294, 692, true)}${mitt(732, 692, false)}</g>`;

function boots(kind) {
  const fill = kind === 'snow' ? '#6b4430' : '#ffcf33';
  const cuff = kind === 'snow' ? '#f4f1ea' : '#e0a800';
  const cuffs = kind === 'snow'
    ? `<path d="M342 830 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 v22 H342 Z" fill="${cuff}" ${LINE}/>`
      + `<path d="M546 830 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 v22 H546 Z" fill="${cuff}" ${LINE}/>`
    : `<rect x="346" y="820" width="128" height="22" rx="8" fill="${cuff}" ${LINE}/>`
      + `<rect x="550" y="820" width="128" height="22" rx="8" fill="${cuff}" ${LINE}/>`;
  return `<g class="boots ${kind}">`
    + `<path d="M352 826 L468 826 L472 902 Q478 950 438 952 L344 952 Q318 950 326 914 L350 892 Z" fill="${fill}" ${LINE}/>`
    + `<path d="M556 826 L672 826 L676 892 L700 914 Q708 950 682 952 L588 952 Q548 950 552 902 Z" fill="${fill}" ${LINE}/>`
    + cuffs
    + '</g>';
}

const SHADES = '<g class="shades">'
  + `<rect x="394" y="240" width="98" height="70" rx="26" fill="#121214" ${LINE}/>`
  + `<rect x="532" y="240" width="98" height="70" rx="26" fill="#121214" ${LINE}/>`
  + `<path d="M492 266 Q512 254 532 266" stroke="${INK}" stroke-width="10" fill="none"/>`
  + '<path d="M410 258 l26 -6 M548 258 l26 -6" stroke="#8fd3ff" stroke-width="8" stroke-linecap="round"/>'
  + '</g>';

const BEANIE = '<g class="beanie">'
  + `<path d="M380 220 Q378 104 512 98 Q646 104 644 220 Z" fill="#e63946" ${LINE}/>`
  + '<path d="M430 120 Q440 170 438 214 M512 100 V214 M594 120 Q584 170 586 214" stroke="#b62532" stroke-width="6" fill="none"/>'
  + `<rect x="366" y="196" width="292" height="44" rx="20" fill="#f1faee" ${LINE}/>`
  + `<circle cx="512" cy="84" r="30" fill="#f1faee" ${LINE}/>`
  + '</g>';

const SUN_HAT = '<g class="sunhat">'
  + `<ellipse cx="512" cy="212" rx="236" ry="42" fill="#e9c46a" ${LINE}/>`
  + `<path d="M410 212 Q410 118 512 114 Q614 118 614 212 Z" fill="#e9c46a" ${LINE}/>`
  + `<path d="M412 182 Q512 198 612 182 L613 204 Q512 220 411 204 Z" fill="#e76f51" stroke="${INK}" stroke-width="4"/>`
  + '</g>';

const RAIN_HAT = '<g class="rainhat">'
  + `<path d="M318 214 Q512 166 706 214 Q720 240 690 238 Q512 206 334 238 Q304 240 318 214 Z" fill="#ffcf33" ${LINE}/>`
  + `<path d="M418 206 Q420 112 512 108 Q604 112 606 206 Q512 190 418 206 Z" fill="#ffcf33" ${LINE}/>`
  + '<path d="M440 150 Q512 136 584 150" stroke="#e0a800" stroke-width="6" fill="none"/>'
  + '</g>';

/** The outfit pieces for these items, layered bottom to top, as SVG markup. Unknown items are ignored. */
export function outfitSvg(items = []) {
  const has = (k) => items.includes(k);
  const coatKey = ['raincoat', 'winter-coat', 'jacket'].find(has);
  const hat = has('beanie') ? BEANIE : has('sun-hat') ? SUN_HAT : has('raincoat') ? RAIN_HAT : '';
  const bootKind = has('snow-boots') ? 'snow' : has('boots') ? 'rain' : null;
  const bottomKey = ['pants', 'shorts', 'swim-trunks'].find(has);
  return [
    bottomKey ? bottoms(bottomKey) : '',
    has('t-shirt') && !coatKey ? SHIRT : '',
    coatKey ? coat(coatKey) : '',
    has('winter-coat') ? SCARF : '',
    has('mittens') ? MITTENS : '',
    bootKind ? boots(bootKind) : '',
    has('sunglasses') ? SHADES : '',
    hat,
  ].join('');
}

const MOOD_EMOJI = { shivering: '🥶', hot: '💦', worried: '⚡' };

/** The little mood badge by Rocky's ear, or '' when he's just happy. */
export function moodBadgeSvg(mood) {
  const e = MOOD_EMOJI[mood];
  return e ? `<text x="780" y="200" font-size="110" class="mood-badge" aria-hidden="true">${e}</text>` : '';
}

export function rockyLabel(items = []) {
  return `Rocky the raccoon wearing ${items.length ? items.join(', ') : 'nothing special'}`;
}

/** Only the items and mood Rocky knows, in a steady order (so the same weather gives the same picture URL). */
export function cleanOutfit(items, mood) {
  const list = (Array.isArray(items) ? items : String(items ?? '').split(','))
    .map((s) => String(s).trim()).filter((s) => ITEMS.includes(s));
  return { items: ITEMS.filter((k) => list.includes(k)), mood: MOODS.includes(mood) ? mood : 'happy' };
}

/**
 * A whole, standalone picture of Rocky dressed for the weather, for apps that show it with a plain <img>.
 * baseHref is the base art (a data: URL, because an SVG shown as an image can't load other files).
 */
export function rockySvg({ items = [], mood = 'happy', baseHref }) {
  const o = cleanOutfit(items, mood);
  const { x, y, w, h } = BODY;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${rockyLabel(o.items)}" class="raccoon mood-${o.mood}">`
    + '<style>'
    + '.rocky{transform-box:fill-box;transform-origin:50% 100%;animation:breathe 3.6s ease-in-out infinite}'
    + '.mood-shivering .rocky{animation:shiver .25s linear infinite}'
    + '.mood-hot .rocky{animation-duration:2.2s}'
    + '.mood-badge{animation:bob 2s ease-in-out infinite}'
    + '@keyframes breathe{50%{transform:scale(1.012,.99)}}'
    + '@keyframes shiver{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}'
    + '@keyframes bob{50%{transform:translateY(-12px)}}'
    + '@media (prefers-reduced-motion:reduce){.rocky,.mood-badge{animation:none}}'
    + '</style>'
    + `<g class="rocky"><image href="${baseHref}" x="${x}" y="${y}" width="${w}" height="${h}"/>${outfitSvg(o.items)}</g>`
    + moodBadgeSvg(o.mood)
    + '</svg>';
}
