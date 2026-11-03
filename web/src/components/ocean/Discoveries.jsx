import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { trackProgress, localDay } from '../../kid/badges.js';
import SpeakButton from '../kid/SpeakButton.jsx';

const DAY = 86_400_000;
function ago(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Story({ s, kid, ai, location, units }) {
  const [img, setImg] = useState(!!s.image);
  const [word, setWord] = useState(null);
  const [explain, setExplain] = useState(null); // null | 'loading' | { text } | { error }
  const fresh = s.published && Date.now() - Date.parse(s.published) < 7 * DAY;
  const read = () => trackProgress({ discoveries: { [s.id]: localDay() } });
  const ask = async () => {
    setExplain('loading');
    try {
      const prompt = `Explain this ocean discovery to a kid in three short, fun sentences. Then add one "wow" fact about it.\n\nHeadline: ${s.title}\nSummary: ${s.summary || '(none)'}\nFrom: ${s.source}`;
      const r = await api('/api/ai/chat', { method: 'POST', body: { lat: location?.lat, lon: location?.lon, units, kidMode: true, messages: [{ role: 'user', content: prompt }] } });
      setExplain({ text: r.answer });
      read();
    } catch (e) {
      setExplain({ error: e.message });
    }
  };

  return (
    <li className="discovery">
      <a className="discovery-pic" href={s.link} target="_blank" rel="noopener noreferrer" onClick={read} tabIndex={-1} aria-hidden>
        {img
          ? <img src={s.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImg(false)} />
          : <span className="discovery-emoji">{s.emoji}</span>}
        {fresh && <span className="discovery-new">New!</span>}
      </a>
      <div className="discovery-body">
        <div className="discovery-tags">
          {s.tags.map((t) => <span key={t.id} className="discovery-tag">{t.emoji} {t.label}</span>)}
        </div>
        <h3><a href={s.link} target="_blank" rel="noopener noreferrer" onClick={read}>{s.title}</a></h3>
        <p>{kid ? s.kid : s.summary}</p>
        {kid && s.words.length > 0 && (
          <div className="wow-words">
            <span className="hint">Wow words:</span>
            {s.words.map((w) => (
              <button key={w.word} className={`chip ${word === w.word ? 'active' : ''}`} aria-expanded={word === w.word} onClick={() => setWord(word === w.word ? null : w.word)}>
                {w.word}
              </button>
            ))}
            {word && <p className="wow-means">💡 <strong>{word}:</strong> {s.words.find((w) => w.word === word)?.means}</p>}
          </div>
        )}
        {explain && (
          <div className="rocky-explains" aria-live="polite">
            {explain === 'loading' ? 'Rocky is reading the story…' : explain.error ? `😕 ${explain.error}` : <><strong>Rocky says:</strong> {explain.text}</>}
          </div>
        )}
        <div className="discovery-actions">
          <a className="button-link" href={s.link} target="_blank" rel="noopener noreferrer" onClick={read}>Read the story</a>
          <SpeakButton text={`${s.title}. ${kid ? s.kid : s.summary}`} onSpeak={read} />
          {ai?.enabled && kid && explain !== 'loading' && !explain?.text && <button className="ghost" onClick={ask}>🦝 Rocky, explain it!</button>}
          <span className="discovery-meta">{s.source}{s.published ? ` · ${ago(s.published)}` : ''}</span>
        </div>
      </div>
    </li>
  );
}

export default function Discoveries({ kid, kidMode, ai, location, units }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tag, setTag] = useState('all');
  useEffect(() => {
    setData(null);
    setError('');
    api(`/api/ocean/discoveries${kidMode ? '?kid=1' : ''}`).then(setData).catch((e) => setError(e.message));
  }, [kidMode]);

  const tags = useMemo(() => {
    const count = new Map();
    for (const s of data?.items || []) for (const t of s.tags) count.set(t.id, { ...t, n: (count.get(t.id)?.n || 0) + 1 });
    return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [data]);
  const items = (data?.items || []).filter((s) => tag === 'all' || s.tags.some((t) => t.id === tag));

  return (
    <section className="card ocean-news">
      <h2>🔭 {kid ? 'New ocean discoveries' : 'Latest ocean discoveries'}</h2>
      <p className="hint">{kid
        ? 'Real news from scientists exploring the sea. Tap a story to read more, or hear it out loud.'
        : 'Fresh stories from ocean exploration teams and marine science news, newest first.'}
      </p>
      {error && <p className="error-text">Could not load ocean news: {error}</p>}
      {!data && !error && <p className="hint">Diving for the latest news…</p>}
      {tags.length > 1 && (
        <div className="storm-tabs" role="group" aria-label="Pick a topic">
          <button className={`chip ${tag === 'all' ? 'active' : ''}`} aria-pressed={tag === 'all'} onClick={() => setTag('all')}>🌊 Everything</button>
          {tags.map((t) => (
            <button key={t.id} className={`chip ${tag === t.id ? 'active' : ''}`} aria-pressed={tag === t.id} onClick={() => setTag(t.id)}>{t.emoji} {t.label}</button>
          ))}
        </div>
      )}
      {data && items.length === 0 && <p className="hint">No stories right now. Check back soon!</p>}
      <ul className="discoveries">
        {items.map((s) => <Story key={s.id} s={s} kid={kid} ai={ai} location={location} units={units} />)}
      </ul>
      {data?.sources?.length > 0 && (
        <p className="topic-links">
          From: {data.sources.map((src, i) => (
            <span key={src.id}>{i > 0 && ' · '}<a href={src.home} target="_blank" rel="noopener noreferrer">{src.title}</a>{!src.ok && ' (offline)'}</span>
          ))}
        </p>
      )}
    </section>
  );
}
