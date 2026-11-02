// Radar frames for a smooth, loopable map. The Iowa Environmental Mesonet serves
// NEXRAD base reflectivity composites as map tiles in 5-minute steps, with no key.
// The browser loads tiles directly from IEM, so this server only builds the list.
const IEM = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0';

export function radarFrames(now = Date.now(), count = 11) {
  // IEM keeps the latest composite plus offsets m05m..m55m.
  const step = 5 * 60_000;
  const latest = Math.floor(now / step) * step;
  const frames = [];
  for (let i = count - 1; i >= 0; i--) {
    const minutes = i * 5;
    const layer = minutes === 0 ? 'nexrad-n0q-900913' : `nexrad-n0q-900913-m${String(minutes).padStart(2, '0')}m`;
    frames.push({ time: new Date(latest - minutes * 60_000).toISOString(), url: `${IEM}/${layer}/{z}/{x}/{y}.png` });
  }
  return {
    frames,
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
