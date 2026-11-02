// Weather news (RSS/Atom) and YouTube channels. The admin manages the lists; the
// server fetches and caches them, so the browser never talks to the feed hosts
// (YouTube thumbnails and the player load from YouTube itself).
import { XMLParser } from 'fast-xml-parser';
import { UpstreamError, fetchJson } from '../cache.js';

// Titles and descriptions are kept raw (some feeds put bare HTML in them) and cleaned below.
const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', processEntities: false,
  stopNodes: ['*.title', '*.description', '*.summary', '*.media:description'],
});
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const MAX_BYTES = 2_000_000;
const CHANNEL_ID = /^UC[\w-]{22}$/;

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v['#text'] ?? '');
  return String(v);
};
// Decode twice: feeds often escape HTML (&lt;p&gt;) inside an already-escaped field.
const clean = (s, max = 300) => decode(decode(text(s)).replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const safeLink = (u) => {
  try {
    const url = new URL(decode(String(u ?? "")).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};
const iso = (d) => {
  const t = Date.parse(text(d));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// RSS 2.0, RSS 1.0 (RDF) and Atom, including YouTube's channel feed.
export function parseFeed(xml) {
  const doc = parser.parse(xml);
  if (doc.rss?.channel || doc['rdf:RDF']) {
    const ch = doc.rss?.channel || doc['rdf:RDF'];
    const title = clean(ch.title || doc['rdf:RDF']?.channel?.title, 120);
    const items = arr(ch.item).map((it) => ({
      title: clean(it.title, 200),
      link: safeLink(text(it.link) || it.guid?.['#text'] || it.guid),
      published: iso(it.pubDate || it['dc:date']),
      summary: clean(it.description, 280),
    }));
    return { title, items };
  }
  if (doc.feed) {
    const f = doc.feed;
    const linkOf = (e) => {
      const links = arr(e.link);
      const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') || links[0];
      return safeLink(alt?.['@href'] || text(alt));
    };
    const items = arr(f.entry).map((e) => {
      const media = e['media:group'] || {};
      const videoId = text(e['yt:videoId']) || null;
      return {
        title: clean(e.title, 200),
        link: linkOf(e),
        published: iso(e.published || e.updated),
        summary: clean(e.summary || media['media:description'], 280),
        ...(videoId && /^[\w-]{6,20}$/.test(videoId)
          ? { videoId, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` }
          : {}),
      };
    });
    return { title: clean(f.title, 120), items };
  }
  throw new Error('Not an RSS or Atom feed');
}

async function fetchText(url, { source, fetchImpl, headers = {} }) {
  const res = await fetchImpl(url, { headers: { 'user-agent': 'WeatherScout/0.1 (+self-hosted)', ...headers }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new UpstreamError(source, res.status);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new UpstreamError(source, 413, `${source} feed is too large`);
  return body;
}

export const youtubeFeedUrl = (id, type = 'channel') => (type === 'playlist'
  ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`
  : `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);

const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^(PL|UU|LL|FL|OL|RD)[\w-]{10,64}$/;

// A single video or a playlist link. Anything else is treated as a channel.
export function parseYoutubeRef(input) {
  const s = String(input || '').trim();
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return VIDEO_ID.test(id) ? { type: 'video', id } : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const v = url.searchParams.get('v');
  if (v && VIDEO_ID.test(v)) return { type: 'video', id: v };
  const path = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/);
  if (path) return { type: 'video', id: path[1] };
  const list = url.searchParams.get('list');
  if (list && PLAYLIST_ID.test(list)) return { type: 'playlist', id: list };
  return null;
}

// Title and channel name of one video, from YouTube's public oEmbed endpoint.
export async function loadYoutubeVideo(videoId, fetchImpl = fetch) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new Error('That video does not allow playing in other apps.');
  if (!res.ok) throw new Error('Could not find that YouTube video. Is it public?');
  const o = await res.json();
  return { title: clean(o.title, 200), author: clean(o.author_name, 80), link: watch, videoId, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` };
}

// ---- kid-safe filtering ---------------------------------------------------
// Weather news can be grim (deaths, injuries, missing people). Kid Mode skips any
// story whose title or summary mentions these, even from a kid-safe feed.
const NOT_FOR_KIDS = /\b(kill(?:s|ed|ing)?|dead|deaths?|died|dies|dying|bod(?:y|ies)|fatal(?:ity|ities)?|murder(?:ed)?|shoot(?:ing|ings)?|shot|guns?|missing|injur(?:y|ies|ed)|victims?|corpses?|drown(?:s|ed|ing)?|trapped|suicide|wars?|bomb(?:s|ing)?|graphic|terror(?:ism|ist)?|horrific|devastat(?:ed|ing|ion)|catastroph(?:e|ic)|apocalyp\w*)\b/i;
export const kidSafeText = (...parts) => !NOT_FOR_KIDS.test(parts.filter(Boolean).join(' '));

// ---- local NWS office products ---------------------------------------------
// Every NWS forecast office writes a Hazardous Weather Outlook, a forecast
// discussion and public information statements (storm surveys, records, outreach).
export const NWS_PRODUCTS = {
  HWO: { name: 'Hazardous Weather Outlook', maxAgeH: 30, max: 1, kid: true, sections: ['DAY ONE', 'DAYS TWO THROUGH SEVEN'] },
  AFD: { name: 'Forecast discussion', maxAgeH: 30, max: 1, kid: false, sections: ['KEY MESSAGES', 'SYNOPSIS', 'WHAT HAS CHANGED', 'DISCUSSION', 'NEAR TERM'] },
  PNS: { name: 'Public information statement', maxAgeH: 72, max: 3, kid: true, sections: [] },
};

const isShouting = (s) => {
  const letters = s.replace(/[^a-z]/gi, '');
  return letters.length > 20 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8;
};
const sentenceCase = (s) => s.toLowerCase()
  .replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(nws|noaa|spc|wpc|nhc|us|u\.s\.|i-\d+|[a-z]{2}\d{3})\b/g, (m) => m.toUpperCase())
  .replace(/\b(est|edt|cst|cdt|mst|mdt|pst|pdt|utc)\b/g, (m) => m.toUpperCase());
const plain = (s) => {
  const t = s.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return isShouting(t) ? sentenceCase(t) : t;
};

// Pull a readable headline, summary and body out of a raw NWS text bulletin.
export function parseNwsProduct(text, type) {
  const spec = NWS_PRODUCTS[type] || { sections: [] };
  const body = String(text || '').replace(/\r/g, '')
    .replace(/^\s*(&&|\$\$)\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // The WMO header, product code, title, office and issue time come first.
  const timeLine = /^\d{3,4} (AM|PM) [A-Z]{3,4} \w{3} \w{3} \d{1,2} \d{4}$/m;
  const start = paragraphs.findIndex((p) => timeLine.test(p));
  const content = paragraphs.slice(start + 1).filter((p) => !/^[A-Z]{2}Z\d{3}|^\w{2}[CZ]\d{3}[->]/.test(p));
  const headlineRaw = body.match(/^\.\.\.(.{8,160}?)\.\.\.\s*$/m)?.[1];
  const section = (name) => {
    const re = new RegExp(`^\\.${name.replace(/ /g, '\\s+')}[^.]*?\\.\\.\\.\\s*`, 'i');
    const i = content.findIndex((p) => re.test(p));
    if (i < 0) return '';
    const out = [content[i].replace(re, '')];
    for (let j = i + 1; j < content.length && !/^\.[A-Z]/.test(content[j]); j += 1) out.push(content[j]);
    return out.join('\n\n');
  };
  let summary = '';
  for (const name of spec.sections) {
    summary = section(name);
    if (summary.trim()) break;
  }
  if (!summary) summary = content.find((p) => !/^\.\.\./.test(p) && p.length > 40) || content[0] || '';
  const fullText = content.map(plain).join('\n\n').slice(0, 8000);
  return {
    headline: headlineRaw ? plain(headlineRaw) : null,
    summary: plain(summary.replace(/^\.[A-Z][^.]*\.\.\./, '')).slice(0, 700),
    text: fullText,
  };
}

export async function getOfficeProducts(office, { userAgent, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!/^[A-Z]{3}$/.test(office || '')) return [];
  const headers = { 'User-Agent': userAgent, Accept: 'application/ld+json' };
  const lists = await Promise.allSettled(Object.keys(NWS_PRODUCTS).map(async (type) => {
    const spec = NWS_PRODUCTS[type];
    const list = await fetchJson(`https://api.weather.gov/products/types/${type}/locations/${office}`, { source: 'nws', fetchImpl, headers });
    const recent = (list?.['@graph'] || [])
      .filter((p) => now - Date.parse(p.issuanceTime) < spec.maxAgeH * 3600_000)
      .slice(0, spec.max);
    const full = await Promise.allSettled(recent.map((p) => fetchJson(`https://api.weather.gov/products/${encodeURIComponent(p.id)}`, { source: 'nws', fetchImpl, headers })));
    return full.filter((r) => r.status === 'fulfilled' && r.value?.productText).map(({ value: p }) => {
      const parsed = parseNwsProduct(p.productText, type);
      return {
        id: p.id,
        type,
        name: spec.name,
        title: parsed.headline || spec.name,
        summary: parsed.summary,
        text: parsed.text,
        published: iso(p.issuanceTime),
        link: `https://forecast.weather.gov/product.php?site=${office}&issuedby=${office}&product=${type}`,
        kidSafe: spec.kid && kidSafeText(parsed.headline, parsed.summary),
      };
    });
  }));
  return lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => (b.published || '').localeCompare(a.published || ''));
}

// Accepts a channel id (UC...), a /channel/UC... URL, or an @handle / youtube.com/@handle URL.
export async function resolveYoutubeChannel(input, fetchImpl = fetch) {
  const s = String(input || '').trim();
  if (CHANNEL_ID.test(s)) return s;
  const fromUrl = s.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  if (fromUrl) return fromUrl[1];
  const handle = s.match(/(?:youtube\.com\/)?(@[\w.-]{3,100})/);
  if (!handle) throw new Error('Enter a YouTube channel link, @handle, or channel id (starts with UC).');
  const html = await fetchText(`https://www.youtube.com/${handle[1]}`, { source: 'YouTube', fetchImpl, headers: { 'accept-language': 'en' } });
  const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1]
    || html.match(/"externalId":"(UC[\w-]{22})"/)?.[1]
    || html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  if (!id) throw new Error(`Could not find the YouTube channel ${handle[1]}.`);
  return id;
}

export async function loadFeed(feed, fetchImpl = fetch) {
  const tag = (i) => ({ ...i, source: feed.title, feedId: feed.id, scope: feed.scope || 'national', kidSafe: feed.kidSafe !== false && kidSafeText(i.title, i.summary) });
  if (feed.kind === 'youtube' && feed.ytType === 'video') {
    const v = await loadYoutubeVideo(feed.channelId, fetchImpl);
    return [tag({ ...v, summary: v.author ? `From ${v.author}` : '', published: null, pinned: true })];
  }
  const url = feed.kind === 'youtube' ? youtubeFeedUrl(feed.channelId, feed.ytType) : feed.url;
  const parsed = parseFeed(await fetchText(url, { source: feed.title || 'a news feed', fetchImpl }));
  return parsed.items.filter((i) => i.title && i.link).slice(0, 15).map(tag);
}
