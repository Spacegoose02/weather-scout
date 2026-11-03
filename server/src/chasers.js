// Live storm chaser streams for the Storm Center.
//
// Two ways to find them:
//  - Without a key: a family-friendly list of chaser and severe-weather channels
//    (the admin can change it), each checked through its public youtube.com/@x/live
//    page. No quota, nothing to set up.
//  - With a YouTube Data API key (Family & settings): the same list, confirmed with
//    videos.list (viewer counts, real start time), plus a YouTube search for other
//    live storm chasing streams for grown-ups. The search costs 100 of the free
//    10,000 daily units, so it is cached for 20 minutes (at most ~7,200 a day).
//
// Kid Mode only ever shows the trusted list, never search results.
import { kidSafeText } from './providers/news.js';

// Handles of well-known chasers and live severe-weather streamers.
export const DEFAULT_CHASERS = [
  { handle: '@RyanHallYall', name: "Ryan Hall, Y'all", note: 'Live severe weather coverage with chasers all over the country' },
  { handle: '@ReedTimmerWx', name: 'Reed Timmer', note: 'Meteorologist and storm chaser in the Dominator truck' },
  { handle: '@PecosHank', name: 'Pecos Hank', note: 'Storm chaser, photographer and great science explainer' },
  { handle: '@MaxVelocityWX', name: 'Max Velocity', note: 'Meteorologist with live storm coverage' },
  { handle: '@LiveStormsMedia', name: 'Live Storms Media', note: 'Many chasers streaming live from the field' },
  { handle: '@VinceWaelti', name: 'Vince Waelti', note: 'Storm chaser and meteorologist' },
];

// Comma-separated @handles or channel ids, as saved in Family & settings.
export const CHASER_LIST = /^\s*(?:@[\w.-]{3,100}|UC[\w-]{22})(?:\s*,\s*(?:@[\w.-]{3,100}|UC[\w-]{22})){0,19}\s*,?\s*$/;

export function parseChaserList(raw) {
  const s = String(raw || '').trim();
  if (!s) return DEFAULT_CHASERS;
  const known = new Map(DEFAULT_CHASERS.map((c) => [c.handle.toLowerCase(), c]));
  return s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20)
    .map((h) => known.get(h.toLowerCase()) || { handle: h, name: h.replace(/^@/, ''), note: '' });
}

export const channelUrl = (handle) => (handle.startsWith('UC') ? `https://www.youtube.com/channel/${handle}` : `https://www.youtube.com/${handle}`);

const decode = (s) => String(s || '')
  .replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .trim();

// The /live page of a channel is the watch page of its stream when it is live,
// and the channel page otherwise.
export function parseLivePage(html) {
  const videoId = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
  if (!videoId || !/"isLiveNow":\s*true/.test(html)) return null;
  const title = decode(html.match(/<meta name="title" content="([^"]*)"/)?.[1] || html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]);
  const channel = decode(html.match(/<link itemprop="name" content="([^"]*)"/)?.[1] || html.match(/"ownerChannelName":"([^"]*)"/)?.[1]);
  const startedAt = html.match(/"startTimestamp":"([^"]+)"/)?.[1] || null;
  return { videoId, title, channel, startedAt };
}

// Grown-up search results: skip the 24/7 "storm sounds" and replay channels.
const NOT_A_CHASE = /\b(sleep|sleeping|relax(?:ing)?|ambient|asmr|lo-?fi|white noise|sounds?|24\/7|music|study|meditat\w*|replay|rerun|compilation|simulator|roblox|minecraft|game)\b/i;
const IS_STORMY = /\b(chas\w*|tornad\w*|storms?|severe|supercells?|hurricanes?|hail|lightning|derecho|twisters?|warnings?)\b/i;
export const looksLikeChase = (title = '', channel = '') => IS_STORMY.test(title) && !NOT_A_CHASE.test(`${title} ${channel}`);

const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

export class ChaserService {
  constructor(cfg, cache, fetchImpl = fetch) {
    this.cfg = cfg;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
  }

  get channels() {
    return parseChaserList(this.cfg.youtube.chasers);
  }

  reset() {
    for (const k of [...this.cache.map.keys()]) if (k.startsWith('chasers:')) this.cache.map.delete(k);
  }

