// Ocean discoveries: the newest stories from ocean exploration teams and science
// news, cleaned up for kids. Every source is free and needs no key. A feed that is
// down is skipped, so one bad source never empties the list.
import { parseFeed, kidSafeText } from './news.js';
import { UpstreamError } from '../cache.js';

export const OCEAN_FEEDS = [
  { id: 'noaa-oe', title: 'NOAA Ocean Exploration', url: 'https://oceanexplorer.noaa.gov/feed/', home: 'https://oceanexplorer.noaa.gov/' },
  { id: 'schmidt', title: 'Schmidt Ocean Institute', url: 'https://schmidtocean.org/feed/', home: 'https://schmidtocean.org/' },
  { id: 'mbari', title: 'MBARI', url: 'https://www.mbari.org/feed/', home: 'https://www.mbari.org/' },
  { id: 'sd-marine', title: 'ScienceDaily: Marine biology', url: 'https://www.sciencedaily.com/rss/plants_animals/marine_biology.xml', home: 'https://www.sciencedaily.com/news/plants_animals/marine_biology/' },
  { id: 'sd-ocean', title: 'ScienceDaily: Oceanography', url: 'https://www.sciencedaily.com/rss/earth_climate/oceanography.xml', home: 'https://www.sciencedaily.com/news/earth_climate/oceanography/' },
];

// OCEAN_FEEDS env var: "Title|https://url, https://other" replaces the list.
export function feedsFromEnv(value) {
  if (!value || !String(value).trim()) return OCEAN_FEEDS;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean).map((s, i) => {
    const [a, b] = s.includes('|') ? s.split('|') : [null, s];
    let url;
    try {
      url = new URL(b.trim());
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { id: `custom-${i + 1}`, title: (a || url.hostname.replace(/^www\./, '')).trim().slice(0, 80), url: url.toString(), home: url.origin };
  }).filter(Boolean);
}

// Story topics, picked from words in the title and summary. The first match is the
// story's main emoji. Order matters: specific animals before broad words.
export const TAGS = [
  { id: 'octopus', emoji: '🐙', label: 'Octopus', re: /\boctop(us|uses|i|od)\b/i },
  { id: 'squid', emoji: '🦑', label: 'Squid', re: /\bsquids?\b|\bcephalopods?\b/i },
  { id: 'shark', emoji: '🦈', label: 'Sharks & rays', re: /\bsharks?\b|\brays?\b|\bskates?\b/i },
  { id: 'whale', emoji: '🐋', label: 'Whales', re: /\bwhales?\b|\bnarwhals?\b|\borcas?\b/i },
  { id: 'dolphin', emoji: '🐬', label: 'Dolphins', re: /\bdolphins?\b|\bporpoises?\b/i },
  { id: 'seal', emoji: '🦭', label: 'Seals', re: /\bseals?\b|\bsea lions?\b|\bwalrus(es)?\b|\bmanatees?\b/i },
  { id: 'turtle', emoji: '🐢', label: 'Sea turtles', re: /\bturtles?\b/i },
  { id: 'jelly', emoji: '🪼', label: 'Jellies', re: /\bjelly ?fish\b|\bjellies\b|\bsiphonophores?\b|\bcomb jell/i },
  { id: 'coral', emoji: '🪸', label: 'Coral reefs', re: /\bcorals?\b|\breefs?\b/i },
  { id: 'crab', emoji: '🦀', label: 'Crabs & shrimp', re: /\bcrabs?\b|\bshrimps?\b|\blobsters?\b|\bkrill\b|\bcrustaceans?\b|\bisopods?\b/i },
  { id: 'fish', emoji: '🐟', label: 'Fish', re: /\bfish(es)?\b|\beels?\b|\bseahorses?\b|\banglerfish\b/i },
  { id: 'bird', emoji: '🐧', label: 'Seabirds', re: /\bpenguins?\b|\bseabirds?\b|\balbatross(es)?\b|\bpuffins?\b/i },
  { id: 'species', emoji: '✨', label: 'New species', re: /\bnew (\w+ ){0,2}species\b|\bnewly (discovered|described)\b|\bnever (before )?seen\b|\bundescribed\b|\bunknown to science\b/i },
  { id: 'vent', emoji: '🌋', label: 'Vents & volcanoes', re: /\bhydrothermal\b|\bvents?\b|\bseamounts?\b|\bvolcan(o|oes|ic)\b|\bseeps?\b/i },
  { id: 'deep', emoji: '🔦', label: 'Deep sea', re: /\bdeep[- ]sea\b|\bdeep ocean\b|\babyss(al)?\b|\btrench(es)?\b|\bhadal\b|\btwilight zone\b|\bmidnight zone\b/i },
  { id: 'robot', emoji: '🤖', label: 'Robots & subs', re: /\brobots?\b|\brobotic\b|\bROVs?\b|\bAUVs?\b|\bsubmersibles?\b|\bdrones?\b|\bremotely operated\b/i },
  { id: 'wreck', emoji: '🚢', label: 'Shipwrecks', re: /\bship ?wrecks?\b|\bwrecks?\b|\barchaeolog/i },
  { id: 'map', emoji: '🗺️', label: 'Mapping the seafloor', re: /\bmap(s|ped|ping)?\b|\bseafloor\b|\bsea floor\b|\bbathymetr/i },
  { id: 'ice', emoji: '🧊', label: 'Polar seas', re: /\barctic\b|\bantarctic\w*\b|\bsea ice\b|\bglaciers?\b|\bice shelf\b/i },
  { id: 'plankton', emoji: '🦠', label: 'Plankton', re: /\bplankton\b|\bphytoplankton\b|\bzooplankton\b|\balgae\b|\bmicrob(es|ial)\b/i },
  { id: 'glow', emoji: '💡', label: 'Glowing animals', re: /\bbiolumin\w*|\bglow(s|ing)?\b/i },
  { id: 'climate', emoji: '🌡️', label: 'Ocean & climate', re: /\bwarming\b|\bheat ?waves?\b|\bacidif\w*|\bclimate\b|\bsea level\b|\bcurrents?\b/i },
];

