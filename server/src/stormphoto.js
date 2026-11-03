// Storm picture of the day: a hand-picked list of freely licensed tornado and
// lightning photos on Wikimedia Commons (mostly NOAA / NSSL public domain shots
// of the sky, never damage or people), plus any an admin adds. Credit and
// license come live from Commons, so they are always what the file page says,
// and a file that went missing or isn't freely licensed is simply skipped.
// Images are proxied through our server like cameras, so kids' browsers only
// talk to us.
import crypto from 'node:crypto';

const HOUR = 3600_000;
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'WeatherScout/0.1 (self-hosted family weather app; https://github.com/spacegoose02/weather-scout)';
const THUMB_WIDTH = 1280;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ARCHIVE_DAYS = 21;
const KINDS = new Set(['tornado', 'lightning', 'storm']);

const bad = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// Rocky's captions are about the weather itself, so they stay true whatever
// the exact framing of the photo is.
export const CATALOG = [
  {
    title: 'File:Seymour Texas Tornado.jpg', kind: 'tornado',
    caption: 'A giant tornado spins down from a storm cloud over Seymour, Texas, back in 1979.',
    fact: 'A tornado is a spinning column of air that reaches from a thunderstorm all the way down to the ground.',
  },
  {
    title: 'File:Lightning NOAA.jpg', kind: 'lightning',
    caption: 'Zap! Bolts of lightning light up the night sky.',
    fact: 'A lightning bolt is about five times hotter than the surface of the Sun!',
  },
  {
    title: 'File:Binger Oklahoma Tornado.jpg', kind: 'tornado',
    caption: 'Storm scientists took this picture of a tornado near Binger, Oklahoma, in 1981.',
    fact: 'Scientists at the National Severe Storms Laboratory chase storms so they can learn how tornadoes form and warn people sooner.',
  },
  {
    title: 'File:Wall cloud with lightning - NOAA.jpg', kind: 'lightning',
    caption: 'A low, dark wall cloud hangs under a thunderstorm while lightning flashes nearby.',
    fact: 'A wall cloud is a lowered part of a storm cloud. Storm spotters watch them closely because some tornadoes start there.',
  },
  {
    title: 'File:Roping tornado.jpg', kind: 'tornado',
    caption: 'This tornado got skinny and twisty like a rope. That often means it is getting weaker.',
    fact: 'When a tornado is dying, it often stretches into a thin "rope" before it disappears.',
  },
  {
    title: 'File:Denver Lightning.jpg', kind: 'lightning',
    caption: 'Lightning crackles over the city of Denver, Colorado.',
    fact: 'Thunder is the sound lightning makes! The bolt heats the air so fast that it booms.',
  },
  {
    title: 'File:F5 tornado Elie Manitoba 2007.jpg', kind: 'tornado',
    caption: 'This powerful tornado touched down near Elie, Manitoba, in Canada in 2007.',
    fact: 'Scientists rate tornadoes by how strong their winds are, on a scale that goes from 0 to 5.',
  },
  {
    title: 'File:Lightning in Arlington.jpg', kind: 'lightning',
    caption: 'A bright bolt of lightning zips down over Arlington, Virginia.',
    fact: 'Count the seconds between the flash and the thunder, then divide by 5. That is about how many miles away the lightning was!',
  },
  {
    title: 'File:1957 Dallas multi-vortex 1 edited.JPG', kind: 'tornado',
    caption: 'A tornado near Dallas, Texas, in 1957. Look closely: some tornadoes have smaller whirls spinning inside them!',
    fact: 'A "multiple-vortex" tornado has two or more little spinning tubes going around inside one big tornado.',
  },
  {
    title: 'File:Lightning over Oradea Romania 2.jpg', kind: 'lightning',
    caption: 'Lightning branches across the sky over the city of Oradea, in Romania.',
    fact: 'Most lightning never touches the ground. It jumps from cloud to cloud, or inside one cloud.',
  },
  {
    title: 'File:Waurika Oklahoma Tornado Back and Front.jpg', kind: 'tornado',
    caption: 'Two views of the same tornado near Waurika, Oklahoma.',
    fact: 'Tornadoes can happen in every US state, but the Great Plains see the most. People call it Tornado Alley.',
  },
  {
    title: 'File:Lightning Pritzerbe 01 (MK).jpg', kind: 'lightning',
    caption: 'A lightning bolt flashes over the countryside near Pritzerbe, Germany.',
    fact: 'Lightning happens about 40 to 50 times every second somewhere on Earth.',
  },
  {
    title: 'File:Dimmit Sequence.jpg', kind: 'tornado',
    caption: 'Storm scientists photographed this tornado near Dimmitt, Texas, in 1995 during a big research project.',
    fact: 'In the VORTEX project, scientists drove trucks full of instruments around tornadoes to measure them up close.',
  },
  {
    title: 'File:Lightning3.jpg', kind: 'lightning',
    caption: 'A big lightning bolt lights up a dark, stormy sky.',
    fact: 'When thunder roars, go indoors! Stay inside until 30 minutes after the last thunder.',
  },
  {
    title: 'File:Csptornado2.jpg', kind: 'tornado',
    caption: 'A tornado reaches down from a dark storm cloud.',
    fact: 'Most tornadoes spin counterclockwise in the northern half of the Earth.',
  },
  {
    title: 'File:Coup de foudre et bateaux amarrées aux cotes de la Galite.jpg', kind: 'lightning',
    caption: 'Lightning strikes over the sea near boats tied up by the island of La Galite.',
    fact: 'Boats head to shore when storms come, because lightning likes to hit the tallest thing around, even on water.',
  },
];

