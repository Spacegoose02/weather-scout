// School tomorrow: the snow day meter plus the real word from the school district.
// There is no free national feed of school closings, so the family points
// Weather Scout at their own district's page or news feed (Family & settings).
// The server reads it every few minutes and looks for closing, delay,
// early-dismissal or virtual-day wording that mentions a day. A grown-up can
// also set the status by hand, which wins until the day is over.
import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { snowDayOdds, nextSchoolMorning } from '../../shared/winter.js';

const MIN = 60_000;
const MAX_BYTES = 2_000_000;

export const STATUSES = {
  closed: { label: 'Closed', emoji: '🏠', kid: 'No school! It’s a snow day. Stay warm and play safe!', rank: 5 },
  virtual: { label: 'Virtual learning day', emoji: '💻', kid: 'School at home today, on the computer.', rank: 4 },
  delay: { label: 'Delayed opening', emoji: '⏰', kid: 'School starts late, so you get a slow morning.', rank: 3 },
  early: { label: 'Early dismissal', emoji: '🚌', kid: 'School lets out early today. Get home before the weather gets bad.', rank: 2 },
  open: { label: 'Open on time', emoji: '🏫', kid: 'School is open like normal. Bundle up for the bus!', rank: 1 },
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const PATTERNS = [
  ['closed', /\b(schools?|district|campus(es)?|classes|buildings?|offices?)\b[^.!?]{0,60}\b(will be |are |is |remain )?(closed|closing)\b|\bno school\b|\bclosed (today|tomorrow|on (monday|tuesday|wednesday|thursday|friday))|\bsnow day\b(?! (odds|chance|prediction|calculator))/i],
  ['virtual', /\b(virtual|remote|online|e-?learning|at-home learning|asynchronous|nontraditional instruction|NTI|flexible instruction)\b[^.!?]{0,20}\bday\b|\b(virtual|remote) (learning|instruction)\b/i],
  ['delay', /\b(one|two|three|1|2|3)[- ]?(hour|hr)s?\b[^.!?]{0,15}\b(delay|delayed|late (start|opening|arrival))|\bdelayed (opening|start)\b|\blate (start|opening)\b/i],
  ['early', /\bearly (dismissal|release|closing)\b|\bdismiss(ing|ed)? (early|at noon)\b/i],
  ['open', /\b(schools?|district)\b[^.!?]{0,40}\b(open(s|ing)? on time|on a normal schedule|normal (schedule|operations|hours)|regular schedule)\b|\bopen on time\b/i],
];
// Boilerplate that mentions closings without announcing one.
const BOILERPLATE = /\b(in the event of|if (there is|we have|schools? (are|is))|when schools? (are|is) closed|how (we|the district) (decide|make)|closings? (and|&) delays? (policy|procedures|information)|sign up|subscribe|learn (more|how)|make-?up day|calendar|(were|was|had been|has been) (closed|delayed|dismissed))\b/i;

// HTML or a news feed -> plain sentences (newest feed items first, with their dates).
export function textBlocks(body, contentType = '') {
  const s = String(body || '');
  if (/xml|rss|atom/i.test(contentType) || /^\s*<\?xml|<rss[\s>]|<feed[\s>]/i.test(s.slice(0, 500))) {
    try {
      const x = new XMLParser({ ignoreAttributes: false, processEntities: true, htmlEntities: true }).parse(s);
      const items = [].concat(x?.rss?.channel?.item || x?.feed?.entry || x?.['rdf:RDF']?.item || []);
      return items.slice(0, 20).map((it) => ({
        text: stripHtml(`${textOf(it.title)}. ${textOf(it.description || it.summary || it.content || '')}`),
        date: Date.parse(textOf(it.pubDate || it.updated || it.published || it['dc:date'] || '')) || null,
      }));
    } catch {
      /* fall through to HTML */
    }
  }
  return [{ text: stripHtml(s), date: null }];
}
const textOf = (v) => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? v._ ?? '') : String(v));
export function stripHtml(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|footer|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&apos;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([.!?:])(\s*\.)+/g, '$1')
    .trim();
}

