// Rocky the raccoon, the face of Weather Scout. The base art is the brand
// illustration (web/public/rocky/rocky.webp, built from docs/brand/rocky-master.png
// by scripts/make-brand-assets.py). Outfit pieces are drawn on top of it in the
// master art's 1024x1024 coordinates, based on what the weather calls for.

// Same crop as BODY in scripts/make-brand-assets.py.
const BODY = { x: 220, y: 60, w: 710, h: 910 };
const INK = '#1d1d21';
const line = { stroke: INK, strokeWidth: 7, strokeLinejoin: 'round', strokeLinecap: 'round' };

const COATS = {
  raincoat: { fill: '#ffcf33', trim: '#e0a800' },
  'winter-coat': { fill: '#3a6ea5', trim: '#24507f' },
  jacket: { fill: '#5fa84a', trim: '#3f7d30' },
};

export default function Raccoon({ items = [], mood = 'happy', size = 220 }) {
  const has = (k) => items.includes(k);
  const coatKey = ['raincoat', 'winter-coat', 'jacket'].find(has);
  const coat = coatKey && COATS[coatKey];
  const shirt = has('t-shirt') && !coat;
  const hat = has('beanie') ? 'beanie' : has('sun-hat') ? 'sun-hat' : has('raincoat') ? 'rain-hat' : null;
  const boots = has('snow-boots') ? 'snow' : has('boots') ? 'rain' : null;
  const label = `Rocky the raccoon wearing ${items.length ? items.join(', ') : 'nothing special'}`;

  return (
    <svg
      viewBox={`${BODY.x} ${BODY.y} ${BODY.w} ${BODY.h}`}
      width={size}
      height={Math.round((size * BODY.h) / BODY.w)}
      role="img"
      aria-label={label}
      className={`raccoon mood-${mood}`}
    >
      <g className="rocky">
        <image href="/rocky/rocky.webp" x={BODY.x} y={BODY.y} width={BODY.w} height={BODY.h} />

        {shirt && <Shirt />}
        {coat && <Coat {...coat} kind={coatKey} />}
        {has('winter-coat') && <Scarf />}
        {has('mittens') && <Mittens />}
        {boots && <Boots kind={boots} />}
        {has('sunglasses') && <Shades />}
        {hat === 'beanie' && <Beanie />}
        {hat === 'sun-hat' && <SunHat />}
        {hat === 'rain-hat' && <RainHat />}
      </g>
      <MoodBadge mood={mood} />
    </svg>
  );
}

// Sleeves follow Rocky's arms down to the wrists; the paws stay out.
const LEFT_SLEEVE = 'M362 428 L338 446 L300 540 L268 640 L336 650 L372 562 L392 500 Z';
const RIGHT_SLEEVE = 'M662 428 L686 446 L724 540 L756 640 L688 650 L652 562 L632 500 Z';
const LEFT_SHORT = 'M362 428 L338 446 L306 528 L366 548 L392 500 Z';
const RIGHT_SHORT = 'M662 428 L686 446 L718 528 L658 548 L632 500 Z';

function Coat({ fill, trim, kind }) {
  return (
    <g className={`coat ${kind}`}>
      <path d={LEFT_SLEEVE} fill={fill} {...line} />
      <path d={RIGHT_SLEEVE} fill={fill} {...line} />
      <path
        d="M420 410 C384 414 362 424 352 440 L388 520 L370 700 L362 806 Q512 836 662 806 L654 700 L636 520 L672 440 C662 424 640 414 604 410 Q512 446 420 410 Z"
        fill={fill}
        {...line}
      />
      <path d="M268 640 L336 650 M688 650 L756 640" stroke={trim} strokeWidth="18" strokeLinecap="round" />
      <path d="M512 434 L512 818" stroke={trim} strokeWidth="6" />
      {kind === 'jacket' ? (
        <rect x="503" y="440" width="18" height="30" rx="5" fill="#d9d9d9" stroke={INK} strokeWidth="4" />
      ) : (
        [500, 580, 660, 740].map((y) => <circle key={y} cx="488" cy={y} r="11" fill={trim} stroke={INK} strokeWidth="4" />)
      )}
      <path d="M400 620 h60 M564 620 h60" stroke={trim} strokeWidth="8" strokeLinecap="round" />
    </g>
  );
}

function Shirt() {
  return (
    <g className="tshirt">
      <path d={LEFT_SHORT} fill="#ff7a59" {...line} />
      <path d={RIGHT_SHORT} fill="#ff7a59" {...line} />
      <path
        d="M420 410 C384 414 362 424 352 440 L388 520 L380 650 Q512 676 644 650 L636 520 L672 440 C662 424 640 414 604 410 Q512 450 420 410 Z"
        fill="#ff7a59"
        {...line}
      />
      <path d="M472 540 l40 -26 l40 26 l-40 40z" fill="#ffd23f" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    </g>
  );
}

