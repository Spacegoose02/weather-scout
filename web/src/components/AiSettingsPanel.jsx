import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { speak } from '../kid/speak.js';
import { voiceLabel, changedValues, draftValues } from '../ai/settings.js';

// Family & settings: the AI helper (Claude or Ollama) and Rocky's read-aloud
// voice (Kokoro). Saved on the server and used right away; anything left alone
// keeps coming from the container's environment (the Unraid template).
const SAMPLE = "Hi! I'm Rocky. Let's check the sky together!";
const DEFAULTS = { AI_MODEL: 'claude-opus-5-5', OLLAMA_MODEL: 'gemma3', AI_DAILY_LIMIT: '40', AI_WEB_SEARCH: 'true', KOKORO_VOICE: 'af_heart', KOKORO_SPEED: '1', KOKORO_FALLBACK: 'browser' };
const PROVIDER = { anthropic: 'Claude', ollama: 'Ollama' };

export default function AiSettingsPanel() {
  const [view, setView] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState('');
  const [tests, setTests] = useState({});
  const [models, setModels] = useState([]);
  const [voices, setVoices] = useState([]);
  const audio = useRef(null);

  const show = (v) => {
    setView(v);
    setForm(Object.fromEntries(v.settings.map((s) => [s.key, s.secret ? '' : s.value])));
  };
  useEffect(() => { api('/api/admin/ai-settings').then(show).catch((e) => setError(e.message)); }, []);

  const rows = Object.fromEntries((view?.settings || []).map((s) => [s.key, s]));
  const kokoroUrl = form.KOKORO_URL ?? '';
  // Fill the voice list as soon as there's a Kokoro address to ask.
  useEffect(() => {
    if (!view || !kokoroUrl) return undefined;
    const t = setTimeout(() => test('kokoro', { quiet: true }), 600);
    return () => clearTimeout(t);
  }, [view, kokoroUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return error ? <p className="error-text">{error}</p> : null;

  const set = (key) => (e) => { setSaved(''); setForm({ ...form, [key]: e.target.value }); };
  const changes = changedValues(view.settings, form);
  const dirty = Object.keys(changes).length > 0;

  const run = async (label, fn) => {
    setError('');
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const save = (values, note = 'Saved. The new settings are in use now.') => run('save', async () => {
    show(await api('/api/admin/ai-settings', { method: 'PUT', body: { values } }));
    setTests({});
    setSaved(note);
  });

  async function test(target, { quiet = false } = {}) {
    if (!quiet) setTests((t) => ({ ...t, [target]: { pending: true } }));
    try {
      const r = await api('/api/admin/ai-settings/test', { method: 'POST', body: { target, values: draftValues(view.settings, form) } });
      if (r.models) setModels(r.models);
      if (r.voices) setVoices(r.voices);
      if (!quiet) setTests((t) => ({ ...t, [target]: r }));
    } catch (e) {
      if (!quiet) setTests((t) => ({ ...t, [target]: { ok: false, message: e.message } }));
    }
  }

  const preview = () => run('preview', async () => {
    const res = await fetch('/api/admin/ai-settings/preview-voice', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: SAMPLE, values: draftValues(view.settings, form) }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Preview failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    audio.current?.pause();
    audio.current = new Audio(url);
    audio.current.onended = () => URL.revokeObjectURL(url);
    await audio.current.play();
  });

  const ctx = { rows, form, set, save, tests };

  const status = view.ai.enabled
    ? `🟢 On, using ${PROVIDER[view.ai.provider]}${view.ai.search ? ' with web search' : ''}.`
    : '⚪ Off. Add a Claude key or an Ollama address to turn on Ask an Expert, Ask Rocky and the cloud photo identifier.';
  const speed = Number(form.KOKORO_SPEED || DEFAULTS.KOKORO_SPEED);
  const voiceOptions = voices.length ? voices : (form.KOKORO_VOICE || DEFAULTS.KOKORO_VOICE) ? [{ id: form.KOKORO_VOICE || DEFAULTS.KOKORO_VOICE, label: voiceLabel(form.KOKORO_VOICE || DEFAULTS.KOKORO_VOICE) }] : [];

  return (
    <form className="ai-settings" onSubmit={(e) => { e.preventDefault(); if (dirty) save(changes); }}>
      <h3>AI helper & Rocky's voice</h3>
      <p className="hint">
        {status} Settings saved here are kept on the server (in the data folder) and win over the Unraid template.
        Keys are never shown again after you save them.
      </p>

      <fieldset>
        <legend>Which AI</legend>
        <label>
          <span>Run the AI helper on <Source ctx={ctx} k="AI_PROVIDER" /></span>
          <select value={form.AI_PROVIDER} onChange={set('AI_PROVIDER')}>
            <option value="">Automatic (Claude if it has a key, otherwise Ollama)</option>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="ollama">Ollama (my own server)</option>
            <option value="off">Off</option>
          </select>
        </label>
        <div className="ai-row">
          <label>
            <span>Questions per person per day <Source ctx={ctx} k="AI_DAILY_LIMIT" /></span>
            <input type="number" min="0" max="99999" placeholder={DEFAULTS.AI_DAILY_LIMIT} value={form.AI_DAILY_LIMIT} onChange={set('AI_DAILY_LIMIT')} />
            <small className="hint">0 means no limit.</small>
          </label>
          <label>
            <span>Web search <Source ctx={ctx} k="AI_WEB_SEARCH" /></span>
            <select value={form.AI_WEB_SEARCH || DEFAULTS.AI_WEB_SEARCH} onChange={set('AI_WEB_SEARCH')}>
              <option value="true">Allowed (kid-safe science sites only in Kid Mode)</option>
              <option value="false">Off</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Claude (Anthropic)</legend>
        <Secret ctx={ctx} k="ANTHROPIC_API_KEY" label="API key" help={<>Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>.</>} />
        <Text ctx={ctx} k="AI_MODEL" label="Model" help="claude-opus-5-5 is the smartest; claude-sonnet-5-5 or claude-haiku-5-5 cost less." list="ai-claude-models" />
        <datalist id="ai-claude-models">
          {['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'].map((m) => <option key={m} value={m} />)}
        </datalist>
        <div className="ai-actions">
          <button type="button" className="ghost" disabled={tests.anthropic?.pending} onClick={() => test('anthropic')}>Test connection</button>
        </div>
        <Result ctx={ctx} target="anthropic" />
      </fieldset>

      <fieldset>
        <legend>Ollama (your own server)</legend>
        <Text ctx={ctx} k="OLLAMA_URL" label="Address" placeholder="http://192.168.1.20:11434" />
        <div className="ai-row">
          <Text ctx={ctx} k="OLLAMA_MODEL" label="Chat model" help="Pull it on the Ollama server first, e.g. ollama pull gemma3." list="ai-ollama-models" />
          <Text ctx={ctx} k="OLLAMA_VISION_MODEL" label="Photo model" placeholder="same as chat model" help="Only if the chat model can't see photos, e.g. qwen2.5vl." list="ai-ollama-models" />
        </div>
        <datalist id="ai-ollama-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        <Secret ctx={ctx} k="OLLAMA_API_KEY" label="Web search key" help={<>Optional free key from <a href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer">ollama.com</a>, only for Search the web.</>} />
        <div className="ai-actions">
          <button type="button" className="ghost" disabled={tests.ollama?.pending} onClick={() => test('ollama')}>Test connection</button>
        </div>
        <Result ctx={ctx} target="ollama" />
      </fieldset>

      <fieldset>
        <legend>Rocky's read-aloud voice</legend>
        <Text ctx={ctx} k="KOKORO_URL" label="Kokoro address" placeholder="http://192.168.1.20:8880" help="The Kokoro-FastAPI container. Leave blank to read with each device's own voice." />
        <div className="ai-row">
          <label>
            <span>Rocky's voice <Source ctx={ctx} k="KOKORO_VOICE" /></span>
            <select value={form.KOKORO_VOICE || DEFAULTS.KOKORO_VOICE} onChange={set('KOKORO_VOICE')} disabled={!kokoroUrl}>
              {voiceOptions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <small className="hint">Everyone hears this unless they pick another voice for themselves.</small>
          </label>
          <label>
            <span>Speed: {speed.toFixed(2).replace(/0$/, '')}× <Source ctx={ctx} k="KOKORO_SPEED" /></span>
            <input type="range" min="0.5" max="2" step="0.05" value={speed} onChange={set('KOKORO_SPEED')} disabled={!kokoroUrl} />
          </label>
        </div>
        <label>
          <span>If Kokoro can't answer <Source ctx={ctx} k="KOKORO_FALLBACK" /></span>
          <select value={form.KOKORO_FALLBACK || DEFAULTS.KOKORO_FALLBACK} onChange={set('KOKORO_FALLBACK')}>
            <option value="browser">Read with the device's own voice</option>
            <option value="off">Stay quiet</option>
          </select>
        </label>
        <div className="ai-actions">
          <button type="button" className="ghost" disabled={!kokoroUrl || tests.kokoro?.pending} onClick={() => test('kokoro')}>Test connection</button>
          <button type="button" className="ghost" disabled={!kokoroUrl || busy === 'preview'} onClick={preview}>{busy === 'preview' ? 'Loading…' : '▶ Preview voice'}</button>
          <button type="button" className="link" onClick={() => speak(SAMPLE, { voice: 'browser' })}>Hear this device's voice</button>
        </div>
        <Result ctx={ctx} target="kokoro" />
      </fieldset>

      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="ai-actions ai-save">
        <button type="submit" disabled={!dirty || busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save AI settings'}</button>
        {dirty && <button type="button" className="link" onClick={() => show(view)}>Undo changes</button>}
        {saved && !dirty && <span className="hint" role="status">✅ {saved}</span>}
      </div>
    </form>
  );
}

// Field helpers live outside the panel so inputs keep focus while typing.
function Source({ ctx, k }) {
  const r = ctx.rows[k];
  if (!r) return null;
  if (r.source === 'saved') {
    return (
      <span className="ai-src saved">
        saved here
        <button type="button" className="link" onClick={() => ctx.save({ [k]: null }, r.envSet ? 'Back to the Unraid template value.' : 'Back to the default.')}>
          {r.envSet ? 'use template value' : 'use default'}
        </button>
      </span>
    );
  }
  return <span className="ai-src">{r.source === 'env' ? 'from Unraid template' : 'default'}</span>;
}

function Secret({ ctx, k, label, help }) {
  const r = ctx.rows[k];
  return (
    <label>
      <span>{label} <Source ctx={ctx} k={k} /></span>
      <input
        type="password" autoComplete="new-password" spellCheck={false}
        placeholder={r.set ? `•••• ${r.hint} (type a new one to replace it)` : 'not set'}
        value={ctx.form[k]} onChange={ctx.set(k)}
      />
      {help && <small className="hint">{help}</small>}
    </label>
  );
}

function Text({ ctx, k, label, placeholder, help, list }) {
  return (
    <label>
      <span>{label} <Source ctx={ctx} k={k} /></span>
      <input type="text" spellCheck={false} placeholder={placeholder ?? DEFAULTS[k] ?? ''} value={ctx.form[k]} onChange={ctx.set(k)} list={list} />
      {help && <small className="hint">{help}</small>}
    </label>
  );
}

function Result({ ctx, target }) {
  const r = ctx.tests[target];
  if (!r) return null;
  if (r.pending) return <p className="ai-test" role="status">Checking…</p>;
  return <p className={`ai-test ${r.ok ? 'good' : 'bad'}`} role="status">{r.ok ? '🟢' : '🔴'} {r.message}</p>;
}
