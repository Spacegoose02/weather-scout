import { useEffect, useState } from 'react';
import { api } from '../api.js';

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function News({ isAdmin, onAdmin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    api('/api/news').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="card error" role="alert">{error}</div>;
  if (!data) return <div className="card skeleton">Loading news…</div>;
  const empty = !data.news.length && !data.videos.length;
  const broken = data.feeds.filter((f) => !f.ok);

  return (
    <div className="news-grid">
      {empty && (
        <section className="card">
          <h2>No news or videos yet</h2>
          <p className="hint">
            {isAdmin
              ? <>Add your local NWS office, TV station or favorite storm chasers under <button className="link" onClick={onAdmin}>Family & settings</button>.</>
              : 'Ask a grown-up with an admin account to add news feeds and YouTube channels.'}
          </p>
        </section>
      )}

      {data.videos.length > 0 && (
        <section className="card videos" aria-label="Videos">
          <h2 className="card-title">Videos</h2>
          {playing && (
            <div className="player">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1`}
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
                  <span className="video-title">{v.title}</span>
                  <span className="video-meta">{v.source} · {ago(v.published)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.news.length > 0 && (
        <section className="card news" aria-label="News">
          <h2 className="card-title">Weather news</h2>
          <ul className="news-list">
            {data.news.map((n) => (
              <li key={n.link}>
                <a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a>
                <div className="video-meta">{n.source}{n.published ? ` · ${ago(n.published)}` : ''}</div>
                {n.summary && <p className="tile-note">{n.summary}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && broken.length > 0 && (
        <p className="hint">Could not load: {broken.map((f) => `${f.title} (${f.error})`).join(', ')}</p>
      )}
    </div>
  );
}