  async checkChannel(c) {
    const res = await this.fetchImpl(`${channelUrl(c.handle)}/live`, {
      headers: { 'accept-language': 'en', 'user-agent': 'Mozilla/5.0 (WeatherScout)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
    const html = (await res.text()).slice(0, 3_000_000);
    return parseLivePage(html);
  }

  async yt(path, params) {
    const q = new URLSearchParams({ ...params, key: this.cfg.youtube.apiKey });
    const res = await this.fetchImpl(`https://www.googleapis.com/youtube/v3/${path}?${q}`, { signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || res.status;
      throw Object.assign(new Error(`YouTube API: ${reason}`), { reason });
    }
    return body;
  }

  // Viewer counts and confirmed live status for up to 50 videos (1 quota unit).
  async details(ids) {
    if (!ids.length) return new Map();
    const body = await this.yt('videos', { part: 'snippet,liveStreamingDetails', id: ids.slice(0, 50).join(',') });
    return new Map((body.items || []).map((v) => [v.id, v]));
  }

  async trusted() {
    return this.cache.wrap('chasers:trusted', 5 * 60_000, async () => {
      const list = this.channels;
      const results = await Promise.allSettled(list.map((c) => this.checkChannel(c)));
      const channels = list.map((c, i) => ({
        handle: c.handle,
        name: c.name,
        note: c.note,
        url: channelUrl(c.handle),
        ok: results[i].status === 'fulfilled',
        live: results[i].status === 'fulfilled' && !!results[i].value,
      }));
      const streams = results.flatMap((r, i) => (r.status === 'fulfilled' && r.value ? [{
        videoId: r.value.videoId,
        title: r.value.title || `${list[i].name} is live`,
        channel: r.value.channel || list[i].name,
        channelUrl: channelUrl(list[i].handle),
        startedAt: r.value.startedAt,
        thumbnail: thumb(r.value.videoId),
        trusted: true,
      }] : []));
      return { channels, streams };
    });
  }

  // Other live storm chasing streams, found by search (grown-ups only, needs a key).
  async search() {
    return this.cache.wrap('chasers:search', 20 * 60_000, async () => {
      const body = await this.yt('search', {
        part: 'snippet', eventType: 'live', type: 'video', q: 'storm chasing live tornado', safeSearch: 'strict',
        relevanceLanguage: 'en', regionCode: 'US', maxResults: '15', order: 'viewCount',
      });
      return (body.items || []).map((it) => ({
        videoId: it.id?.videoId,
        title: decode(it.snippet?.title),
        channel: decode(it.snippet?.channelTitle),
        channelUrl: it.snippet?.channelId ? `https://www.youtube.com/channel/${it.snippet.channelId}` : null,
        thumbnail: it.snippet?.thumbnails?.medium?.url || (it.id?.videoId ? thumb(it.id.videoId) : null),
        trusted: false,
      })).filter((s) => s.videoId && looksLikeChase(s.title, s.channel));
    });
  }

  async live({ kid = false } = {}) {
    const keyed = !!this.cfg.youtube.apiKey;
    const useSearch = keyed && this.cfg.youtube.search && !kid;
    const [trusted, found] = await Promise.all([
      this.trusted(),
      useSearch ? this.search().then((s) => ({ s }), (e) => ({ s: [], error: e.message })) : { s: [] },
    ]);
    let streams = [...trusted.streams];
    const seen = new Set(streams.map((s) => s.videoId));
    for (const s of found.s) if (!seen.has(s.videoId)) { seen.add(s.videoId); streams.push(s); }

    let apiError = found.error;
    if (keyed && streams.length) {
      try {
        const info = await this.cache.wrap(`chasers:details:${[...seen].sort().join(',')}`, 5 * 60_000, () => this.details([...seen]));
        streams = streams.flatMap((s) => {
          const v = info.get(s.videoId);
          if (!v) return s.trusted ? [s] : [];
          if (v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'live') return [];
          const viewers = Number(v.liveStreamingDetails?.concurrentViewers);
          return [{ ...s, title: decode(v.snippet?.title) || s.title, startedAt: v.liveStreamingDetails?.actualStartTime || s.startedAt, viewers: Number.isFinite(viewers) ? viewers : undefined }];
        });
      } catch (e) {
        apiError = e.message;
      }
    }
    if (kid) streams = streams.filter((s) => s.trusted && kidSafeText(s.title));
    streams.sort((a, b) => Number(b.trusted) - Number(a.trusted) || (b.viewers || 0) - (a.viewers || 0));
    return {
      mode: keyed ? 'api' : 'keyless',
      search: useSearch,
      checkedAt: new Date().toISOString(),
      streams: streams.slice(0, 12),
      channels: trusted.channels,
      ...(apiError ? { warning: 'The YouTube key had a problem, so only the trusted channel list was checked.' } : {}),
    };
  }
}

// "Test connection" for the YouTube key (1 quota unit). Never throws.
export async function testYoutubeKey(apiKey, fetchImpl) {
  if (!apiKey) return { ok: false, message: 'Add a YouTube Data API key first. Without one, the trusted chaser list still works.' };
  try {
    const res = await fetchImpl(`https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=US&key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true, message: 'Connected. The YouTube key works, so the Storm Center can search for more live chasers.' };
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (/keyInvalid|badRequest/i.test(reason) || res.status === 400) return { ok: false, message: 'YouTube says that key is not valid. Check it in the Google Cloud console.' };
    if (/accessNotConfigured|forbidden/i.test(reason) || res.status === 403) return { ok: false, message: 'That key works, but the YouTube Data API v3 is not turned on for its project, or the key is restricted.' };
    return { ok: false, message: `YouTube answered with an error (${res.status}).` };
  } catch (err) {
    return { ok: false, message: err?.name === 'TimeoutError' ? 'YouTube took too long to answer.' : 'Could not reach the YouTube API from this server.' };
  }
}
