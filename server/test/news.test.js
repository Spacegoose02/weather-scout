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

// ---- local/national, kid-safe, videos, editing ------------------------------
import { parseYoutubeRef, parseNwsProduct, kidSafeText } from '../src/providers/news.js';

const HWO = `000
FLUS41 KAKQ 021000
HWOAKQ

Hazardous Weather Outlook
National Weather Service Wakefield VA
600 AM EST Mon Nov 2 2026

VAZ048-049-031100-
Richmond-Henrico-
600 AM EST Mon Nov 2 2026

This Hazardous Weather Outlook is for central Virginia.

.DAY ONE...Today and Tonight.

STRONG THUNDERSTORMS ARE POSSIBLE THIS AFTERNOON WITH GUSTY WINDS.

.DAYS TWO THROUGH SEVEN...Tuesday through Sunday.

No hazardous weather is expected.

.SPOTTER INFORMATION STATEMENT...

Spotter activation is not expected.

$$`;

test('parses YouTube video and playlist links', () => {
  assert.deepEqual(parseYoutubeRef('https://www.youtube.com/watch?v=abcDEF12345&t=3'), { type: 'video', id: 'abcDEF12345' });
  assert.deepEqual(parseYoutubeRef('youtu.be/abcDEF12345'), { type: 'video', id: 'abcDEF12345' });
  assert.deepEqual(parseYoutubeRef('https://youtube.com/shorts/abcDEF12345'), { type: 'video', id: 'abcDEF12345' });
  assert.deepEqual(parseYoutubeRef('https://www.youtube.com/playlist?list=PLabcdefghijklmnop'), { type: 'playlist', id: 'PLabcdefghijklmnop' });
  assert.equal(parseYoutubeRef('https://www.youtube.com/@stormguy'), null);
  assert.equal(parseYoutubeRef('https://evil.example/watch?v=abcDEF12345'), null);
});

test('reads an NWS Hazardous Weather Outlook', () => {
  const p = parseNwsProduct(HWO, 'HWO');
  assert.equal(p.summary, 'Today and tonight. Strong thunderstorms are possible this afternoon with gusty winds.');
  assert.doesNotMatch(p.text, /VAZ048/);
  assert.doesNotMatch(p.text, /\$\$/);
});

test('kid filter skips grim stories', () => {
  assert.equal(kidSafeText('Tornado kills 3 in Kansas'), false);
  assert.equal(kidSafeText('Storm survey', 'two people were injured'), false);
  assert.equal(kidSafeText('Warm weekend ahead', 'Sunny and 75'), true);
});

