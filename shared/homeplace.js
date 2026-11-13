// Renaming the home place used to leave its latitude and longitude behind, so
// "Salem, VA" kept showing Richmond's weather. These find the renamed place.

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

/** "Salem, VA" -> { town: 'Salem', region: 'Virginia' }. */
export function splitPlace(name) {
  const [town, ...rest] = String(name || '').split(',').map((s) => s.trim()).filter(Boolean);
  const r = rest.join(', ');
  return { town: town || '', region: STATES[r.toUpperCase()] || r };
}

/** The search hit that best matches a typed name (its state or country, if given). */
export function pickPlace(name, hits = []) {
  const { region } = splitPlace(name);
  if (!hits.length) return null;
  if (!region) return hits[0];
  const want = region.toLowerCase();
  return hits.find((h) => String(h.name).toLowerCase().split(', ').slice(1).some((p) => p === want || p.startsWith(want))) || null;
}

/**
 * When the home place has a name but no coordinates of its own (a settings save
 * that renamed it, or a name set without them), look the name up and add them.
 * Returns { values, found } where found is the place used, or null if nothing
 * matched (the values are then unchanged).
 */
// With `strict` (the home already has coordinates), only a name that says its
// state or country ("Roanoke, VA") moves it, so "Grandma's" stays put.
export async function withHomeCoords(values, lookup, { strict = false } = {}) {
  const name = values.DEFAULT_LOCATION_NAME;
  if (!name || values.DEFAULT_LAT || values.DEFAULT_LON) return { values, found: null };
  const { town, region } = splitPlace(name);
  if (!town || (strict && !region)) return { values, found: null };
  let hits = [];
  try { hits = await lookup(town); } catch { /* keep the old place */ }
  const found = pickPlace(name, hits);
  if (!found) return { values, found: null };
  return { values: { ...values, DEFAULT_LAT: String(found.lat), DEFAULT_LON: String(found.lon) }, found };
}
