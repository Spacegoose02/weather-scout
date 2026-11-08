import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATE = {
  ok: { icon: '🟢', word: 'Working' },
  slow: { icon: '🟡', word: 'Slow or flaky' },
  down: { icon: '🔴', word: 'Not answering' },
};

export function ago(iso, now = Date.now()) {
  if (!iso) return 'never';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}

export function overallText(s) {
  if (!s?.feeds?.length) return 'Nothing has been checked yet. Open a few cards and come back.';
  const down = s.feeds.filter((f) => f.state === 'down');
  if (down.length) return `${down.length} weather service${down.length === 1 ? ' is' : 's are'} not answering right now. Cards that use ${down.length === 1 ? 'it' : 'them'} may be out of date.`;
  if (s.overall === 'some-slow') return 'Everything is answering, but some services were slow or failed now and then this hour.';
  return 'All the weather services the app has used are answering.';
}

// 📶 Data feeds: which weather services are answering, from the server's own calls.
export default function DataFeeds() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api('/api/status').then(setS).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err) return <p className="hint">{err}</p>;
  if (!s) return <p className="hint">Checking…</p>;
  return (
    <div className="feeds">
      <p>{overallText(s)} <button className="link" onClick={load}>Refresh</button></p>
      <ul className="feed-list">
        {s.feeds.map((f) => (
          <li key={f.id} className={`feed ${f.state}`}>
            <span aria-hidden="true">{STATE[f.state].icon}</span>
            <span className="feed-name">{f.name}</span>
            <span className="hint">
              {STATE[f.state].word}
              {f.state === 'ok' ? ` · ${ago(f.lastOk)}` : ` · last worked ${ago(f.lastOk)}${f.lastError ? ` (${f.lastError})` : ''}`}
              {f.medianMs != null ? ` · ${f.medianMs < 1000 ? `${f.medianMs} ms` : `${(f.medianMs / 1000).toFixed(1)} s`}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">Only services the app has used since the server started are listed. Optional keys: AirNow {s.keys?.airnow ? '✓' : '✗'}, PurpleAir {s.keys?.purpleair ? '✓' : '✗'}, Google pollen {s.keys?.pollen ? '✓' : '✗'}.</p>
    </div>
  );
}