// Which day a sentence talks about, relative to `local` (the place's local date and weekday).
export function dayMentioned(sentence, { today, tomorrow, weekdays }) {
  const s = sentence.toLowerCase();
  if (/\btoday\b|\bthis morning\b|\btonight\b/.test(s)) return today;
  if (/\btomorrow\b/.test(s)) return tomorrow;
  for (const [date, name] of weekdays) if (new RegExp(`\\b${name}\\b`).test(s)) return date;
  const m = s.match(new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})\\b`));
  if (m) {
    const month = MONTHS.indexOf(m[1]) + 1;
    const md = `${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
    for (const [date] of weekdays) if (date.slice(5) === md) return date;
    if (today.slice(5) === md) return today;
  }
  const n = s.match(/\b(\d{1,2})\/(\d{1,2})(\/\d{2,4})?\b/);
  if (n) {
    const md = `${n[1].padStart(2, '0')}-${n[2].padStart(2, '0')}`;
    for (const [date] of [[today], [tomorrow], ...weekdays]) if (date.slice(5) === md) return date;
  }
  return null;
}

// The local dates this week, for matching "Monday" or "Jan 12" to a date.
export function localDays(now, offsetSec) {
  const d = new Date(now + offsetSec * 1000);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const iso = (n) => new Date(base + n * 86400_000).toISOString().slice(0, 10);
  const weekdays = [];
  // Districts announce a day or two ahead (Friday for Monday), so only the next 4 days count.
  for (let i = 0; i < 4; i++) weekdays.push([iso(i), DAYS[new Date(base + i * 86400_000).getUTCDay()]]);
  return { today: iso(0), tomorrow: iso(1), weekdays };
}

