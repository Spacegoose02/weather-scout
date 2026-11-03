// Junior Spotter Academy: a kid-sized storm spotter course, inspired by the
// National Weather Service's SKYWARN spotter classes. Five short modules with
// a quiz each, then a final exam and a printable certificate.

export const PASS_MODULE = 2; // of 3 questions
export const EXAM_QUESTIONS = 10;
export const PASS_EXAM = 8;

export const HAIL_SIZES = [
  { id: 'pea', label: 'Pea', inches: 0.25, emoji: '🟢' },
  { id: 'penny', label: 'Penny', inches: 0.75, emoji: '🪙' },
  { id: 'quarter', label: 'Quarter', inches: 1, emoji: '🪙', severe: true },
  { id: 'ping-pong', label: 'Ping-pong ball', inches: 1.5, emoji: '🏓', severe: true },
  { id: 'golf-ball', label: 'Golf ball', inches: 1.75, emoji: '⛳', severe: true },
  { id: 'tennis-ball', label: 'Tennis ball', inches: 2.5, emoji: '🎾', severe: true },
  { id: 'baseball', label: 'Baseball', inches: 2.75, emoji: '⚾', severe: true },
  { id: 'softball', label: 'Softball', inches: 4, emoji: '🥎', severe: true },
];

export const MODULES = [
  {
    id: 'safety', emoji: '🦺', title: 'Safety first',
    intro: 'Every spotter\'s first job is to stay safe. Real spotters are grown-ups who watch from far away and always have a way out. Junior spotters watch from a window at home with a grown-up.',
    cards: [
      { emoji: '🏠', title: 'Spot from a safe place', body: 'A window at home, with a grown-up, is the best spotting spot. If a warning comes, you go straight to your safe spot. Your safety beats any picture!' },
      { emoji: '⚡', title: 'When thunder roars, go indoors', body: 'Lightning can strike 10 miles away from a storm, even under blue sky. If you can hear thunder, you are close enough to be hit. Wait 30 minutes after the last thunder before going back out.' },
      { emoji: '🌊', title: 'Turn around, don\'t drown', body: 'Never walk, bike or ride through flood water. Just 6 inches of fast water can knock a person down, and 12 inches can float a car.' },
      { emoji: '🧭', title: 'Real spotters keep an escape route', body: 'Grown-up spotters park far from the storm, watch which way it is moving and always have a road out. They never drive into the rain and hail core.' },
    ],
    quiz: [
      { q: 'Where should a junior spotter watch storms from?', options: ['The middle of a field', 'A window at home with a grown-up', 'On top of a hill'], answer: 1, why: 'Inside a sturdy building, with a grown-up, is the safe way to spot.' },
      { q: 'You hear thunder but it is still sunny. What do you do?', options: ['Keep playing outside', 'Go indoors right away', 'Climb a tree to look'], answer: 1, why: 'If you can hear thunder, lightning can reach you. When thunder roars, go indoors!' },
      { q: 'How long should you wait after the last thunder to go back out?', options: ['30 seconds', '5 minutes', '30 minutes'], answer: 2, why: 'Storms can still throw lightning as they leave. Wait 30 minutes after the last rumble.' },
    ],
  },
  {
    id: 'anatomy', emoji: '⛈️', title: 'Parts of a storm',
    intro: 'A big thunderstorm is like a giant machine. Knowing its parts tells you where to look and what is dangerous.',
    cards: [
      { emoji: '🗼', title: 'Updraft tower', body: 'The rising tower of warm, wet air. When it looks hard and lumpy like cauliflower, the updraft is strong.' },
      { emoji: '🔨', title: 'Anvil', body: 'At the top, about 8 to 10 miles up, the cloud can\'t rise any more and spreads out flat like a blacksmith\'s anvil. A bubble poking above the anvil, called an overshooting top, means a super strong updraft.' },
      { emoji: '⬛', title: 'Rain-free base', body: 'The flat, dark bottom of the cloud right under the updraft, usually off to the side of the rain. This is where spotters look for rotation.' },
      { emoji: '🧱', title: 'Wall cloud', body: 'A lowered chunk of cloud hanging under the rain-free base. If a wall cloud is spinning, it is time to report it. Many tornadoes drop out of a rotating wall cloud.' },
      { emoji: '🍰', title: 'Shelf cloud', body: 'A long, wedge-shaped cloud on the front edge of a storm. It looks scary, but it is made by cool wind rushing out of the storm, not by spin. Expect a blast of wind!' },
      { emoji: '🫧', title: 'Mammatus', body: 'Bubbly pouches hanging under the anvil. They look wild but are not dangerous by themselves, and often show up as a storm is passing.' },
    ],
    quiz: [
      { q: 'The flat top of a thunderstorm is called the…', options: ['Anvil', 'Wall cloud', 'Puddle'], answer: 0, why: 'The top spreads out flat like a blacksmith\'s anvil.' },
      { q: 'Which cloud should a spotter report if it is spinning?', options: ['Mammatus', 'Wall cloud', 'Cirrus'], answer: 1, why: 'A rotating wall cloud can be a sign that a tornado may form.' },
      { q: 'A shelf cloud on the front of a storm usually means…', options: ['A tornado for sure', 'A gust of strong wind is coming', 'Snow is coming'], answer: 1, why: 'A shelf cloud rides on the cool outflow wind rushing ahead of the storm.' },
    ],
  },
  {
    id: 'lookalikes', emoji: '🕵️', title: 'Tornado or not?',
    intro: 'Lots of things in the sky can look like a tornado. Good spotters know the look-alikes and watch carefully before they report.',
    cards: [
      { emoji: '🌫️', title: 'Scud clouds', body: 'Ragged little cloud bits floating low under a storm. They drift along with the wind but do not spin around one spot.' },
      { emoji: '⏱️', title: 'The one-minute test', body: 'Watch a suspicious cloud for a whole minute. Real rotation keeps turning around a center the whole time, often with air rising fast.' },
      { emoji: '🌪️', title: 'Funnel cloud or tornado?', body: 'A funnel cloud is spinning air that has not reached the ground. It becomes a tornado when the spin touches the ground, even if the cloud does not. Look for a swirl of dust or debris on the ground under it.' },
      { emoji: '🌧️', title: 'Rain shafts', body: 'Heavy rain falling from a cloud can look like a dark column. If it is not spinning and it moves with the storm, it is just rain.' },
    ],
    quiz: [
      { q: 'A funnel becomes a tornado when…', options: ['It turns white', 'The spin touches the ground', 'It starts raining'], answer: 1, why: 'A tornado is spinning air connected to the ground. Look for debris swirling under it.' },
      { q: 'Ragged cloud bits that drift but don\'t spin are…', options: ['Scud', 'A tornado', 'An anvil'], answer: 0, why: 'Scud clouds are the number one tornado look-alike.' },
      { q: 'How long should you watch to check for rotation?', options: ['About a minute', 'One blink', 'All night'], answer: 0, why: 'Real rotation keeps turning. A whole minute helps you be sure.' },
    ],
  },
  {
    id: 'measure', emoji: '📏', title: 'Hail, wind and water',
    intro: 'Spotters tell forecasters how big the hail is, how strong the wind is and where water is flooding. Forecasters can\'t see that on radar, so your eyes really help.',
    cards: [
      { emoji: '🪙', title: 'Measure hail with things you know', body: 'Pea, penny, quarter, ping-pong ball, golf ball, tennis ball, baseball, softball. In the US, hail the size of a quarter (1 inch) or bigger counts as severe. Never go outside to grab hail while it is still falling!' },
      { emoji: '🌳', title: 'Read the wind from the trees', body: 'Whole trees swaying means about 30 mph. Big branches snapping means about 60 mph. Wind of 58 mph or more counts as severe.' },
      { emoji: '🌊', title: 'Watch for flooding', body: 'Water over a road, a creek over its banks, or water coming into houses is important to report.' },
      { emoji: '📣', title: 'What spotters report', body: 'Tornadoes, funnel clouds, rotating wall clouds, hail quarter size or bigger, wind damage or 58 mph gusts, and flooding.' },
    ],
    quiz: [
      { q: 'Which hail size counts as severe in the US?', options: ['Pea', 'Penny', 'Quarter'], answer: 2, why: 'Hail 1 inch across, the size of a quarter, or bigger is severe.' },
      { q: 'Which is bigger?', options: ['Golf ball hail', 'Penny hail', 'Pea hail'], answer: 0, why: 'Golf ball hail is about 1.75 inches across. That can dent cars!' },
      { q: 'Big branches snapping off trees means wind about…', options: ['10 mph', '60 mph', '200 mph'], answer: 1, why: 'Snapping big branches takes wind around 60 mph, which is severe.' },
    ],
  },
  {
    id: 'report', emoji: '📞', title: 'Making a report',
    intro: 'A good report is short and clear. Forecasters use spotter reports to decide on warnings, so every word matters.',
    cards: [
      { emoji: '🙋', title: 'Who', body: 'Say who you are: a spotter, and where you are watching from.' },
      { emoji: '👀', title: 'What', body: 'Say exactly what you saw, like "quarter size hail" or "rotating wall cloud". Only report what you really saw.' },
      { emoji: '📍', title: 'Where', body: 'Say where it is, like "2 miles west of town". Where the storm is matters more than where you are.' },
      { emoji: '🕐', title: 'When', body: 'Say what time you saw it. Forecasters need to know if it is happening right now.' },
      { emoji: '📱', title: 'Sending reports', body: 'Grown-ups can send reports to the National Weather Service, and anyone can share what is falling with the free mPING app from NOAA. Practice with a grown-up!' },
    ],
    quiz: [
      { q: 'Which is the best report?', options: ['"It\'s really bad out!"', '"Quarter size hail, 2 miles west of town, 4:15 pm"', '"Something weird is happening"'], answer: 1, why: 'A good report says what, where and when, clearly.' },
      { q: 'What should you report?', options: ['Only what you really saw', 'What your friend guessed', 'What might happen tomorrow'], answer: 0, why: 'Forecasters trust spotters because they only report what they see.' },
      { q: 'Which part of a report tells where the storm is?', options: ['Who', 'Where', 'Why'], answer: 1, why: 'Who, what, where and when are the four parts of a good report.' },
    ],
  },
];
export const moduleById = Object.fromEntries(MODULES.map((m) => [m.id, m]));