// Big words kids meet in ocean stories, with a short meaning.
export const WOW_WORDS = [
  { word: 'Species', re: /\bspecies\b/i, means: 'One kind of living thing. Lions are one species and tigers are another.' },
  { word: 'Bioluminescence', re: /\bbiolumin\w*/i, means: 'Light that an animal makes with its own body, like a firefly.' },
  { word: 'Hydrothermal vent', re: /\bhydrothermal\b/i, means: 'A hot spring on the seafloor. Super hot, mineral-rich water shoots out, and strange animals live around it.' },
  { word: 'Seamount', re: /\bseamounts?\b/i, means: 'An underwater mountain that does not reach the surface.' },
  { word: 'ROV', re: /\bROVs?\b|\bremotely operated\b/, means: 'A robot submarine driven from a ship with a long cable. It has cameras and claws.' },
  { word: 'AUV', re: /\bAUVs?\b|\bautonomous underwater\b/i, means: 'A robot submarine that drives itself, with no cable.' },
  { word: 'Submersible', re: /\bsubmersibles?\b/i, means: 'A small submarine that dives deep with scientists inside.' },
  { word: 'Plankton', re: /\bplankton\b/i, means: 'Tiny drifting plants and animals. Many are too small to see, but they feed the whole ocean.' },
  { word: 'Coral', re: /\bcorals?\b/i, means: 'Tiny animals that build rocky homes together. Millions of them make a reef.' },
  { word: 'Abyss', re: /\babyss(al)?\b/i, means: 'The deep, dark, freezing seafloor, about 2 to 4 miles down.' },
  { word: 'Trench', re: /\btrench(es)?\b/i, means: 'A deep crack in the seafloor. The deepest one goes down almost 7 miles!' },
  { word: 'Ecosystem', re: /\becosystems?\b/i, means: 'All the living things in one place and how they help each other.' },
  { word: 'Sediment', re: /\bsediments?\b/i, means: 'Mud, sand and tiny shells that settle on the seafloor.' },
  { word: 'Expedition', re: /\bexpeditions?\b/i, means: 'A big trip to explore and discover something new.' },
  { word: 'Marine', re: /\bmarine\b/i, means: 'Anything that has to do with the sea.' },
  { word: 'Invertebrate', re: /\binvertebrates?\b/i, means: 'An animal with no backbone, like a jellyfish, crab or octopus.' },
  { word: 'Bathymetry', re: /\bbathymetr\w*/i, means: 'Measuring how deep the water is to make maps of the seafloor.' },
  { word: 'Acidification', re: /\bacidif\w*/i, means: 'Seawater slowly turning more sour as it soaks up carbon dioxide, which is hard on shells and corals.' },
  { word: 'Krill', re: /\bkrill\b/i, means: 'Tiny shrimp-like animals. Blue whales eat millions of them a day!' },
  { word: 'Cephalopod', re: /\bcephalopods?\b/i, means: 'The octopus, squid and cuttlefish family. Smart, with lots of arms.' },
];

