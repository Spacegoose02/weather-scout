// Where the radar map has data, shared by the server and the map.

// IEM's NEXRAD mosaic (n0q, echo tops) is one fixed grid: 0.005° pixels from
// 126°W to 65°W and 23°N to 50°N. Inside it NEXRAD wins; outside it, the
// Canada/Mexico fill layer shows, so the two never draw over each other.
export const NEXRAD_EXTENT = { south: 23, west: -126, north: 50, east: -65 };

// How far the radar map can pan and zoom out: North America from Alaska and
// Hawaii to Panama and the Caribbean, where the radar layers have data.
export const RADAR_VIEW = { south: 5, west: -172, north: 72, east: -50 };

// The fill frame to show with a NEXRAD frame: the newest one at or before it
// (plus a 5-minute grace, since the fill only updates every 10 minutes),
// otherwise the oldest one there is.
export function pairFill(time, fill) {
  if (!fill?.length || !time) return null;
  const t = Date.parse(time) + 5 * 60_000;
  let best = null;
  for (const f of fill) if (Date.parse(f.time) <= t && (!best || f.time > best.time)) best = f;
  return best || fill.reduce((a, b) => (a.time < b.time ? a : b));
}

// Web Mercator: a lat/lon to world pixels at zoom z (256 px tiles).
export function worldPixel(lat, lon, z, size = 256) {
  const scale = size * 2 ** z;
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

// The part of one tile that lies inside the box, in that tile's pixels, or null.
// `full` means the whole tile is inside, so it needn't be loaded at all.
export function maskRect({ x, y, z }, box = NEXRAD_EXTENT, size = 256) {
  const nw = worldPixel(box.north, box.west, z, size);
  const se = worldPixel(box.south, box.east, z, size);
  const left = Math.max(nw.x - x * size, 0);
  const top = Math.max(nw.y - y * size, 0);
  const right = Math.min(se.x - x * size, size);
  const bottom = Math.min(se.y - y * size, size);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top, full: left === 0 && top === 0 && right === size && bottom === size };
}

export const inView = (lat, lon, v = RADAR_VIEW) => lat >= v.south && lat <= v.north && lon >= v.west && lon <= v.east;