// Extra exam-only questions, so the exam isn't just a replay.
const EXAM_EXTRA = [
  { q: 'Most tornadoes come from which kind of storm?', options: ['Supercells', 'Snow squalls', 'Fog banks'], answer: 0, why: 'Supercells have spinning updrafts and make most strong tornadoes.' },
  { q: 'A tornado warning is issued. What do you do?', options: ['Run outside to look', 'Open all the windows', 'Go to your safe spot'], answer: 2, why: 'A warning means danger now. Go to your safe spot: lowest floor, inside room, away from windows.' },
  { q: 'What is the overshooting top a sign of?', options: ['The storm is dying', 'A very strong updraft', 'A rainbow'], answer: 1, why: 'The updraft is so strong it punches up above the anvil.' },
  { q: 'Tennis ball hail is about how big?', options: ['A quarter inch', '2.5 inches', '10 inches'], answer: 1, why: 'Tennis ball hail is about 2 and a half inches across.' },
];

// Pick the exam: one question from every module, then fill up from the rest.
export function examQuestions(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const shuffle = (a) => {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const firsts = MODULES.map((m) => shuffle(m.quiz)[0]);
  const rest = shuffle([...MODULES.flatMap((m) => m.quiz).filter((q) => !firsts.includes(q)), ...EXAM_EXTRA]);
  return shuffle([...firsts, ...rest.slice(0, EXAM_QUESTIONS - firsts.length)]);
}

// data.spotter = { modules: { safety: 3 }, exam: 9, certDate: 'YYYY-MM-DD', name }
export function spotterStatus(sp = {}) {
  const mods = sp.modules || {};
  const passed = MODULES.filter((m) => (mods[m.id] ?? -1) >= PASS_MODULE).map((m) => m.id);
  return {
    passed,
    allPassed: passed.length === MODULES.length,
    examReady: passed.length === MODULES.length,
    certified: (sp.exam ?? 0) >= PASS_EXAM,
    next: MODULES.find((m) => !passed.includes(m.id)) || null,
  };
}

// A practice report from the report builder: "Spotter Sam at home: quarter size
// hail, 2 miles west of my house, at 4:15 PM."
export function buildReport({ who, what, hail, distance, direction, time }) {
  if (!what) return '';
  const thing = what === 'hail' && hail ? `${HAIL_SIZES.find((h) => h.id === hail)?.label.toLowerCase() || ''} size hail` : what;
  const where = distance === '0' || !distance ? 'right here' : `${distance} mile${distance === '1' ? '' : 's'} ${direction || 'away'} of me`;
  return `${who ? `${who}: ` : ''}${thing.charAt(0).toUpperCase()}${thing.slice(1)}, ${where}${time ? `, at ${time}` : ''}.`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A self-contained printable certificate page.
export function certificateHtml({ name, date, score }) {
  const when = new Date(`${date}T12:00:00`).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Junior Storm Spotter certificate</title>
<style>
  @page { size: landscape; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Nunito', ui-rounded, system-ui, sans-serif; color: #1d2433; background: #fff; }
  .cert { width: 10in; max-width: 100%; margin: 0 auto; padding: 0.45in 0.6in; border: 10px double #5a3f8f; border-radius: 18px; text-align: center; position: relative; }
  .top { font-size: 15px; letter-spacing: 0.2em; text-transform: uppercase; color: #5a3f8f; font-weight: 800; margin: 0; }
  h1 { font-size: 44px; margin: 6px 0 2px; color: #2b3a67; }
  .sub { margin: 0 0 18px; font-size: 18px; }
  .name { font-size: 40px; font-weight: 900; border-bottom: 3px solid #2b3a67; display: inline-block; padding: 0 30px 4px; margin: 6px 0 14px; min-width: 60%; }
  .what { font-size: 17px; max-width: 7.4in; margin: 0 auto 14px; line-height: 1.45; }
  ul { list-style: none; padding: 0; margin: 0 auto 18px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; font-weight: 700; font-size: 15px; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; }
  .sig { text-align: center; font-size: 14px; min-width: 2.6in; }
  .sig b { display: block; font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 30px; font-weight: 400; border-bottom: 2px solid #1d2433; margin-bottom: 4px; }
  .seal { width: 1.3in; height: 1.3in; }
  .fine { font-size: 11px; color: #5b6479; margin: 16px 0 0; }
  .print { position: fixed; bottom: 12px; right: 12px; font: inherit; font-weight: 800; padding: 10px 18px; border: 0; border-radius: 12px; background: #5a3f8f; color: #fff; cursor: pointer; }
  @media print { .print { display: none; } }
</style></head><body>
<button class="print" onclick="window.print()">Print</button>
<div class="cert">
  <p class="top">Weather Scout Spotter Academy</p>
  <h1>Junior Storm Spotter</h1>
  <p class="sub">This certifies that</p>
  <div class="name">${esc(name || 'Junior Spotter')}</div>
  <p class="what">finished all five lessons of Junior Spotter training and passed the final exam${score != null ? ` with ${esc(score)} of ${EXAM_QUESTIONS}` : ''}, and knows how to watch storms safely, name the parts of a storm, tell a tornado from a look-alike, measure hail and make a clear report.</p>
  <ul><li>🦺 Safety first</li><li>⛈️ Parts of a storm</li><li>🕵️ Tornado or not?</li><li>📏 Hail, wind and water</li><li>📞 Making a report</li></ul>
  <div class="foot">
    <div class="sig"><b>Rocky</b>Rocky the Raccoon, Chief Weather Scout</div>
    <svg class="seal" viewBox="0 0 120 120" aria-hidden="true">
      <g fill="#ffb703">${Array.from({ length: 24 }, (_, i) => `<circle cx="${60 + 52 * Math.cos((i * Math.PI) / 12)}" cy="${60 + 52 * Math.sin((i * Math.PI) / 12)}" r="9"/>`).join('')}</g>
      <circle cx="60" cy="60" r="50" fill="#ffb703"/><circle cx="60" cy="60" r="42" fill="#5a3f8f"/>
      <path d="M38 44h44l-6 10H44zM46 58h28l-5 9H51zM53 71h14l-4 9h-6zM58 83h4l-1 9h-2z" fill="#fff"/>
      <text x="60" y="34" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">SPOTTER</text>
    </svg>
    <div class="sig"><b>&nbsp;</b>${esc(when)}</div>
  </div>
  <p class="fine">A practice course for kids, inspired by the National Weather Service SKYWARN storm spotter program. It is not an official NWS certification. Grown-ups can take the free official class through their local National Weather Service office (weather.gov/skywarn).</p>
</div>
</body></html>`;
}
