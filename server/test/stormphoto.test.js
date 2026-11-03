import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, cookieFrom, mockFetch } from './helpers.js';
import { CATALOG, normalizeTitle, isFreeLicense, plainText, parseCommons, pickForDay, archiveFor, photoKey } from '../src/stormphoto.js';

// A fake Commons API: every asked-for title exists and is public domain,
// except the ones named in `missing` or `licenses`.
function commonsFetch({ missing = [], licenses = {}, down = false } = {}) {
  return mockFetch({
    'commons.wikimedia.org/w/api.php': (u) => {
      if (down) return new Response('nope', { status: 503 });
      const titles = new URL(u).searchParams.get('titles').split('|');
      const normalized = [];
      const pages = titles.map((t) => {
        if (missing.includes(t)) return { title: t, missing: true };
        return {
          title: t,
          imageinfo: [{
            mime: 'image/jpeg', url: `https://upload.wikimedia.org/full/${encodeURIComponent(t)}`, thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(t)}`,
            thumbwidth: 1280, thumbheight: 853, descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(t)}`,
            extmetadata: {
              Artist: { value: '<a href="//www.noaa.gov">NOAA Photo Library</a>, NSSL' },
              LicenseShortName: { value: licenses[t] || 'Public domain' },
              Credit: { value: 'NOAA &amp; NSSL' },
              ImageDescription: { value: '<p>A storm.</p>' },
            },
          }],
        };
      });
      return new Response(JSON.stringify({ query: { normalized, pages } }), { headers: { 'content-type': 'application/json' } });
    },
    'upload.wikimedia.org/thumb/': () => new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'content-type': 'image/jpeg' } }),
  });
}

async function admin(fetchImpl) {
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'mom', password: 'password123' } });
  return { app, cookie: cookieFrom(res) };
}

test('normalizeTitle accepts names and Commons links, rejects junk', () => {
  assert.equal(normalizeTitle('Lightning NOAA.jpg'), 'File:Lightning NOAA.jpg');
  assert.equal(normalizeTitle('file:Lightning_NOAA.jpg'), 'File:Lightning NOAA.jpg');
  assert.equal(normalizeTitle('https://commons.wikimedia.org/wiki/File:Lightning_NOAA.jpg?uselang=en'), 'File:Lightning NOAA.jpg');
  assert.equal(normalizeTitle('https://commons.wikimedia.org/wiki/File:Roping%20tornado.jpg'), 'File:Roping tornado.jpg');
  assert.equal(normalizeTitle('not a picture'), null);
  assert.equal(normalizeTitle('File:a|b.jpg'), null);
});

test('only freely reusable licenses pass', () => {
  for (const ok of ['Public domain', 'PD-USGov-NOAA', 'CC0', 'CC BY 2.0', 'CC BY-SA 3.0', 'CC-BY-SA-4.0', 'Copyrighted free use']) assert.ok(isFreeLicense(ok), ok);
  for (const no of ['CC BY-NC 2.0', 'CC BY-ND 4.0', 'All rights reserved', '', 'Fair use']) assert.ok(!isFreeLicense(no), no);
});

test('plainText strips HTML and entities', () => {
  assert.equal(plainText('<a href="x">NOAA</a> &amp; <b>NSSL</b>&#39;s'), "NOAA & NSSL's");
  assert.equal(plainText('x'.repeat(50), 10).length, 10);
});

test('parseCommons follows redirects and flags missing or unfree files', () => {
  const raw = {
    query: {
      normalized: [{ from: 'File:Old_name.jpg', to: 'File:Old name.jpg' }],
      redirects: [{ from: 'File:Old name.jpg', to: 'File:New name.jpg' }],
      pages: [
        { title: 'File:New name.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://u/t.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Jo' } } }] },
        { title: 'File:Gone.jpg', missing: true },
        { title: 'File:Nc.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://u/n.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-NC 2.0' } } }] },
      ],
    },
  };
  const out = parseCommons(raw, ['File:Old_name.jpg', 'File:Gone.jpg', 'File:Nc.jpg']);
  assert.equal(out['File:Old_name.jpg'].status, 'ok');
  assert.equal(out['File:Old_name.jpg'].artist, 'Jo');
  assert.equal(out['File:Old_name.jpg'].license, 'CC BY-SA 4.0');
  assert.equal(out['File:Gone.jpg'].status, 'missing');
  assert.equal(out['File:Nc.jpg'].status, 'not-free');
});

test('the rotation shows every picture once before repeating', () => {
  const pool = CATALOG.map((c) => ({ title: c.title }));
  const seen = new Set();
  for (let i = 0; i < pool.length; i++) seen.add(pickForDay(pool, new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10)).title);
  assert.equal(seen.size, pool.length);
  assert.equal(pickForDay(pool, '2026-11-03').title, pickForDay(pool, '2026-11-03').title);
  const arch = archiveFor(pool, '2026-11-03', 5);
  assert.equal(arch.length, 5);
  assert.equal(arch[0].date, '2026-11-02');
  assert.ok(!arch.some((a) => a.photo.title === pickForDay(pool, '2026-11-03').title));
  assert.equal(pickForDay([], '2026-11-03'), null);
});