// Stories that are not really about the ocean (ScienceDaily marine topics sometimes
// carry lake or fish-farm business news) still show; this only orders them.
const OCEANY = /\bocean\w*|\bsea\b|\bseas\b|\bmarine\b|\bdeep\b|\breef|\bcoast|\bseafloor|\bexpedition|\bbuoy|\bwhale|\bcoral|\bshark|\bocto|\bsquid|\bjelly/i;

export function tagStory(text) {
  return TAGS.filter((t) => t.re.test(text)).slice(0, 3).map(({ id, emoji, label }) => ({ id, emoji, label }));
}

export function wowWords(text, max = 3) {
  return WOW_WORDS.filter((w) => w.re.test(text)).slice(0, max).map(({ word, means }) => ({ word, means }));
}

// A short, read-aloud blurb: the first sentence or two of the summary, under ~200 chars.
export function kidBlurb(summary, title = '') {
  const s = String(summary || '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\s*(Read more|Continue reading|The post .+ appeared first on .+)\.?…?$/i, '').trim();
  if (!s) return title;
  const sentences = s.match(/[^.!?]+[.!?]+(\s|$)/g) || [s];
  let out = '';
  for (const sen of sentences) {
    if (out && (out + sen).length > 200) break;
    out += sen;
  }
  out = out.trim();
  if (out.length > 220) out = `${out.slice(0, 200).replace(/\s+\S*$/, '')}…`;
  return out;
}

const hash = (s) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h.toString(36);
};
const key = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function loadOne(feed, fetchImpl) {
  const res = await fetchImpl(feed.url, { headers: { 'user-agent': 'WeatherScout/0.1 (+self-hosted)' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new UpstreamError(feed.title, res.status);
  const body = await res.text();
  if (body.length > 3_000_000) throw new UpstreamError(feed.title, 413, `${feed.title} feed is too large`);
  return parseFeed(body).items.filter((i) => i.title && i.link).slice(0, 20);
}

export async function getDiscoveries(feeds = OCEAN_FEEDS, { fetchImpl = fetch, now = Date.now(), maxAgeDays = 120, limit = 40 } = {}) {
  const results = await Promise.allSettled(feeds.map((f) => loadOne(f, fetchImpl)));
  if (feeds.length && results.every((r) => r.status === 'rejected')) throw results[0].reason;
  const seen = new Set();
  const items = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const feed = feeds[i];
    for (const it of r.value) {
      const k = key(it.title);
      if (seen.has(k)) continue;
      seen.add(k);
      const t = it.published ? Date.parse(it.published) : null;
      if (t && now - t > maxAgeDays * 86_400_000) continue;
      const all = `${it.title} ${it.summary}`;
      const tags = tagStory(all);
      items.push({
        id: hash(it.link),
        title: it.title,
        link: it.link,
        published: it.published,
        summary: it.summary,
        kid: kidBlurb(it.summary, it.title),
        image: it.image || null,
        emoji: tags[0]?.emoji || '🌊',
        tags,
        words: wowWords(all),
        source: feed.title,
        sourceId: feed.id,
        kidSafe: kidSafeText(it.title, it.summary),
        oceany: OCEANY.test(all),
      });
    }
  });
  // Newest week first; within a week, clearly-ocean stories lead side topics.
  items.sort((a, b) => {
    const wa = (a.published || '').slice(0, 10);
    const wb = (b.published || '').slice(0, 10);
    const da = Math.floor(Date.parse(wa || 0) / (7 * 86_400_000));
    const db = Math.floor(Date.parse(wb || 0) / (7 * 86_400_000));
    if (da !== db) return db - da;
    return (b.oceany - a.oceany) || (b.published || '').localeCompare(a.published || '');
  });
  return {
    items: items.slice(0, limit).map(({ oceany, ...it }) => it),
    sources: feeds.map((f, i) => ({ id: f.id, title: f.title, home: f.home, ok: results[i].status === 'fulfilled' })),
  };
}

// ---- live ocean: nearest buoys --------------------------------------------------
// NDBC ids starting 45 are Great Lakes buoys: real water, but not the ocean.
const isLake = (b) => /^45\d{3}$/.test(b.id) || /^(BUFN6|CHII2|MLWW3|SGNW3|OLCN6|DBLN6|THLO1|GTLM4|MKGM4|NPDW3|SBLM4|ROAM4|PCLM4|DISW3|SXHW3|STDM4|TAWM4|LSCM4|GSLM4|CLSM4)$/i.test(b.id);

export function nearestBuoys(buoys, l, milesBetween, count = 3) {
  return buoys
    .filter((b) => !isLake(b) && (b.waterTemp != null || b.waveHeight != null))
    .map((b) => ({ ...b, miles: Math.round(milesBetween(l, b)), link: `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(String(b.id).toLowerCase())}` }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count);
}