function Scarf() {
  return (
    <g className="scarf">
      <path d="M404 396 Q512 452 620 396 L630 440 Q512 500 394 440 Z" fill="#e63946" {...line} />
      <path d="M560 452 L600 456 L616 590 L572 596 Z" fill="#e63946" {...line} />
      <path d="M578 500 l30 -3 M584 540 l28 -3" stroke="#f1faee" strokeWidth="10" />
      <path d="M440 432 Q512 470 584 432" stroke="#f1faee" strokeWidth="10" fill="none" />
    </g>
  );
}

function Mittens() {
  const mitt = (cx, cy, flip) => (
    <g transform={`translate(${cx} ${cy}) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cx="-30" cy="-6" rx="17" ry="30" transform="rotate(-24 -30 -6)" fill="#e63946" {...line} />
      <ellipse cx="0" cy="8" rx="40" ry="52" fill="#e63946" {...line} />
      <rect x="-40" y="-56" width="80" height="24" rx="10" fill="#f1faee" {...line} />
    </g>
  );
  return (
    <g className="mittens">
      {mitt(294, 692, true)}
      {mitt(732, 692, false)}
    </g>
  );
}

function Boots({ kind }) {
  const fill = kind === 'snow' ? '#6b4430' : '#ffcf33';
  const cuff = kind === 'snow' ? '#f4f1ea' : '#e0a800';
  return (
    <g className={`boots ${kind}`}>
      <path d="M352 826 L468 826 L472 902 Q478 950 438 952 L344 952 Q318 950 326 914 L350 892 Z" fill={fill} {...line} />
      <path d="M556 826 L672 826 L676 892 L700 914 Q708 950 682 952 L588 952 Q548 950 552 902 Z" fill={fill} {...line} />
      {kind === 'snow' ? (
        <>
          <path d="M342 830 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 v22 H342 Z" fill={cuff} {...line} />
          <path d="M546 830 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 q14 -22 28 0 v22 H546 Z" fill={cuff} {...line} />
        </>
      ) : (
        <>
          <rect x="346" y="820" width="128" height="22" rx="8" fill={cuff} {...line} />
          <rect x="550" y="820" width="128" height="22" rx="8" fill={cuff} {...line} />
        </>
      )}
    </g>
  );
}

function Shades() {
  return (
    <g className="shades">
      <rect x="394" y="240" width="98" height="70" rx="26" fill="#121214" {...line} />
      <rect x="532" y="240" width="98" height="70" rx="26" fill="#121214" {...line} />
      <path d="M492 266 Q512 254 532 266" stroke={INK} strokeWidth="10" fill="none" />
      <path d="M410 258 l26 -6 M548 258 l26 -6" stroke="#8fd3ff" strokeWidth="8" strokeLinecap="round" />
    </g>
  );
}

function Beanie() {
  return (
    <g className="beanie">
      <path d="M380 220 Q378 104 512 98 Q646 104 644 220 Z" fill="#e63946" {...line} />
      <path d="M430 120 Q440 170 438 214 M512 100 V214 M594 120 Q584 170 586 214" stroke="#b62532" strokeWidth="6" fill="none" />
      <rect x="366" y="196" width="292" height="44" rx="20" fill="#f1faee" {...line} />
      <circle cx="512" cy="84" r="30" fill="#f1faee" {...line} />
    </g>
  );
}

function SunHat() {
  return (
    <g className="sunhat">
      <ellipse cx="512" cy="212" rx="236" ry="42" fill="#e9c46a" {...line} />
      <path d="M410 212 Q410 118 512 114 Q614 118 614 212 Z" fill="#e9c46a" {...line} />
      <path d="M412 182 Q512 198 612 182 L613 204 Q512 220 411 204 Z" fill="#e76f51" stroke={INK} strokeWidth="4" />
    </g>
  );
}

function RainHat() {
  return (
    <g className="rainhat">
      <path d="M318 214 Q512 166 706 214 Q720 240 690 238 Q512 206 334 238 Q304 240 318 214 Z" fill="#ffcf33" {...line} />
      <path d="M418 206 Q420 112 512 108 Q604 112 606 206 Q512 190 418 206 Z" fill="#ffcf33" {...line} />
      <path d="M440 150 Q512 136 584 150" stroke="#e0a800" strokeWidth="6" fill="none" />
    </g>
  );
}

const MOOD = { shivering: '🥶', hot: '💦', worried: '⚡' };

function MoodBadge({ mood }) {
  if (!MOOD[mood]) return null;
  return (
    <text x="780" y="200" fontSize="110" className="mood-badge" aria-hidden="true">
      {MOOD[mood]}
    </text>
  );
}
