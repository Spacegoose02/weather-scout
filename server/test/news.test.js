import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, resolveYoutubeChannel, safeLink } from '../src/providers/news.js';
import { testApp, mockFetch, cookieFrom } from './helpers.js';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>NWS Wakefield</title>
<item><title>Storms <b>tonight</b></title><link>https://www.weather.gov/akq/storms</link><pubDate>Mon, 02 Nov 2026 15:00:00 GMT</pubDate><description>&lt;p&gt;Strong storms possible&lt;/p&gt;</description></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

const YT = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
<title>Storm Channel</title>
<entry><id>yt:video:abcDEF12345</id><yt:videoId>abcDEF12345</yt:videoId><title>Live: tornado outbreak</title>
<link rel="alternate" href="https://www.youtube.com/watch?v=abcDEF12345"/><published>2026-11-02T18:00:00+00:00</published>
<media:group><media:description>Tracking storms</media:description></media:group></entry></feed>`;

const CHANNEL = 'UC' + 'a'.repeat(22);

test('parses RSS and drops unsafe links', () => {
  const f = parseFeed(RSS);
  assert.equal(f.title, 'NWS Wakefield');
  assert.equal(f.items[0].title, 'Storms tonight');
  assert.equal(f.items[0].summary, 'Strong storms possible');
  assert.equal(f.items[0].published, '2026-11-02T15:00:00.000Z');
  assert.equal(f.items[1].link, null);
  assert.equal(safeLink('javascript:alert(1)'), null);
});

test('parses a YouTube channel feed', () => {
  const f = parseFeed(YT);
  assert.equal(f.items[0].videoId, 'abcDEF12345');
  assert.equal(f.items[0].link, 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.match(f.items[0].thumbnail, /i\.ytimg\.com\/vi\/abcDEF12345/);
});

test('resolves YouTube channel ids, URLs and handles', async () => {
  assert.equal(await resolveYoutubeChannel(CHANNEL), CHANNEL);
  assert.equal(await resolveYoutubeChannel(`https://www.youtube.com/channel/${CHANNEL}`), CHANNEL);
  const f = mockFetch({ 'youtube.com/@stormguy': () => new Response(`<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}">`) });
  assert.equal(await resolveYoutubeChannel('https://www.youtube.com/@stormguy', f), CHANNEL);
  await assert.rejects(resolveYoutubeChannel('not a channel'), /YouTube channel/);
});

test('admins manage news and video feeds; everyone can read them', async () => {
  const fetchImpl = mockFetch({
    'news.example/rss': () => new Response(RSS),
    'youtube.com/@stormguy': () => new Response(`"externalId":"${CHANNEL}"`),
    'feeds/videos.xml': () => new Response(YT),
  });
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' }, fetchImpl });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const cookie = cookieFrom(login);

  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/media', payload: { kind: 'rss', url: 'https://news.example/rss' } })).statusCode, 401);
  const rss = await app.inject({ method: 'POST', url: '/api/admin/media', headers: { cookie }, payload: { kind: 'rss', url: 'https://news.example/rss' } });
  assert.equal(rss.statusCode, 201);
  assert.equal(rss.json().feed.title, 'NWS Wakefield');
  const yt = await app.inject({ method: 'POST', url: '/api/admin/media', headers: { cookie }, payload: { kind: 'youtube', url: '@stormguy', title: 'Storm Guy' } });
  assert.equal(yt.json().feed.channelId, CHANNEL);
  const bad = await app.inject({ method: 'POST', url: '/api/admin/media', headers: { cookie }, payload: { kind: 'rss', url: 'ftp://x' } });
  assert.equal(bad.statusCode, 400);

  const news = (await app.inject({ url: '/api/news' })).json();
  assert.equal(news.news.length, 1);
  assert.equal(news.news[0].source, 'NWS Wakefield');
  assert.equal(news.videos[0].videoId, 'abcDEF12345');
  assert.equal(news.videos[0].source, 'Storm Guy');

  const del = await app.inject({ method: 'DELETE', url: `/api/admin/media/${rss.json().feed.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 200);
  assert.equal((await app.inject({ url: '/api/news' })).json().news.length, 0);
  await app.close();
});

test('weather includes health and moon', async () => {
  const { app } = await testApp();
  const w = (await app.inject({ url: '/api/weather?lat=37.55&lon=-77.46' })).json();
  assert.ok(w.health.pressure.level);
  assert.ok(w.health.heat.now.wbgt);
  assert.ok(w.moon.name);
  await app.close();
});
