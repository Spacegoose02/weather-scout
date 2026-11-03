// Helpers for the admin AI settings form (kept apart from the component so they're easy to test).
const LANG = { a: 'American', b: 'British' };

// "af_heart" -> "Heart (American, female)", same as the server.
export function voiceLabel(id) {
  const m = /^([ab])([fm])_(.+)$/.exec(id || '');
  if (!m) return id || '';
  return `${m[3].charAt(0).toUpperCase()}${m[3].slice(1)} (${LANG[m[1]]}, ${m[2] === 'f' ? 'female' : 'male'})`;
}

// What to send on Save: edited plain values, and any secret the admin typed.
export function changedValues(settings, form) {
  const out = {};
  for (const s of settings) {
    const v = form[s.key] ?? '';
    if (s.secret) {
      if (v.trim()) out[s.key] = v.trim();
    } else if (v !== (s.value ?? '')) {
      out[s.key] = v;
    }
  }
  return out;
}

// Test and Preview use the same unsaved edits; the server fills in the rest.
export const draftValues = changedValues;
