// Radar frames for a smooth, loopable map. The Iowa Environmental Mesonet serves
// NEXRAD base reflectivity composites as map tiles in 5-minute steps, with no key.
// The browser loads tiles directly from IEM, so this server only builds the list.
const IEM = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0';

const tile = (layer) => `${IEM}/${layer}/{z}/{x}/{y}.png`;

// IEM keeps the latest mosaic plus 5-minute offsets m05m..m55m.
function loop(base, now, count) {
  const step = 5 * 60_000;
  const latest = Math.floor(now / step) * step;
  const frames = [];
  for (let i = count - 1; i >= 0; i--) {
    const minutes = i * 5;
    const layer = minutes === 0 ? base : `${base}-m${String(minutes).padStart(2, '0')}m`;
    frames.push({ time: new Date(latest - minutes * 60_000).toISOString(), url: tile(layer) });
  }
  return frames;
}

// HRRR simulated reflectivity ("future radar"), one frame per hour of the latest run.
function future(now, hours = 12) {
  const base = Math.floor(now / 3_600_000) * 3_600_000;
  return Array.from({ length: hours + 1 }, (_, h) => ({
    time: new Date(base + h * 3_600_000).toISOString(),
    lead: h,
    url: tile(`hrrr::REFD-F${String(h * 60).padStart(4, '0')}-0`),
  }));
}

// Everything the full-screen radar can show. Single-site radar uses the
// super-resolution base reflectivity (N0B) from one NEXRAD, picked on the map.
export function radarProducts(now = Date.now()) {
  return [
    { id: 'composite', name: 'Radar', note: 'All US NEXRAD radars stitched together, last hour', legend: 'dbz', frames: loop('nexrad-n0q-900913', now, 11) },
    { id: 'site', name: 'Single site', note: 'One radar up close (super-resolution reflectivity). Tap a radar on the map to switch.', legend: 'dbz', site: true, template: tile('ridge::{site}-N0B-0') },
    { id: 'echotops', name: 'Echo tops', note: 'How tall the storms are. Taller usually means stronger.', legend: 'eet', frames: loop('nexrad-eet-900913', now, 11) },
    { id: 'rain1h', name: 'Rain, 1 hour', note: 'Radar-estimated rain in the last hour (MRMS)', legend: 'rain1', frames: [{ time: null, url: tile('q2-n1p-900913') }] },
    { id: 'rain24h', name: 'Rain, 24 hours', note: 'Radar-estimated rain in the last 24 hours (MRMS)', legend: 'rain24', frames: [{ time: null, url: tile('q2-p24h-900913') }] },
    { id: 'future', name: 'Future radar', note: 'What the HRRR model expects radar to look like over the next 12 hours', legend: 'dbz', future: true, frames: future(now) },
  ];
}

export function radarFrames(now = Date.now(), count = 11) {
  return {
    frames: loop('nexrad-n0q-900913', now, count),
    products: radarProducts(now),
    attribution: 'NEXRAD radar via <a href="https://mesonet.agron.iastate.edu/">Iowa Environmental Mesonet</a>',
    maxNativeZoom: 12,
    coverage: 'United States',
    // Infrared satellite (clouds day and night) from NASA GIBS, as WMS so Leaflet
    // can ask for any zoom. GOES-East covers the Americas and the Atlantic.
    satellite: {
      wms: 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
      layers: 'GOES-East_ABI_Band13_Clean_Infrared',
      name: 'Infrared satellite (GOES-East)',
      attribution: 'Satellite: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> / NOAA GOES',
    },
  };
}