test('local and national news, kid mode, single videos, editing and hiding', async () => {
  const LOCAL = RSS.replace('NWS Wakefield', 'WTVR Weather');
  const GRIM = `<?xml version="1.0"?><rss version="2.0"><channel><title>National Wire</title>
<item><title>Flood leaves two dead</title><link>https://wire.example/flood</link><pubDate>Mon, 02 Nov 2026 16:00:00 GMT</pubDate></item>
<item><title>Cold air heads south</title><link>https://wire.example/cold</link><pubDate>Mon, 02 Nov 2026 14:00:00 GMT</pubDate></item>
</channel></rss>`;
  const now = new Date().toISOString();
  const fetchImpl = mockFetch({
    'local.example/rss': () => new Response(LOCAL),
    'wire.example/rss': () => new Response(GRIM),
    'youtube.com/oembed': () => new Response(JSON.stringify({ title: 'How clouds form', author_name: 'SciShow Kids' })),
    'products/types/HWO/locations/AKQ': () => new Response(JSON.stringify({ '@graph': [{ id: 'hwo-1', issuanceTime: now }] })),
    'products/types/AFD/locations/AKQ': () => new Response(JSON.stringify({ '@graph': [{ id: 'afd-1', issuanceTime: now }] })),
    'products/types/PNS/locations/AKQ': () => new Response(JSON.stringify({ '@graph': [] })),
    'products/hwo-1': () => new Response(JSON.stringify({ id: 'hwo-1', issuanceTime: now, productText: HWO })),
    'products/afd-1': () => new Response(JSON.stringify({ id: 'afd-1', issuanceTime: now, productText: '000\nAFDAKQ\n\n200 PM EST Mon Nov 2 2026\n\n.SYNOPSIS...\nA cold front crosses tonight.\n\n.NEAR TERM...\nRain.' })),
  });
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' }, fetchImpl });
  const cookie = cookieFrom(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } }));
  const add = (payload) => app.inject({ method: 'POST', url: '/api/admin/media', headers: { cookie }, payload });

  const local = (await add({ kind: 'rss', url: 'https://local.example/rss', scope: 'local' })).json().feed;
  assert.equal(local.scope, 'local');
  const wire = (await add({ kind: 'rss', url: 'https://wire.example/rss' })).json().feed;
  assert.equal(wire.scope, 'national');
  assert.equal(wire.kidSafe, true);
  assert.equal((await add({ kind: 'rss', url: 'https://wire.example/rss' })).statusCode, 400, 'no duplicates');
  const video = (await add({ kind: 'youtube', url: 'https://youtu.be/abcDEF12345' })).json().feed;
  assert.equal(video.ytType, 'video');
  assert.equal(video.title, 'How clouds form');

  let news = (await app.inject({ url: '/api/news?lat=37.55&lon=-77.46' })).json();
  assert.equal(news.local.length, 1);
  assert.equal(news.local[0].source, 'WTVR Weather');
  assert.equal(news.national.length, 2);
  assert.equal(news.office.id, 'AKQ');
  assert.deepEqual(news.office.products.map((p) => p.type).sort(), ['AFD', 'HWO']);
  assert.equal(news.office.products.find((p) => p.type === 'AFD').summary, 'A cold front crosses tonight.');
  assert.equal(news.videos[0].videoId, 'abcDEF12345');

  // Kid Mode: no grim story, no forecast discussion.
  const kid = (await app.inject({ url: '/api/news?lat=37.55&lon=-77.46&kid=true' })).json();
  assert.deepEqual(kid.national.map((n) => n.title), ['Cold air heads south']);
  assert.deepEqual(kid.office.products.map((p) => p.type), ['HWO']);

  // Grown-ups only feed drops out of Kid Mode entirely.
  const patched = await app.inject({ method: 'PATCH', url: `/api/admin/media/${local.id}`, headers: { cookie }, payload: { kidSafe: false, title: 'Channel 6' } });
  assert.equal(patched.json().feed.title, 'Channel 6');
  assert.equal((await app.inject({ url: '/api/news?kid=true' })).json().local.length, 0);
  assert.equal((await app.inject({ url: '/api/news' })).json().local[0].source, 'Channel 6');

  // Pause a feed, move one, hide a story.
  await app.inject({ method: 'PATCH', url: `/api/admin/media/${wire.id}`, headers: { cookie }, payload: { enabled: false } });
  assert.equal((await app.inject({ url: '/api/news' })).json().national.length, 0);
  await app.inject({ method: 'PATCH', url: `/api/admin/media/${wire.id}`, headers: { cookie }, payload: { enabled: true, move: 'up' } });
  const order = (await app.inject({ url: '/api/admin/media', headers: { cookie } })).json().feeds.filter((f) => f.kind === 'rss').map((f) => f.id);
  assert.deepEqual(order, [wire.id, local.id]);
  const hid = await app.inject({ method: 'POST', url: '/api/admin/media-hidden', headers: { cookie }, payload: { link: 'https://wire.example/cold', title: 'Cold air heads south' } });
  assert.equal(hid.statusCode, 201);
  news = (await app.inject({ url: '/api/news' })).json();
  assert.deepEqual(news.national.map((n) => n.title), ['Flood leaves two dead']);
  await app.inject({ method: 'DELETE', url: `/api/admin/media-hidden/${hid.json().hidden.id}`, headers: { cookie } });
  assert.equal((await app.inject({ url: '/api/news' })).json().national.length, 2);

  assert.equal((await app.inject({ method: 'PATCH', url: `/api/admin/media/${wire.id}`, payload: { title: 'x' } })).statusCode, 401);
  const sugg = (await app.inject({ url: '/api/admin/media-suggestions', headers: { cookie } })).json().suggestions;
  assert.ok(sugg.length >= 3 && sugg.every((s) => s.added === false));
  await app.close();
});
