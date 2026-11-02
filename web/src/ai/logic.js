// Pure helpers for the Ask tab (kept separate so they are easy to test).

export const CLOUD_NAMES = {
  cumulus: 'Cumulus', stratus: 'Stratus', stratocumulus: 'Stratocumulus', nimbostratus: 'Nimbostratus',
  cumulonimbus: 'Cumulonimbus', altocumulus: 'Altocumulus', altostratus: 'Altostratus', cirrus: 'Cirrus',
  cirrostratus: 'Cirrostratus', cirrocumulus: 'Cirrocumulus', fog: 'Fog', 'clear-sky': 'Clear sky', 'not-sky': 'Not the sky',
};

export const CLOUD_EMOJI = {
  cumulus: '☁️', stratus: '🌫️', stratocumulus: '☁️', nimbostratus: '🌧️', cumulonimbus: '⛈️',
  altocumulus: '🐑', altostratus: '🌥️', cirrus: '🪶', cirrostratus: '💍', cirrocumulus: '🐟',
  fog: '🌫️', 'clear-sky': '☀️', 'not-sky': '📷',
};

// What the server sees of the conversation: plain text turns. A cloud photo
// becomes a short note so follow-up questions ("does that mean rain?") work.
export function toHistory(items) {
  return items
    .filter((m) => !m.error && !m.pending)
    .map((m) => {
      if (m.kind === 'photo') return { role: 'user', content: 'I took a photo of the sky. What kind of cloud is it?' };
      if (m.kind === 'cloud') {
        const c = m.cloud;
        return { role: 'assistant', content: `From the photo: ${c.title} (${CLOUD_NAMES[c.cloudType] || c.cloudType}, ${c.confidence} confidence). ${c.explanation} ${c.weatherHint}` };
      }
      return { role: m.role, content: m.text };
    })
    .slice(-12);
}

// Starter questions that fit today's weather.
export function suggestions(weather, kidMode) {
  const c = weather?.forecast?.current || {};
  const today = weather?.forecast?.daily?.[0] || {};
  const alert = weather?.alerts?.[0];
  const out = [];
  if (kidMode) {
    if (alert) out.push(`What does a ${alert.event} mean?`);
    if ((today.precipChance ?? 0) >= 40) out.push('Will it rain at recess?');
    else out.push('Is it a good day to play outside?');
    out.push('Why is the sky blue?', 'How do clouds float?', 'What makes thunder?');
    if ((c.temp ?? 99) < 40) out.push('Why does my breath make clouds?');
  } else {
    if (alert) out.push(`What should we do about the ${alert.event}?`);
    out.push('What should I wear today?', 'Best time for a walk this week?');
    if ((today.precipChance ?? 0) >= 30) out.push('When will the rain start and stop?');
    out.push('Explain the pressure trend', 'Is El Niño affecting us this year?');
  }
  return [...new Set(out)].slice(0, 5);
}

// Read-aloud text for an answer or cloud card.
export function speakable(m) {
  if (m.kind === 'cloud') {
    const c = m.cloud;
    return [c.title, c.explanation, c.weatherHint, c.funFact && `Fun fact: ${c.funFact}`, c.lookFor].filter(Boolean).join(' ');
  }
  return m.text || '';
}
