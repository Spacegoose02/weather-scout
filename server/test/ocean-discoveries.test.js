import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/providers/news.js';
import { getDiscoveries, kidBlurb, tagStory, wowWords, feedsFromEnv, nearestBuoys, OCEAN_FEEDS } from '../src/providers/discoveries.js';
import { milesBetween } from '../src/providers/tropics.js';
import { parseNdbc } from '../src/providers/ocean.js';
import { mockFetch, testApp } from './helpers.js';

const NDBC = `#STN     LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE
#text    deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft
44014   36.603  -74.837 2026 11 02 18 50  200  7.0   9.0  1.5   8 6.1 110 1015.2 -1.1  18.0  20.0  12.0   MM     MM
44099   36.915  -75.720 2026 11 02 18 56   MM   MM    MM  1.0  10 5.5 100     MM   MM    MM  19.5    MM   MM     MM
`;
const day = (d) => new Date(Date.now() - d * 86_400_000).toUTCString();

const SCHMIDT = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Schmidt Ocean Institute</title>
<item><title>57 New Marine Species Discovered in Submarine Canyons</title><link>https://schmidtocean.org/57-new-species/</link><pubDate>${day(2)}</pubDate>
<description><![CDATA[Scientists using the ROV SuBastian found a glowing octopus and new corals. The expedition mapped 1,000 km of seafloor. More details follow here.]]></description>
<content:encoded><![CDATA[<p>Hi</p><img src="https://schmidtocean.org/wp-content/uploads/octo.jpg?w=800&amp;h=600" alt="">]]></content:encoded></item>
<item><title>Award news</title><link>https://schmidtocean.org/award/</link><pubDate>${day(400)}</pubDate><description>Old story.</description></item>
</channel></rss>`;

const SD = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Marine Biology News</title>
<item><title>Whales sing new songs</title><link>https://www.sciencedaily.com/releases/whales.htm</link><pubDate>${day(1)}</pubDate><description>Humpback whales off Australia changed their song.</description>
<media:thumbnail url="http://insecure.example/w.jpg"/><enclosure url="https://www.sciencedaily.com/images/whale.jpg" type="image/jpeg"/></item>
<item><title>Shark attack leaves surfer dead</title><link>https://www.sciencedaily.com/releases/shark.htm</link><pubDate>${day(1)}</pubDate><description>A sad story.</description></item>
<item><title>57 new marine species discovered in submarine canyons!</title><link>https://www.sciencedaily.com/releases/dupe.htm</link><pubDate>${day(1)}</pubDate><description>Same story.</description></item>
</channel></rss>`;

test('feeds pick up story pictures, https only', () => {
  const s = parseFeed(SCHMIDT).items[0];
  assert.equal(s.image, 'https://schmidtocean.org/wp-content/uploads/octo.jpg?w=800&h=600');
  assert.equal(parseFeed(SD).items[0].image, 'https://www.sciencedaily.com/images/whale.jpg');
  assert.equal(parseFeed(SD).items[1].image, null);
});

test('stories get kid tags, wow words and a short blurb', () => {
  const text = 'A glowing octopus near a hydrothermal vent, filmed by an ROV.';
  assert.deepEqual(tagStory(text).map((t) => t.id), ['octopus', 'vent', 'robot']);
  assert.deepEqual(wowWords(text).map((w) => w.word), ['Hydrothermal vent', 'ROV']);
  assert.equal(kidBlurb('One. Two. ' + 'x'.repeat(300)), 'One. Two.');
  assert.equal(kidBlurb('The post Hi appeared first on Schmidt Ocean.', 'T'), 'T');
  assert.equal(kidBlurb('', 'Title only'), 'Title only');
});

test('discoveries merge feeds, drop old and duplicate stories, and survive a dead feed', async () => {
  const feeds = [
    { id: 'a', title: 'Schmidt Ocean Institute', url: 'https://schmidtocean.org/feed/' },
    { id: 'b', title: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/marine.xml' },
    { id: 'c', title: 'Down', url: 'https://down.example/feed' },
  ];
  const fetchImpl = mockFetch({
    'schmidtocean.org/feed': () => new Response(SCHMIDT),
    'sciencedaily.com/rss': () => new Response(SD),
    'down.example': () => new Response('nope', { status: 500 }),
  });
  const r = await getDiscoveries(feeds, { fetchImpl });
  assert.deepEqual(r.sources.map((s) => s.ok), [true, true, false]);
  const titles = r.items.map((i) => i.title);
  assert.equal(titles.length, 3, 'old and duplicate stories are dropped');
  assert.ok(!titles.includes('Award news'));
  const species = r.items.find((i) => i.sourceId === 'a');
  assert.equal(species.emoji, '🐙');
  assert.ok(species.tags.some((t) => t.id === 'species'));
  assert.equal(species.kid, 'Scientists using the ROV SuBastian found a glowing octopus and new corals. The expedition mapped 1,000 km of seafloor. More details follow here.');
  assert.equal(r.items.find((i) => /Shark/.test(i.title)).kidSafe, false);

  await assert.rejects(getDiscoveries([feeds[2]], { fetchImpl }));
});

test('OCEAN_FEEDS env replaces the built-in list', () => {
  assert.equal(feedsFromEnv(''), OCEAN_FEEDS);
  const f = feedsFromEnv('Reef News|https://reef.example/rss, https://www.other.example/feed, javascript:alert(1)');
  assert.deepEqual(f.map((x) => x.title), ['Reef News', 'other.example']);
});

test('nearest ocean buoys skip Great Lakes and empty stations', () => {
  const buoys = [...parseNdbc(NDBC), { id: '45007', lat: 42.6, lon: -87, waterTemp: 50 }];
  const near = nearestBuoys(buoys, { lat: 37.54, lon: -77.43 }, milesBetween);
  assert.deepEqual(near.map((b) => b.id), ['44099', '44014']);
  assert.match(near[0].link, /station=44099$/);
  assert.ok(near[0].miles > 50 && near[0].miles < 200);
});

test('ocean routes: discoveries (kid filter) and buoys', async () => {
  const fetchImpl = mockFetch({
    'oceanexplorer.noaa.gov': () => new Response(SCHMIDT),
    'schmidtocean.org': () => new Response('down', { status: 503 }),
    'mbari.org': () => new Response('down', { status: 503 }),
    'sciencedaily.com': () => new Response(SD),
    'latest_obs.txt': () => new Response(NDBC),
  });
  const { app } = await testApp({ fetchImpl });
  const all = (await app.inject('/api/ocean/discoveries')).json();
  const kid = (await app.inject('/api/ocean/discoveries?kid=1')).json();
  assert.ok(all.items.some((i) => /Shark/.test(i.title)));
  assert.ok(!kid.items.some((i) => /Shark/.test(i.title)));
  assert.equal(all.sources.length, OCEAN_FEEDS.length);
  const b = (await app.inject('/api/ocean/buoys?lat=37.54&lon=-77.43&units=imperial')).json();
  assert.equal(b.buoys[0].id, '44099');
});
