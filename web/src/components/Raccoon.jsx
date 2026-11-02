// Rocky the raccoon. Outfit pieces are layered on top of the base character
// based on what the server says the weather calls for.
export default function Raccoon({ items = [], mood = 'happy', size = 220 }) {
  const has = (k) => items.includes(k);
  const coat = has('raincoat') ? '#ffd23f' : has('winter-coat') ? '#3a6ea5' : has('jacket') ? '#6aa84f' : null;
  return (
    <svg viewBox="0 0 200 220" width={size} height={size * 1.1} role="img" aria-label={`Rocky the raccoon wearing ${items.length ? items.join(', ') : 'nothing special'}`} className={`raccoon mood-${mood}`}>
      {/* tail */}
      <g className="tail">
        <path d="M150 170 q40 -10 38 -50 q-2 -20 -18 -22 q8 30 -26 52z" fill="#7d7f86" />
        <path d="M176 104 q8 4 9 14 l-12 2 q0 -8 -6 -12z M184 128 q0 8 -4 14 l-11 -5 q4 -5 4 -10z M174 152 q-6 8 -16 12 l-4 -10 q8 -3 12 -8z" fill="#3b3c40" />
      </g>
      {/* body */}
      <ellipse cx="100" cy="160" rx="48" ry="44" fill="#8e9097" />
      <ellipse cx="100" cy="168" rx="28" ry="28" fill="#d9d9dc" />
      {coat && (
        <g className="coat">
          <path d="M54 150 q0 -32 46 -34 q46 2 46 34 l2 40 q-48 18 -96 0z" fill={coat} />
          <line x1="100" y1="118" x2="100" y2="196" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
          <circle cx="94" cy="140" r="3" fill="rgba(0,0,0,.3)" /><circle cx="94" cy="160" r="3" fill="rgba(0,0,0,.3)" /><circle cx="94" cy="180" r="3" fill="rgba(0,0,0,.3)" />
        </g>
      )}
      {has('t-shirt') && !coat && <path d="M60 140 q40 -20 80 0 l4 30 q-44 14 -88 0z" fill="#ff7a59" />}
      {/* arms / paws */}
      <g className="arms">
        <ellipse cx="54" cy="160" rx="10" ry="22" fill={coat || '#8e9097'} transform="rotate(20 54 160)" />
        <ellipse cx="146" cy="160" rx="10" ry="22" fill={coat || '#8e9097'} transform="rotate(-20 146 160)" />
        <circle cx="48" cy="180" r="9" fill={has('mittens') ? '#e63946' : '#3b3c40'} />
        <circle cx="152" cy="180" r="9" fill={has('mittens') ? '#e63946' : '#3b3c40'} />
      </g>
      {/* feet */}
      <g className="feet">
        {has('boots') || has('snow-boots') ? (
          <>
            <rect x="66" y="192" width="26" height="22" rx="6" fill={has('snow-boots') ? '#5b3a29' : '#ffd23f'} />
            <rect x="108" y="192" width="26" height="22" rx="6" fill={has('snow-boots') ? '#5b3a29' : '#ffd23f'} />
          </>
        ) : (
          <>
            <ellipse cx="80" cy="204" rx="14" ry="8" fill="#3b3c40" />
            <ellipse cx="120" cy="204" rx="14" ry="8" fill="#3b3c40" />
          </>
        )}
      </g>
      {/* head */}
      <g className="head">
        <path d="M52 52 l10 -32 l24 22z" fill="#7d7f86" /><path d="M148 52 l-10 -32 l-24 22z" fill="#7d7f86" />
        <path d="M60 46 l5 -18 l13 13z" fill="#3b3c40" /><path d="M140 46 l-5 -18 l-13 13z" fill="#3b3c40" />
        <ellipse cx="100" cy="78" rx="52" ry="44" fill="#a3a5ab" />
        <path d="M100 88 q-46 -22 -50 -6 q4 22 26 22 q14 0 24 -10 q10 10 24 10 q22 0 26 -22 q-4 -16 -50 6z" fill="#2f3034" />
        <ellipse cx="100" cy="102" rx="24" ry="16" fill="#f1f1f3" />
        <ellipse cx="100" cy="94" rx="7" ry="5" fill="#1f2023" />
        {has('sunglasses') ? (
          <g className="shades"><rect x="62" y="74" width="30" height="16" rx="6" fill="#111" /><rect x="108" y="74" width="30" height="16" rx="6" fill="#111" /><rect x="90" y="78" width="20" height="4" fill="#111" /></g>
        ) : (
          <g className="eyes">
            <circle cx="78" cy="82" r="7" fill="#fff" /><circle cx="122" cy="82" r="7" fill="#fff" />
            <circle cx="79" cy="83" r="4" fill="#111" /><circle cx="123" cy="83" r="4" fill="#111" />
          </g>
        )}
        <Mouth mood={mood} />
        {mood === 'shivering' && <text x="150" y="60" fontSize="18">🥶</text>}
        {mood === 'hot' && <text x="150" y="60" fontSize="18">💦</text>}
        {mood === 'worried' && <text x="150" y="60" fontSize="18">⚡</text>}
      </g>
      {/* hats */}
      {has('beanie') && (
        <g className="beanie">
          <path d="M56 54 q44 -50 88 0z" fill="#e63946" />
          <rect x="52" y="48" width="96" height="12" rx="6" fill="#f1faee" />
          <circle cx="100" cy="14" r="9" fill="#f1faee" />
        </g>
      )}
      {has('sun-hat') && !has('beanie') && (
        <g className="sunhat">
          <ellipse cx="100" cy="46" rx="74" ry="12" fill="#e9c46a" />
          <path d="M66 46 q34 -44 68 0z" fill="#e9c46a" />
          <rect x="68" y="38" width="64" height="7" fill="#e76f51" />
        </g>
      )}
      {has('raincoat') && !has('beanie') && !has('sun-hat') && (
        <path d="M48 58 q52 -66 104 0 q-52 -14 -104 0z" fill="#ffd23f" className="hood" />
      )}
    </svg>
  );
}

function Mouth({ mood }) {
  if (mood === 'worried') return <path d="M90 114 q10 -6 20 0" stroke="#1f2023" strokeWidth="3" fill="none" strokeLinecap="round" />;
  if (mood === 'shivering') return <path d="M88 112 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3" stroke="#1f2023" strokeWidth="2.5" fill="none" />;
  return <path d="M88 108 q12 12 24 0" stroke="#1f2023" strokeWidth="3" fill="none" strokeLinecap="round" />;
}
