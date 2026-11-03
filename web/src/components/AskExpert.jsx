import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { CLOUD_EMOJI, CLOUD_NAMES, speakable, suggestions, toHistory } from '../ai/logic.js';
import SpeakButton from './kid/SpeakButton.jsx';
import RockyFace from './RockyFace.jsx';
import '../ai/ask.css';

const STORE = 'ws-ask-chat';
const load = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || '[]');
  } catch {
    return [];
  }
};
const save = (items) => {
  try {
    // Photos are big, so only the answers are kept between tab switches.
    sessionStorage.setItem(STORE, JSON.stringify(items.filter((m) => !m.pending).map((m) => (m.kind === 'photo' ? { ...m, image: null } : m)).slice(-30)));
  } catch { /* private mode: chat just isn't remembered */ }
};

// Shrink a photo in the browser so uploads stay small and fast.
async function shrink(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AskExpert({ ai, weather, location, units, kidMode, tts }) {
  const [items, setItems] = useState(load);
  const [text, setText] = useState('');
  const [search, setSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const endRef = useRef();

  useEffect(() => {
    save(items);
  }, [items]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [items.length]);

  const where = { lat: location?.lat, lon: location?.lon, place: location?.name, units, kidMode };
  const push = (...m) => setItems((list) => [...list.filter((x) => !x.pending), ...m]);
  const fail = (e) => push({ role: 'assistant', text: e.message, error: true });

  const ask = async (q) => {
    const question = q.trim();
    if (!question || busy) return;
    const mine = { role: 'user', text: question };
    const history = toHistory([...items, mine]);
    setText('');
    setBusy(true);
    push(mine, { role: 'assistant', pending: true });
    try {
      const r = await api('/api/ai/chat', { method: 'POST', body: { ...where, search: search && ai.search, messages: history } });
      push({ role: 'assistant', text: r.answer, sources: r.sources, searched: r.searched });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const photo = async (file) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const image = await shrink(file);
      push({ role: 'user', kind: 'photo', image }, { role: 'assistant', pending: true });
      const cloud = await api('/api/ai/cloud', { method: 'POST', body: { ...where, image } });
      push({ role: 'assistant', kind: 'cloud', cloud });
    } catch (e) {
      fail(e.status ? e : new Error('Could not open that photo. Try another one.'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const name = kidMode ? 'Rocky' : 'Weather expert';
  const intro = kidMode
    ? "Hi, I'm Rocky! Ask me anything about weather, clouds or the sky. You can also snap a picture of the clouds and I'll tell you what they are!"
    : `Ask about the forecast for ${location?.name || 'your place'}, how weather works, or snap a cloud photo to identify it.${ai.search ? ' Turn on web search for news and deeper "why" questions.' : ''}`;

  return (
    <section className={`ask card ${kidMode ? 'ask-kid' : ''}`} aria-label={kidMode ? 'Ask Rocky' : 'Ask a weather expert'}>
      <div className="ask-head">
        <div className="ask-title">
          {kidMode ? <RockyFace className="ask-avatar" /> : <span className="ask-avatar" aria-hidden>🧑‍🔬</span>}
          <h2>{kidMode ? 'Ask Rocky' : 'Ask a weather expert'}</h2>
        </div>
        {items.length > 0 && <button className="link" onClick={() => setItems([])}>New chat</button>}
      </div>

      <div className="ask-log" aria-live="polite">
        <Bubble who={name} kidMode={kidMode} m={{ role: 'assistant', text: intro }} />
        {items.map((m, i) => <Bubble key={i} who={name} kidMode={kidMode} readAloud={kidMode || !!tts?.enabled} m={m} />)}
        <div ref={endRef} />
      </div>

      {items.length === 0 && (
        <div className="ask-chips">
          {suggestions(weather, kidMode).map((s) => <button key={s} className="ghost" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
        </div>
      )}

      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kidMode ? 'Type your question for Rocky…' : 'Ask about the weather…'}
          maxLength={1000}
          aria-label="Your question"
        />
        <button type="submit" disabled={busy || !text.trim()}>{busy ? '…' : 'Ask'}</button>
      </form>
      <div className="ask-tools">
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          <span aria-hidden>📷</span> {kidMode ? 'What cloud is that?' : 'Identify a cloud'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => photo(e.target.files?.[0])} />
        {ai.search && (
          <label className="ask-toggle">
            <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
            <span aria-hidden>🔎</span> Search the web{kidMode ? ' (kid-safe science sites)' : ''}
          </label>
        )}
      </div>
      <p className="ask-note">
        {kidMode
          ? 'Rocky is a computer helper and can make mistakes. For storms, always listen to your grown-ups.'
          : 'AI answers can be wrong. For warnings and safety decisions, follow the National Weather Service and local officials.'}
      </p>
    </section>
  );
}

function Bubble({ m, who, kidMode, readAloud }) {
  if (m.pending) return <div className="ask-bubble them pending"><span className="dots" aria-label={`${who} is thinking`}><i /><i /><i /></span></div>;
  if (m.kind === 'photo') {
    return <div className="ask-bubble me photo">{m.image ? <img src={m.image} alt="Your sky photo" /> : <span>📷 Sky photo</span>}</div>;
  }
  if (m.kind === 'cloud') return <CloudCard cloud={m.cloud} kidMode={kidMode} readAloud={readAloud} />;
  const mine = m.role === 'user';
  return (
    <div className={`ask-bubble ${mine ? 'me' : 'them'} ${m.error ? 'error' : ''}`}>
      <p>{m.text}</p>
      {m.sources?.length > 0 && (
        <ul className="ask-sources">
          {m.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a></li>)}
        </ul>
      )}
      {!mine && !m.error && readAloud && <SpeakButton text={speakable(m)} label="Read it" className="small" />}
    </div>
  );
}

function CloudCard({ cloud, kidMode, readAloud }) {
  return (
    <div className="ask-bubble them cloud-card">
      <div className="cloud-top">
        <span className="cloud-emoji" aria-hidden>{CLOUD_EMOJI[cloud.cloudType] || '☁️'}</span>
        <div>
          <strong>{cloud.title}</strong>
          <div className="cloud-type">
            {CLOUD_NAMES[cloud.cloudType] || cloud.cloudType}
            {cloud.isSky && <span className={`conf ${cloud.confidence}`}>{cloud.confidence === 'high' ? 'Pretty sure' : cloud.confidence === 'medium' ? 'Good guess' : 'Not sure'}</span>}
          </div>
        </div>
      </div>
      <p>{cloud.explanation}</p>
      {cloud.isSky && (
        <dl>
          <dt>{kidMode ? 'What it means' : 'Weather it brings'}</dt><dd>{cloud.weatherHint}</dd>
          <dt>Fun fact</dt><dd>{cloud.funFact}</dd>
          <dt>{kidMode ? 'Spot it next time' : 'How to spot it'}</dt><dd>{cloud.lookFor}</dd>
        </dl>
      )}
      {readAloud && <SpeakButton text={speakable({ kind: 'cloud', cloud })} label="Read it" className="small" />}
    </div>
  );
}
