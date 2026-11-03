import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch, cookieFrom } from './helpers.js';
import { parseLivePage, parseChaserList, looksLikeChase, DEFAULT_CHASERS } from '../src/chasers.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (body) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const LIVE = (id, title, channel) => `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=${id}"><meta name="title" content="${title}"></head>
<body><span itemprop="author"><link itemprop="name" content="${channel}"></span><script>var x={"isLiveNow":true,"startTimestamp":"2026-05-01T18:00:00+00:00"}</script></body></html>`;
const OFFLINE = '<html><head><link rel="canonical" href="https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx"></head></html>';

// Ryan Hall and Pecos Hank are live; everyone else is offline; one channel errors.
const youtube = (extra = {}) => mockFetch({
  '/@RyanHallYall/live': () => html(LIVE('ryanhall001', 'LIVE: Tornado outbreak coverage', "Ryan Hall, Y'all")),
  '/@PecosHank/live': () => html(LIVE('pecoshank01', 'Chasing supercells in Kansas', 'Pecos Hank')),
  '/@VinceWaelti/live': () => new Response('nope', { status: 500 }),
  'youtube.com/@': () => html(OFFLINE),
  ...extra,
});

test('parses a live /live page and ignores an offline one', () => {
  const s = parseLivePage(LIVE('abcdefghijk', 'Storm &amp; hail live', 'Chaser'));
  assert.deepEqual(s, { videoId: 'abcdefghijk', title: 'Storm & hail live', channel: 'Chaser', startedAt: '2026-05-01T18:00:00+00:00' });
  assert.equal(parseLivePage(OFFLINE), null);
  // An old premiere with the canonical watch link but not live now.
  assert.equal(parseLivePage('<link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk">"isLiveNow":false'), null);
});

test('chaser list: blank is the built-in list, custom handles keep known names', () => {
  assert.equal(parseChaserList('').length, DEFAULT_CHASERS.length);
  assert.deepEqual(parseChaserList('@pecoshank, @SomeChaser').map((c) => c.name), ['Pecos Hank', 'SomeChaser']);
});

test('search results skip storm-sounds and game streams', () => {
  assert.equal(looksLikeChase('LIVE Tornado chase in Oklahoma'), true);
  assert.equal(looksLikeChase('Thunderstorm sounds for sleep 24/7'), false);
  assert.equal(looksLikeChase('Roblox tornado simulator live'), false);
  assert.equal(looksLikeChase('Cooking stream'), false);
});

test('without a key: trusted channels are checked through their live pages', async () => {
  const fetchImpl = youtube();
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject({ url: '/api/chasers/live' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.mode, 'keyless');
  assert.equal(body.search, false);
  assert.deepEqual(body.streams.map((s) => s.videoId), ['ryanhall001', 'pecoshank01']);
  assert.equal(body.streams[0].trusted, true);
  assert.equal(body.channels.find((c) => c.handle === '@VinceWaelti').ok, false);
  assert.equal(body.channels.find((c) => c.handle === '@ReedTimmerWx').live, false);
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('googleapis.com')));
  // Cached: a second request does not refetch YouTube.
  const before = fetchImpl.calls.length;
  await app.inject({ url: '/api/chasers/live' });
  assert.equal(fetchImpl.calls.length, before);
  await app.close();
});

test('with a key: viewer counts, search for more chasers, and kids only get the trusted list', async () => {
  const fetchImpl = youtube({
    'googleapis.com/youtube/v3/search': (u) => {
      assert.match(u, /eventType=live/);
      assert.match(u, /safeSearch=strict/);
      return json({ items: [
        { id: { videoId: 'otherchase1' }, snippet: { title: 'LIVE tornado chase in Nebraska', channelTitle: 'Plains Chaser', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' } },
        { id: { videoId: 'rainsounds1' }, snippet: { title: 'Thunderstorm sounds for sleeping', channelTitle: 'Relax' } },
        { id: { videoId: 'ryanhall001' }, snippet: { title: 'dupe', channelTitle: "Ryan Hall, Y'all" } },
      ] });
    },
    'googleapis.com/youtube/v3/videos': (u) => {
      assert.match(u, /key=yt-key-9876/);
      return json({ items: [
        { id: 'ryanhall001', snippet: { title: 'LIVE: Tornado outbreak coverage', liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '41000', actualStartTime: '2026-05-01T18:00:00Z' } },
        { id: 'pecoshank01', snippet: { title: 'Chasing supercells in Kansas', liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '900' } },
        { id: 'otherchase1', snippet: { title: 'LIVE tornado chase in Nebraska', liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '50000' } },
      ] });
    },
  });
  const { app } = await testApp({ env: { YOUTUBE_API_KEY: 'yt-key-9876' }, fetchImpl });
  const body = (await app.inject({ url: '/api/chasers/live' })).json();
  assert.equal(body.mode, 'api');
  // Trusted first (by viewers), then search results; storm sounds and dupes dropped.
  assert.deepEqual(body.streams.map((s) => s.videoId), ['ryanhall001', 'pecoshank01', 'otherchase1']);
  assert.equal(body.streams[0].viewers, 41000);
  assert.doesNotMatch(JSON.stringify(body), /yt-key-9876/);

  const kid = (await app.inject({ url: '/api/chasers/live?kid=1' })).json();
  assert.deepEqual(kid.streams.map((s) => s.videoId), ['ryanhall001', 'pecoshank01']);
  assert.equal(kid.search, false);
  await app.close();
});

test('a bad YouTube key falls back to the trusted list', async () => {
  const fetchImpl = youtube({ 'googleapis.com': () => json({ error: { errors: [{ reason: 'keyInvalid' }] } }, 400) });
  const { app } = await testApp({ env: { YOUTUBE_API_KEY: 'bad' }, fetchImpl });
  const body = (await app.inject({ url: '/api/chasers/live' })).json();
  assert.deepEqual(body.streams.map((s) => s.videoId), ['ryanhall001', 'pecoshank01']);
  assert.match(body.warning, /YouTube key/);
  await app.close();
});

test('admins set the YouTube key and chaser list in Family & settings, and test the key', async () => {
  const fetchImpl = youtube({ 'youtube/v3/videoCategories': () => json({ items: [] }) });
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' }, fetchImpl });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };

  const bad = await app.inject({ method: 'PUT', url: '/api/admin/ai-settings', headers, payload: { values: { STORM_CHASER_CHANNELS: 'not a handle' } } });
  assert.equal(bad.statusCode, 400);

  const saved = await app.inject({ method: 'PUT', url: '/api/admin/ai-settings', headers, payload: { values: { YOUTUBE_API_KEY: 'yt-secret-4321', STORM_CHASER_CHANNELS: '@PecosHank' } } });
  assert.equal(saved.statusCode, 200);
  assert.doesNotMatch(saved.body, /yt-secret-4321/);
  assert.equal(saved.json().settings.find((s) => s.key === 'YOUTUBE_API_KEY').hint, '4321');

  const test1 = await app.inject({ method: 'POST', url: '/api/admin/ai-settings/test', headers, payload: { target: 'youtube' } });
  assert.equal(test1.json().ok, true);
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('key=yt-secret-4321')));

  const body = (await app.inject({ url: '/api/chasers/live', headers })).json();
  assert.deepEqual(body.channels.map((c) => c.handle), ['@PecosHank']);
  await app.close();
});