// Find the district's status in a page or feed. Only sentences that name a day
// (or feed items from the last 18 hours) count, and the strongest wins.
export function findStatus(blocks, { now = Date.now(), offsetSec = 0, schoolName = '' } = {}) {
  const local = localDays(now, offsetSec);
  let best = null;
  for (const b of blocks) {
    if (b.date && now - b.date > 18 * 3600_000) continue;
    for (const sentence of b.text.split(/(?<=[.!?])\s+|\s{2,}|\s[|•]\s/)) {
      const s = sentence.trim();
      if (s.length < 8 || s.length > 400 || BOILERPLATE.test(s)) continue;
      for (const [status, re] of PATTERNS) {
        if (!re.test(s)) continue;
        const date = dayMentioned(s, local) || (b.date ? local.today : null);
        if (!date || date < local.today) continue;
        const rank = STATUSES[status].rank;
        // Mentions of the school's own name make a match more certain.
        const named = schoolName && s.toLowerCase().includes(schoolName.toLowerCase().split(/\s+/)[0]);
        const score = rank * 10 + (named ? 1 : 0) - (date === local.today ? 0 : 0.5);
        if (!best || score > best.score) best = { status, date, text: s.slice(0, 300), score };
        break;
      }
    }
  }
  if (!best) return null;
  const { score, ...out } = best;
  return out;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS school_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL,
  for_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  set_by TEXT,
  set_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export class SchoolService {
  constructor(db, cfg, { fetchImpl, forecast, log = console, onChange } = {}) {
    this.db = db;
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
    this.forecast = forecast;
    this.log = log;
    this.onChange = onChange;
    this.official = null; // { status, date, text, checkedAt, error }
    this.lastKey = null;
    db.exec(SCHEMA);
  }

  get name() {
    return String(this.cfg.env.SCHOOL_NAME || '').trim();
  }

  get url() {
    return String(this.cfg.env.SCHOOL_STATUS_URL || '').trim();
  }

  async read(url = this.url, { now = Date.now(), offsetSec = 0 } = {}) {
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'WeatherScout (school status)', Accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.5' } });
    if (!res.ok) throw Object.assign(new Error(`The district page answered ${res.status}.`), { statusCode: 502 });
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw Object.assign(new Error('The district page is too big to read.'), { statusCode: 502 });
    const body = (await res.text()).slice(0, MAX_BYTES);
    return findStatus(textBlocks(body, res.headers.get('content-type') || ''), { now, offsetSec, schoolName: this.name });
  }

  // One check of the district page; tells listeners when the status changes.
  async check(now = Date.now()) {
    if (!this.url) {
      this.official = null;
      return null;
    }
    const home = this.cfg.defaultLocation;
    const fc = this.forecast ? await this.forecast({ lat: home.lat, lon: home.lon }).catch(() => null) : null;
    const offsetSec = fc?.utcOffsetSeconds || 0;
    try {
      const found = await this.read(this.url, { now, offsetSec });
      this.official = { ...(found || { status: null }), checkedAt: new Date(now).toISOString(), error: null };
      if (found && found.status !== 'open') {
        const key = `school:${found.status}:${found.date}:${crypto.createHash('sha1').update(found.text).digest('hex').slice(0, 8)}`;
        if (key !== this.lastKey) {
          this.lastKey = key;
          await this.onChange?.({ ...found, source: 'district', key });
        }
      }
    } catch (err) {
      this.official = { ...(this.official || {}), checkedAt: new Date(now).toISOString(), error: err.message };
      this.log.warn?.({ err: err.message }, 'school status page unavailable');
    }
    return this.official;
  }

  manual(today) {
    const r = this.db.prepare('SELECT * FROM school_status WHERE id = 1').get();
    if (!r || r.for_date < today) return null;
    return { status: r.status, date: r.for_date, note: r.note, setBy: r.set_by, setAt: r.set_at };
  }

  async setManual({ status, date, note }, user) {
    if (status === null) {
      this.db.prepare('DELETE FROM school_status WHERE id = 1').run();
      return null;
    }
    if (!STATUSES[status]) throw Object.assign(new Error('Pick closed, delayed, early dismissal, virtual or open.'), { statusCode: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Object.assign(new Error('Pick the school day this is for.'), { statusCode: 400 });
    const clean = String(note || '').replace(/[<>]/g, '').trim().slice(0, 160);
    this.db.prepare(`INSERT INTO school_status (id, status, for_date, note, set_by, set_at) VALUES (1, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, for_date = excluded.for_date, note = excluded.note, set_by = excluded.set_by, set_at = excluded.set_at`)
      .run(status, date, clean, user?.display_name || user?.username || null);
    if (status !== 'open') await this.onChange?.({ status, date, text: clean, source: 'family', key: `school:${status}:${date}:family` });
    return this.manual('0000-00-00');
  }

  // The card: the snow day odds, plus the official or family status when there is one.
  async view(l, { forecast, now = Date.now() } = {}) {
    const fc = await forecast(l).catch(() => null);
    const off = fc?.utcOffsetSeconds || 0;
    const { today } = localDays(now, off);
    const odds = fc ? snowDayOdds(fc, now) : { ...nextSchoolMorning(now, off), chance: null, reason: 'The forecast is not available right now.' };
    const manual = this.manual(today);
    const official = this.official?.status && this.official.date >= today ? this.official : null;
    const pick = manual || official;
    return {
      school: this.name || null,
      configured: !!this.url,
      url: this.url || null,
      odds,
      status: pick ? { ...pick, ...STATUSES[pick.status], source: manual ? 'family' : 'district' } : null,
      checkedAt: this.official?.checkedAt || null,
      error: this.official?.error || null,
    };
  }

  start(everyMs = 10 * MIN) {
    this.stop();
    const run = () => this.check().catch((err) => this.log.error?.(err, 'school status check failed'));
    this.timer = setInterval(run, everyMs);
    this.timer.unref?.();
    setTimeout(run, 15_000).unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }
}

export function schoolPushPayload(ev, schoolName) {
  const s = STATUSES[ev.status];
  const who = schoolName || 'School';
  const day = ev.dayWord ? ` ${ev.dayWord}` : '';
  return {
    title: `${s.emoji} ${who}: ${s.label.toLowerCase()}${day}`,
    body: ev.text ? ev.text.slice(0, 180) : s.kid,
    tag: 'school',
    url: '/?school=1',
    requireInteraction: false,
  };
}

export function registerSchool(app, { school, requireAdmin, latLonSchema, loc, forecast }) {
  app.get('/api/school', { schema: latLonSchema }, async (req) => school.view(loc(req.query), { forecast }));
  app.put('/api/admin/school/status', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: ['string', 'null'], maxLength: 20 }, date: { type: 'string', maxLength: 10 }, note: { type: 'string', maxLength: 200 } } } },
  }, async (req) => ({ manual: await school.setManual(req.body, req.user) }));
  app.post('/api/admin/school/check', { preHandler: requireAdmin }, async () => ({ result: await school.check() }));
}