test('catalog captions are kid-sized and every entry is a tornado or lightning photo', () => {
  assert.ok(CATALOG.length >= 12);
  assert.equal(new Set(CATALOG.map((c) => c.title)).size, CATALOG.length);
  for (const c of CATALOG) {
    assert.ok(['tornado', 'lightning'].includes(c.kind), c.title);
    assert.ok(c.caption.length < 160 && c.fact.length < 200, c.title);
    assert.equal(normalizeTitle(c.title), c.title);
  }
});

test('GET /api/storm-photo picks today, with credit, license and an archive', async () => {
  const skip = CATALOG[0].title;
  const { app } = await testApp({ fetchImpl: commonsFetch({ missing: [skip], licenses: { [CATALOG[1].title]: 'CC BY-NC 2.0' } }) });
  const r = await app.inject('/api/storm-photo?date=2026-11-03');
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.equal(body.total, CATALOG.length - 2);
  assert.ok(body.photo.caption);
  assert.equal(body.photo.credit.license, 'Public domain');
  assert.equal(body.photo.credit.artist, 'NOAA Photo Library, NSSL');
  assert.match(body.photo.credit.pageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\//);
  assert.ok(body.archive.length > 5);
  const titles = [body.photo, ...body.archive.map((a) => a.photo)].map((p) => p.title);
  assert.ok(!titles.includes(skip) && !titles.includes(CATALOG[1].title));
  const img = await app.inject(body.photo.imageUrl);
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/jpeg');
  assert.equal((await app.inject('/api/storm-photo/image/000000000000')).statusCode, 404);
  assert.equal((await app.inject('/api/storm-photo?date=nope')).statusCode, 400);
  await app.close();
});

test('storm photo degrades quietly when Commons is down', async () => {
  const { app } = await testApp({ fetchImpl: commonsFetch({ down: true }) });
  const r = (await app.inject('/api/storm-photo?date=2026-11-03')).json();
  assert.equal(r.photo, null);
  assert.equal(r.offline, true);
  await app.close();
});

test('admins can hide, bring back and add pictures', async () => {
  const { app, cookie } = await admin(commonsFetch({ missing: ['File:Not there.jpg'], licenses: { 'File:Nc pic.jpg': 'CC BY-NC 2.0' } }));
  const today = (await app.inject('/api/storm-photo?date=2026-11-03')).json().photo;

  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/storm-photos/hidden', payload: { title: today.key } })).statusCode, 401);
  const hide = await app.inject({ method: 'POST', url: '/api/admin/storm-photos/hidden', headers: { cookie }, payload: { title: today.key } });
  assert.equal(hide.statusCode, 200, hide.body);
  const after = (await app.inject('/api/storm-photo?date=2026-11-03')).json();
  assert.notEqual(after.photo.title, today.title);
  assert.ok(!after.archive.some((a) => a.photo.title === today.title));
  assert.equal((await app.inject(today.imageUrl)).statusCode, 404, 'hidden picture is not served to kids');
  assert.equal((await app.inject({ url: today.imageUrl, headers: { cookie } })).statusCode, 200, 'admins can still preview it');

  const list = (await app.inject({ url: '/api/admin/storm-photos', headers: { cookie } })).json();
  assert.equal(list.photos.find((p) => p.title === today.title).hidden, true);

  await app.inject({ method: 'POST', url: '/api/admin/storm-photos/hidden', headers: { cookie }, payload: { title: today.title, hidden: false } });
  assert.equal((await app.inject('/api/storm-photo?date=2026-11-03')).json().photo.title, today.title);

  const add = (payload) => app.inject({ method: 'POST', url: '/api/admin/storm-photos', headers: { cookie }, payload });
  assert.equal((await add({ title: 'File:Not there.jpg', kind: 'lightning', caption: 'Hi' })).statusCode, 400);
  assert.match((await add({ title: 'File:Nc pic.jpg', kind: 'lightning', caption: 'Hi' })).json().error, /license/);
  assert.equal((await add({ title: CATALOG[2].title, kind: 'tornado', caption: 'Dup' })).statusCode, 400);
  assert.equal((await add({ title: 'https://commons.wikimedia.org/wiki/File:Mammatus_sky.jpg', kind: 'lumpy', caption: 'Hi' })).statusCode, 400);
  const ok = await add({ title: 'https://commons.wikimedia.org/wiki/File:Mammatus_sky.jpg', kind: 'storm', caption: 'Bumpy clouds!' });
  assert.equal(ok.statusCode, 201, ok.body);
  const added = ok.json().photo;
  assert.equal(added.title, 'File:Mammatus sky.jpg');
  assert.equal(added.status, 'ok');
  assert.equal((await app.inject('/api/storm-photo?date=2026-11-03')).json().total, CATALOG.length + 1);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/storm-photos/${added.id}`, headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject('/api/storm-photo?date=2026-11-03')).json().total, CATALOG.length);
  assert.ok(photoKey('x').length === 12);
  await app.close();
});
