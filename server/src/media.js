// Admin-managed lists of weather news feeds and YouTube channels, playlists and
// single videos, each marked local or national and kid-safe or grown-ups only.
import { loadFeed, resolveYoutubeChannel, parseYoutubeRef, loadYoutubeVideo, safeLink, parseFeed } from './providers/news.js';

const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });
const SCOPES = new Set(['local', 'national']);

// Free, official or educational sources an admin can add with one click.
export const SUGGESTED_FEEDS = [
  { kind: 'rss', scope: 'national', kidSafe: true, title: 'NOAA National Hurricane Center (Atlantic)', url: 'https://www.nhc.noaa.gov/index-at.xml', note: 'Tropical storm advisories and outlooks' },
  { kind: 'rss', scope: 'national', kidSafe: true, title: 'NOAA National Hurricane Center (Eastern Pacific)', url: 'https://www.nhc.noaa.gov/index-ep.xml', note: 'Pacific tropical storms' },
  { kind: 'rss', scope: 'national', kidSafe: false, title: 'NOAA Storm Prediction Center', url: 'https://www.spc.noaa.gov/products/spcrss.xml', note: 'Severe storm outlooks, watches and mesoscale discussions (technical)' },
  { kind: 'rss', scope: 'national', kidSafe: true, title: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov/feeds/earth-observatory.rss', note: 'Satellite pictures of storms, smoke, snow and more' },
];

export class MediaService {
  constructor(db, cache, fetchImpl = fetch) {
    this.db = db;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
  }

  list() {
    return this.db.prepare(`SELECT id, kind, title, url, channel_id AS ytId, yt_type AS ytType, scope, kid_safe AS kidSafe, enabled, position
      FROM media_feeds ORDER BY kind, position, id`).all()
      .map((r) => {
        const out = { ...r, kidSafe: !!r.kidSafe, enabled: !!r.enabled };
        delete out.ytId;
        if (r.kind === 'youtube') {
          out.ytType = r.ytType || 'channel';
          out[out.ytType === 'video' ? 'videoId' : out.ytType === 'playlist' ? 'playlistId' : 'channelId'] = r.ytId;
          out.channelId = r.ytId; // kept for older clients; holds the video or playlist id for those types
        } else {
          delete out.ytType;
        }
        return out;
      });
  }

  clearCache() {
    this.cache.map.delete('media:rss');
    this.cache.map.delete('media:youtube');
  }

  async add({ kind, title, url, scope = 'national', kidSafe = true }) {
    title = String(title || '').trim().slice(0, 80);
    if (!SCOPES.has(scope)) throw bad('scope must be local or national');
    let ytId = null;
    let ytType = 'channel';
    let link = null;
    if (kind === 'youtube') {
      const ref = parseYoutubeRef(url);
      if (ref?.type === 'video') {
        const v = await loadYoutubeVideo(ref.id, this.fetchImpl);
        if (!title) title = v.title.slice(0, 80);
        link = v.link;
      } else if (ref?.type === 'playlist') {
        link = `https://www.youtube.com/playlist?list=${ref.id}`;
        if (!title) title = 'YouTube playlist';
      }
      if (ref) {
        ytId = ref.id;
        ytType = ref.type;
      } else {
        ytId = await resolveYoutubeChannel(url, this.fetchImpl);
        link = `https://www.youtube.com/channel/${ytId}`;
      }
      if (this.db.prepare("SELECT 1 FROM media_feeds WHERE kind = 'youtube' AND channel_id = ?").get(ytId)) throw bad('That one is already on the list.');
    } else if (kind === 'rss') {
      link = safeLink(url);
      if (!link) throw bad('Enter a feed address that starts with https:// or http://');
      if (this.db.prepare("SELECT 1 FROM media_feeds WHERE kind = 'rss' AND url = ?").get(link)) throw bad('That feed is already on the list.');
      if (!title) {
        // Check it really is a feed, and borrow its title.
        const res = await this.fetchImpl(link, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw bad(`That feed answered ${res.status}.`);
        try {
          title = parseFeed(await res.text()).title.slice(0, 80);
        } catch {
          throw bad('That address is not an RSS or Atom feed.');
        }
      }
    } else {
      throw bad('kind must be rss or youtube');
    }
    if (!title) title = kind === 'youtube' ? 'YouTube channel' : 'News feed';
    const pos = this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media_feeds WHERE kind = ?').get(kind).p;
    const { lastInsertRowid } = this.db.prepare('INSERT INTO media_feeds (kind, title, url, channel_id, yt_type, scope, kid_safe, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(kind, title, link, ytId, ytType, scope, kidSafe ? 1 : 0, pos);
    this.clearCache();
    return this.list().find((f) => f.id === Number(lastInsertRowid));
  }

  // Rename, re-scope, mark kid-safe, pause, or move up/down within its kind.
  update(id, { title, scope, kidSafe, enabled, move } = {}) {
    const row = this.db.prepare('SELECT id, kind, position FROM media_feeds WHERE id = ?').get(id);
    if (!row) return null;
    const sets = [];
    const vals = [];
    if (title !== undefined) {
      const t = String(title).trim().slice(0, 80);
      if (!t) throw bad('The name cannot be empty.');
      sets.push('title = ?'); vals.push(t);
    }
    if (scope !== undefined) {
      if (!SCOPES.has(scope)) throw bad('scope must be local or national');
      sets.push('scope = ?'); vals.push(scope);
    }
    if (kidSafe !== undefined) { sets.push('kid_safe = ?'); vals.push(kidSafe ? 1 : 0); }
    if (enabled !== undefined) { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0); }
    if (sets.length) this.db.prepare(`UPDATE media_feeds SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    if (move === 'up' || move === 'down') {
      // Renumber first so positions are unique, then swap with the neighbour.
      const ids = this.db.prepare('SELECT id FROM media_feeds WHERE kind = ? ORDER BY position, id').all(row.kind).map((r) => r.id);
      const i = ids.indexOf(id);
      const j = move === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < ids.length) [ids[i], ids[j]] = [ids[j], ids[i]];
      const setPos = this.db.prepare('UPDATE media_feeds SET position = ? WHERE id = ?');
      ids.forEach((fid, p) => setPos.run(p, fid));
    }
    this.clearCache();
    return this.list().find((f) => f.id === id);
  }

  remove(id) {
    const { changes } = this.db.prepare('DELETE FROM media_feeds WHERE id = ?').run(id);
    this.clearCache();
    return changes > 0;
  }

  suggestions() {
    const have = new Set(this.db.prepare("SELECT url FROM media_feeds WHERE kind = 'rss'").all().map((r) => r.url));
    return SUGGESTED_FEEDS.map((s) => ({ ...s, added: have.has(safeLink(s.url)) }));
  }

  // Hide one story or video for everyone (by its link).
  hide({ link, title }) {
    const l = safeLink(link);
    if (!l) throw bad('That link is not valid.');
    this.db.prepare('INSERT OR IGNORE INTO media_hidden (link, title) VALUES (?, ?)').run(l, String(title || '').slice(0, 200));
    return this.hiddenList().find((h) => h.link === l);
  }

  unhide(id) {
    return this.db.prepare('DELETE FROM media_hidden WHERE id = ?').run(id).changes > 0;
  }

  hiddenList() {
    return this.db.prepare('SELECT id, link, title, hidden_at AS hiddenAt FROM media_hidden ORDER BY id DESC').all().map((r) => ({ ...r }));
  }

  // Newest first across all feeds of one kind (pinned single videos lead, in list
  // order). Feeds that fail are reported, not fatal. With kid: true, only kid-safe
  // feeds and stories come back.
  async items(kind, limit = 30, { kid = false } = {}) {
    const all = await this.cache.wrap(`media:${kind}`, 20 * 60_000, async () => {
      const feeds = this.list().filter((f) => f.kind === kind && f.enabled);
      const results = await Promise.allSettled(feeds.map((f) => loadFeed({ ...f, channelId: f.channelId }, this.fetchImpl)));
      const items = [];
      const status = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') items.push(...r.value);
        status.push({ id: feeds[i].id, title: feeds[i].title, ok: r.status === 'fulfilled', error: r.status === 'rejected' ? r.reason?.message : undefined });
      });
      const pinned = items.filter((i) => i.pinned);
      const rest = items.filter((i) => !i.pinned).sort((a, b) => (b.published || '').localeCompare(a.published || ''));
      return { items: [...pinned, ...rest], feeds: status };
    });
    const hidden = new Set(this.db.prepare('SELECT link FROM media_hidden').all().map((r) => r.link));
    const seen = new Set();
    const items = all.items.filter((i) => {
      if (hidden.has(i.link) || seen.has(i.link) || (kid && !i.kidSafe)) return false;
      seen.add(i.link);
      return true;
    });
    return { items: items.slice(0, limit), feeds: all.feeds };
  }
}
