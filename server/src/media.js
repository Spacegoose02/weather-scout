// Admin-managed lists of weather news feeds and YouTube channels.
import { loadFeed, resolveYoutubeChannel, safeLink, parseFeed } from './providers/news.js';

export class MediaService {
  constructor(db, cache, fetchImpl = fetch) {
    this.db = db;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
  }

  list() {
    return this.db.prepare('SELECT id, kind, title, url, channel_id AS channelId, position FROM media_feeds ORDER BY kind, position, id').all()
      .map((r) => ({ ...r }));
  }

  async add({ kind, title, url }) {
    title = String(title || '').trim().slice(0, 80);
    let channelId = null;
    let link = null;
    if (kind === 'youtube') {
      channelId = await resolveYoutubeChannel(url, this.fetchImpl);
      link = `https://www.youtube.com/channel/${channelId}`;
    } else if (kind === 'rss') {
      link = safeLink(url);
      if (!link) throw Object.assign(new Error('Enter a feed address that starts with https:// or http://'), { statusCode: 400 });
      if (!title) {
        // Check it really is a feed, and borrow its title.
        const res = await this.fetchImpl(link, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw Object.assign(new Error(`That feed answered ${res.status}.`), { statusCode: 400 });
        try {
          title = parseFeed(await res.text()).title.slice(0, 80);
        } catch {
          throw Object.assign(new Error('That address is not an RSS or Atom feed.'), { statusCode: 400 });
        }
      }
    } else {
      throw Object.assign(new Error('kind must be rss or youtube'), { statusCode: 400 });
    }
    if (!title) title = kind === 'youtube' ? 'YouTube channel' : 'News feed';
    const pos = this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media_feeds WHERE kind = ?').get(kind).p;
    const { lastInsertRowid } = this.db.prepare('INSERT INTO media_feeds (kind, title, url, channel_id, position) VALUES (?, ?, ?, ?, ?)').run(kind, title, link, channelId, pos);
    this.cache.map.delete(`media:${kind}`);
    return this.list().find((f) => f.id === Number(lastInsertRowid));
  }

  remove(id) {
    const { changes } = this.db.prepare('DELETE FROM media_feeds WHERE id = ?').run(id);
    this.cache.map.delete('media:rss');
    this.cache.map.delete('media:youtube');
    return changes > 0;
  }

  // Newest first across all feeds of one kind. Feeds that fail are reported, not fatal.
  async items(kind, limit = 30) {
    return this.cache.wrap(`media:${kind}`, 20 * 60_000, async () => {
      const feeds = this.list().filter((f) => f.kind === kind);
      const results = await Promise.allSettled(feeds.map((f) => loadFeed(f, this.fetchImpl)));
      const items = [];
      const status = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') items.push(...r.value);
        status.push({ id: feeds[i].id, title: feeds[i].title, ok: r.status === 'fulfilled', error: r.status === 'rejected' ? r.reason?.message : undefined });
      });
      items.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
      return { items: items.slice(0, limit), feeds: status };
    });
  }
}