const ROCKY_SAYS = {
  tornado: 'Tornadoes are amazing to see in pictures, and the safest place to watch one is right here on a screen!',
  lightning: 'Lightning is beautiful from far away. When you hear thunder, we head inside!',
  storm: 'Storms are so cool to learn about. Grown-ups keep watch so we can stay safe.',
};

// ---- helpers -------------------------------------------------------------------
export const photoKey = (title) => crypto.createHash('sha1').update(title).digest('hex').slice(0, 12);

// "File:Foo.jpg", "Foo.jpg" or a commons.wikimedia.org/wiki/File:Foo.jpg link.
export function normalizeTitle(input) {
  let t = String(input || '').trim();
  const m = /commons\.(?:m\.)?wikimedia\.org\/wiki\/(File:[^?#]+)/i.exec(t);
  if (m) t = decodeURIComponent(m[1]);
  t = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/^file:/i.test(t)) t = `File:${t}`;
  t = `File:${t.slice(5).trim()}`;
  if (t.length < 9 || t.length > 240 || !/\.(jpe?g|png|webp|gif|tiff?)$/i.test(t) || /[<>[\]{}|]/.test(t)) return null;
  return t;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function plainText(html, max = 200) {
  const s = String(html || '')
    .replace(/<\/?(?:br|p|div|li|ul|ol|tr|td|table|h\d)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (all, e) => {
      if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(n) ? String.fromCodePoint(n) : '';
      }
      return all;
    })
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// Only pictures anyone may reuse: public domain, CC0, CC BY, CC BY-SA.
export function isFreeLicense(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n || /\bnc\b|non-?commercial|\bnd\b|no-?deriv/.test(n)) return false;
  return /^(public domain|pd\b|pd-|cc0|cc[- ]?by(-sa)?\b|copyrighted free use|attribution\b)/.test(n);
}

export function commonsUrl(titles) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: 'Artist|Credit|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal',
    titles: titles.join('|'),
  });
  return `${COMMONS_API}?${p}`;
}

// Turn a Commons answer into { [ourTitle]: info | { missing } }, following the
// normalized and redirect hops back to the title we asked for.
export function parseCommons(raw, asked) {
  const q = raw?.query || {};
  const hop = new Map();
  for (const n of [...(q.normalized || []), ...(q.redirects || [])]) hop.set(n.from, n.to);
  const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
  const out = {};
  for (const title of asked) {
    let t = title;
    for (let i = 0; i < 4 && hop.has(t); i++) t = hop.get(t);
    const page = byTitle.get(t);
    const ii = page?.imageinfo?.[0];
    if (!page || page.missing || !ii) {
      out[title] = { status: 'missing' };
      continue;
    }
    const meta = ii.extmetadata || {};
    const v = (k) => meta[k]?.value;
    const license = plainText(v('LicenseShortName'), 60);
    const info = {
      status: isFreeLicense(license) && /^image\//.test(ii.mime || 'image/') ? 'ok' : 'not-free',
      commonsTitle: page.title,
      thumbUrl: ii.thumburl || ii.url,
      width: ii.thumbwidth || ii.width || null,
      height: ii.thumbheight || ii.height || null,
      pageUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      artist: plainText(v('Artist'), 120) || 'Unknown photographer',
      credit: plainText(v('Credit'), 160) || null,
      license: license || 'Unknown license',
      licenseUrl: /^https?:\/\//.test(v('LicenseUrl') || '') ? v('LicenseUrl') : null,
      description: plainText(v('ImageDescription'), 240) || null,
      taken: plainText(v('DateTimeOriginal'), 40) || null,
    };
    out[title] = info;
  }
  return out;
}

