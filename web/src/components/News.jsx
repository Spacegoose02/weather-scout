import { useEffect, useState } from 'react';
import { api } from '../api.js';

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const FILTERS = [['all', 'Everything'], ['local', 'Local'], ['national', 'National'], ['videos', 'Videos']];

function Stories({ items, onHide }) {
  return (
    <ul className="news-list">
      {items.map((n) => (
        <li key={n.link}>
          <a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a>
          <div className="video-meta">
            {n.source}{n.published ? ` · ${ago(n.published)}` : ''}
            {onHide && <> · <button className="link" onClick={() => onHide(n)} title="Hide this story for everyone">hide</button></>}
          </div>
          {n.summary && <p className="tile-note">{n.summary}</p>}
        </li>
      ))}
    </ul>
  );
}

function OfficeCard({ office, kidMode }) {
  if (!office) return null;
  return (
    <section className="card news office" aria-label="Your local weather office">
      <h2 className="card-title">{kidMode ? 'What the weather scientists near you say' : 'From your NWS office'}</h2>
      <p className="hint">
        National Weather Service <a href={office.link} target="_blank" rel="noopener noreferrer">{office.id}</a>
        {office.place ? ` covers ${office.place}.` : '.'}
        {kidMode && ' These are the people who make the forecast for your town!'}
      </p>
      {office.products.length === 0 ? (
        <p className="hint">Nothing new from the office in the last day.</p>
      ) : (
        <ul className="news-list">
          {office.products.map((p) => (
            <li key={p.id}>
              <a href={p.link} target="_blank" rel="noopener noreferrer">{p.title}</a>
              <div className="video-meta">{p.title !== p.name ? `${p.name} · ` : ''}{ago(p.published)}</div>
              {p.summary && <p className="tile-note">{p.summary}</p>}
              {!kidMode && p.text && (
                <details className="product-text">
                  <summary>Read the full text</summary>
                  <pre>{p.text}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function News({ isAdmin, onAdmin, kidMode = false, location }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [filter, setFilter] = useState('all');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (location) { q.set('lat', location.lat); q.set('lon', location.lon); }
    if (kidMode) q.set('kid', 'true');
    setError('');
    api(`/api/news?${q}`).then(setData).catch((e) => setError(e.message));
  }, [location?.lat, location?.lon, kidMode, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const hide = isAdmin ? async (item) => {
    if (!confirm(`Hide "${item.title}" for everyone? You can bring it back in Family & settings.`)) return;
    try {
      await api('/api/admin/media-hidden', { method: 'POST', body: { link: item.link, title: item.title } });
      if (playing?.link === item.link) setPlaying(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e.message);
    }
  } : null;

  const addSuggested = async () => {
    setBusy(true);
    try {
      const { suggestions } = await api('/api/admin/media-suggestions');
      await Promise.allSettled(suggestions.filter((s) => !s.added).map((s) => api('/api/admin/media', { method: 'POST', body: { kind: s.kind, url: s.url, title: s.title, scope: s.scope, kidSafe: s.kidSafe } })));
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card error" role="alert">{error}</div>;
  if (!data) return <div className="card skeleton">Loading news…</div>;
  const local = data.local ?? data.news;
  const national = data.national ?? [];
  const noFeeds = !data.news.length && !data.videos.length;
  const broken = data.feeds.filter((f) => !f.ok);
  const show = (k) => filter === 'all' || filter === k;

  return (
    <div className="news-page">
      <div className="news-filters" role="group" aria-label="Show">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={filter === id ? 'chip active' : 'chip'} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
        {kidMode && <span className="kid-safe-note">🛡️ Kid-safe stories only</span>}
      </div>

      {noFeeds && (
        <section className="card">
          <h2>{data.office ? 'Add more news and videos' : 'No news or videos yet'}</h2>
          <p className="hint">
            {isAdmin
              ? <>Add your local TV station, national sources or favorite storm chasers under <button className="link" onClick={onAdmin}>Family & settings</button>, or start with the free NOAA and NASA feeds.</>
              : 'Ask a grown-up with an admin account to add news feeds and YouTube channels.'}
          </p>
          {isAdmin && <button onClick={addSuggested} disabled={busy}>{busy ? 'Adding…' : 'Add the recommended national sources'}</button>}
        </section>
      )}

      <div className="news-grid">
        <div className="news-col">
          {show('local') && <OfficeCard office={data.office} kidMode={kidMode} />}
          {show('local') && local.length > 0 && (
            <section className="card news" aria-label="Local news">
              <h2 className="card-title">📍 Local weather news</h2>
              <Stories items={local} onHide={hide} />
            </section>
          )}
          {show('national') && national.length > 0 && (
            <section className="card news" aria-label="National news">
              <h2 className="card-title">🇺🇸 National weather news</h2>
              <Stories items={national} onHide={hide} />
            </section>
          )}
          {filter === 'local' && !data.office && !local.length && <p className="hint">No local news yet. Admins can mark a feed as local in Family & settings.</p>}
          {filter === 'national' && !national.length && <p className="hint">No national news yet.</p>}
        </div>

        {show('videos') && data.videos.length > 0 && (
          <section className="card videos" aria-label="Videos">
            <h2 className="card-title">▶️ Videos</h2>
            {playing && (
              <div className="player">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&rel=0&modestbranding=1`}
                  title={playing.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
                <p><strong>{playing.title}</strong> · {playing.source} <button className="link" onClick={() => setPlaying(null)}>close</button></p>
              </div>
            )}
            <ul className="video-list">
              {data.videos.map((v) => (
                <li key={v.videoId}>
                  <button className="video" onClick={() => setPlaying(v)} aria-label={`Play ${v.title}`}>
                    <img src={v.thumbnail} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    <span className="video-title">{v.pinned ? '⭐ ' : ''}{v.title}</span>
                    <span className="video-meta">{v.source}{v.published ? ` · ${ago(v.published)}` : ''}</span>
                  </button>
                  {hide && <button className="link video-hide" onClick={() => hide(v)}>hide</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {filter === 'videos' && !data.videos.length && <p className="hint">No videos yet.</p>}
      </div>

      {isAdmin && broken.length > 0 && (
        <p className="hint">Could not load: {broken.map((f) => `${f.title} (${f.error})`).join(', ')}</p>
      )}
    </div>
  );
}
