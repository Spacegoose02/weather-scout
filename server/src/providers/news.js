// Weather news (RSS/Atom) and YouTube channels. The admin manages the lists; the
// server fetches and caches them, so the browser never talks to the feed hosts
// (YouTube thumbnails and the player load from YouTube itself).
import { XMLParser } from 'fast-xml-parser';
import { UpstreamError } from '../cache.js';

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

export const youtubeFeedUrl = (channelId) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

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
  const url = feed.kind === 'youtube' ? youtubeFeedUrl(feed.channelId) : feed.url;
  const parsed = parseFeed(await fetchText(url, { source: feed.title || 'a news feed', fetchImpl }));
  return parsed.items.filter((i) => i.title && i.link).slice(0, 15).map((i) => ({ ...i, source: feed.title, feedId: feed.id }));
}