const dayNumber = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The day's picture: the pool is shuffled once (by a hash of each title, so it
// doesn't depend on list order), then each day steps to the next one. Every
// picture shows once before any repeats.
export function pickForDay(pool, date) {
  if (!pool.length) return null;
  const order = [...pool].sort((a, b) => photoKey(a.title).localeCompare(photoKey(b.title)));
  const n = dayNumber(date);
  return order[((n % order.length) + order.length) % order.length];
}

export function archiveFor(pool, date, days = ARCHIVE_DAYS) {
  const out = [];
  const seen = new Set([pickForDay(pool, date)?.title]);
  for (let i = 1; i <= days; i++) {
    const d = addDays(date, -i);
    const p = pickForDay(pool, d);
    if (!p || seen.has(p.title)) continue;
    seen.add(p.title);
    out.push({ date: d, photo: p });
  }
  return out;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS storm_photo_hidden (
  title TEXT PRIMARY KEY,
  hidden_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS storm_photo_custom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  caption TEXT NOT NULL,
  fact TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export class StormPhotoService {
  constructor(db, cache, fetchImpl = fetch) {
    this.db = db;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
    this.lastGood = {};
    db.exec(SCHEMA);
  }

  entries() {
    const custom = this.db.prepare('SELECT id, title, kind, caption, fact FROM storm_photo_custom ORDER BY id').all()
      .map((r) => ({ ...r, custom: true }));
    const have = new Set(CATALOG.map((c) => c.title));
    return [...CATALOG, ...custom.filter((c) => !have.has(c.title))];
  }

  hiddenSet() {
    return new Set(this.db.prepare('SELECT title FROM storm_photo_hidden').all().map((r) => r.title));
  }

  async lookup(titles) {
    const out = {};
    for (let i = 0; i < titles.length; i += 40) {
      const chunk = titles.slice(i, i + 40);
      const res = await this.fetchImpl(commonsUrl(chunk), { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw bad(`Wikimedia Commons answered ${res.status}.`, 502);
      Object.assign(out, parseCommons(await res.json(), chunk));
    }
    return out;
  }

  // Commons details for every entry, cached for half a day. If Commons is down,
  // the last good answer keeps the pictures going.
  async resolved() {
    const titles = this.entries().map((e) => e.title);
    const key = `storm-photos:${photoKey(titles.join('\n'))}`;
    try {
      const info = await this.cache.wrap(key, 12 * HOUR, () => this.lookup(titles));
      this.lastGood = { ...this.lastGood, ...info };
      return info;
    } catch (e) {
      if (Object.keys(this.lastGood).length) return this.lastGood;
      throw e;
    }
  }

  forget() {
    for (const k of [...this.cache.map.keys()]) if (k.startsWith('storm-photos:')) this.cache.map.delete(k);
  }

  shape(entry, info) {
    return {
      key: photoKey(entry.title),
      title: entry.title,
      kind: entry.kind,
      caption: entry.caption,
      fact: entry.fact || null,
      rocky: ROCKY_SAYS[entry.kind] || ROCKY_SAYS.storm,
      imageUrl: `/api/storm-photo/image/${photoKey(entry.title)}`,
      width: info.width,
      height: info.height,
      credit: { artist: info.artist, source: info.credit, license: info.license, licenseUrl: info.licenseUrl, pageUrl: info.pageUrl },
      description: info.description,
    };
  }

  async pool() {
    const info = await this.resolved();
    const hidden = this.hiddenSet();
    return this.entries()
      .filter((e) => info[e.title]?.status === 'ok' && !hidden.has(e.title))
      .map((e) => this.shape(e, info[e.title]));
  }

  async today(date) {
    const pool = await this.pool();
    const photo = pickForDay(pool, date);
    return { date, photo, archive: archiveFor(pool, date), total: pool.length };
  }

  async image(key, { allowHidden = false } = {}) {
    const info = await this.resolved();
    const entry = this.entries().find((e) => photoKey(e.title) === key);
    const hit = entry && info[entry.title];
    if (!hit || hit.status !== 'ok' || (!allowHidden && this.hiddenSet().has(entry.title))) return null;
    return this.cache.wrap(`storm-img:${key}`, 6 * HOUR, async () => {
      const res = await this.fetchImpl(hit.thumbUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) throw bad('That picture would not load.', 502);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) throw bad('That picture is too big.', 502);
      return { type, buf };
    });
  }

  // ---- admin ---------------------------------------------------------------------
  async adminList() {
    let info = {};
    let error = null;
    try {
      info = await this.resolved();
    } catch (e) {
      error = e.message;
    }
    const hidden = this.hiddenSet();
    return {
      error,
      photos: this.entries().map((e) => {
        const i = info[e.title] || { status: error ? 'unknown' : 'missing' };
        return {
          key: photoKey(e.title), title: e.title, kind: e.kind, caption: e.caption, custom: !!e.custom, id: e.id || null,
          status: i.status, hidden: hidden.has(e.title), pageUrl: i.pageUrl || null, license: i.license || null, artist: i.artist || null,
          imageUrl: i.status === 'ok' ? `/api/storm-photo/image/${photoKey(e.title)}` : null,
        };
      }),
    };
  }

  setHidden(input, hide) {
    const title = this.findTitle(input);
    if (!title) throw bad('That picture is not on the list.', 404);
    if (hide) this.db.prepare('INSERT OR IGNORE INTO storm_photo_hidden (title) VALUES (?)').run(title);
    else this.db.prepare('DELETE FROM storm_photo_hidden WHERE title = ?').run(title);
    this.cache.map.delete(`storm-img:${photoKey(title)}`);
    return { title, hidden: !!hide };
  }

  findTitle(input) {
    const all = this.entries();
    const byKey = all.find((e) => photoKey(e.title) === input);
    if (byKey) return byKey.title;
    const t = normalizeTitle(input);
    return all.find((e) => e.title === t)?.title || null;
  }

  async add({ title, kind = 'storm', caption, fact }) {
    const t = normalizeTitle(title);
    if (!t) throw bad('Paste a Wikimedia Commons file name or link, like File:Lightning NOAA.jpg');
    if (!KINDS.has(kind)) throw bad('kind must be tornado, lightning or storm');
    const cap = String(caption || '').trim().slice(0, 240);
    if (!cap) throw bad('Write a short caption for the kids.');
    if (this.entries().some((e) => e.title === t)) throw bad('That picture is already on the list.');
    const info = (await this.lookup([t]))[t];
    if (info.status === 'missing') throw bad('Wikimedia Commons has no file with that name.');
    if (info.status !== 'ok') throw bad(`That picture's license (${info.license}) does not let us reuse it. Pick a public domain or CC BY / CC BY-SA one.`);
    this.db.prepare('INSERT INTO storm_photo_custom (title, kind, caption, fact) VALUES (?, ?, ?, ?)')
      .run(t, kind, cap, String(fact || '').trim().slice(0, 240) || null);
    this.lastGood[t] = info;
    this.forget();
    return (await this.adminList()).photos.find((p) => p.title === t);
  }

  remove(id) {
    const row = this.db.prepare('SELECT title FROM storm_photo_custom WHERE id = ?').get(id);
    if (!row) return false;
    this.db.prepare('DELETE FROM storm_photo_custom WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM storm_photo_hidden WHERE title = ?').run(row.title);
    this.forget();
    return true;
  }
}

const DATE = '^\\d{4}-\\d{2}-\\d{2}$';

export function registerStormPhoto(app, { db, cache, fetchImpl, requireAdmin }) {
  const svc = new StormPhotoService(db, cache, fetchImpl);

  app.get('/api/storm-photo', {
    schema: { querystring: { type: 'object', properties: { date: { type: 'string', pattern: DATE } } } },
  }, async (req, reply) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    try {
      return await svc.today(date);
    } catch (e) {
      req.log.warn({ err: e.message }, 'storm photo lookup failed');
      return reply.code(200).send({ date, photo: null, archive: [], total: 0, offline: true });
    }
  });

  app.get('/api/storm-photo/image/:key', async (req, reply) => {
    if (!/^[0-9a-f]{12}$/.test(req.params.key)) return reply.code(404).send({ error: 'No such picture.' });
    const img = await svc.image(req.params.key, { allowHidden: !!req.user?.is_admin });
    if (!img) return reply.code(404).send({ error: 'No such picture.' });
    // Private so a hidden picture an admin previewed doesn't stick in a shared cache.
    return reply.header('content-type', img.type).header('cache-control', 'private, max-age=86400').send(img.buf);
  });

  app.get('/api/admin/storm-photos', { preHandler: requireAdmin }, async () => svc.adminList());
  app.post('/api/admin/storm-photos', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', required: ['title', 'caption'], additionalProperties: false,
        properties: { title: { type: 'string', maxLength: 400 }, kind: { type: 'string' }, caption: { type: 'string', maxLength: 400 }, fact: { type: 'string', maxLength: 400 } },
      },
    },
  }, async (req, reply) => reply.code(201).send({ photo: await svc.add(req.body) }));
  app.delete('/api/admin/storm-photos/:id', { preHandler: requireAdmin }, async (req, reply) =>
    svc.remove(Number(req.params.id)) ? { ok: true } : reply.code(404).send({ error: 'Not found' }));
  // Hide (or bring back) one picture for everyone.
  app.post('/api/admin/storm-photos/hidden', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['title'], properties: { title: { type: 'string', maxLength: 400 }, hidden: { type: 'boolean' } } } },
  }, async (req) => svc.setHidden(req.body.title, req.body.hidden !== false));

  return svc;
}
