import { useState } from 'react';
import { POPUP_MODES, liveFor, viewersLabel } from '../../chasers/chasers.js';
import { useLiveChasers } from './useLiveChasers.js';
import '../../chasers/chasers.css';

export function ChaserPlayer({ stream, kid, onClose }) {
  return (
    <div className="player chaser-player">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${stream.videoId}?autoplay=1&rel=0&modestbranding=1`}
        title={stream.title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
      <p>
        <span className="live-badge">LIVE</span> <strong>{stream.title}</strong> · {stream.channel}
        {' '}<button className="link" onClick={onClose}>close</button>
      </p>
      {kid && <p className="hint">Live streams are not checked ahead of time. If something looks scary or sounds rude, tell a grown-up and close it.</p>}
    </div>
  );
}

export function StreamList({ streams, onPlay }) {
  return (
    <ul className="video-list chaser-list">
      {streams.map((s) => (
        <li key={s.videoId}>
          <button className="video" onClick={() => onPlay(s)} aria-label={`Watch ${s.title} live`}>
            <span className="chaser-thumb">
              <img src={s.thumbnail} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              <span className="live-badge">LIVE</span>
            </span>
            <span className="video-title">{s.trusted ? '⭐ ' : ''}{s.title}</span>
            <span className="video-meta">{[s.channel, viewersLabel(s.viewers), liveFor(s.startedAt)].filter(Boolean).join(' · ')}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export const KidChaserTip = () => (
  <p className="chaser-tip">
    🦝 Rocky says: storm chasers are trained grown-ups with special trucks, radar and a team keeping them safe.
    Watching from home is how future storm chasers start. Learn the clouds, study the radar, and never go toward a storm yourself!
  </p>
);

// "Storm chasers live" in the Storm Center: streams to watch, the trusted
// channels when nobody is live, and the pop-up setting.
export default function LiveChasers({ kid, popups }) {
  const { data, error } = useLiveChasers({ kid });
  const [playing, setPlaying] = useState(null);
  const streams = data?.streams || [];
  const offline = (data?.channels || []).filter((c) => !c.live);

  return (
    <section className="topic-section chasers" aria-label="Storm chasers live">
      <h3>🎥 Storm chasers live</h3>
      {kid && <KidChaserTip />}
      {playing && <ChaserPlayer stream={playing} kid={kid} onClose={() => setPlaying(null)} />}
      {!data && !error && <p className="hint">Looking for chasers on the road…</p>}
      {error && !data && <p className="hint">Could not check for live chasers right now.</p>}
      {data && (streams.length ? (
        <StreamList streams={streams} onPlay={setPlaying} />
      ) : (
        <p className="hint">No storm chasers are streaming right now. Chasers go live when big storms form, mostly on spring and summer afternoons in the Plains.</p>
      ))}
      {data?.warning && !kid && <p className="hint">{data.warning}</p>}
      {offline.length > 0 && (
        <p className="chaser-channels">
          {streams.length ? 'More chasers to follow: ' : 'Chasers to follow: '}
          {offline.map((c, i) => (
            <span key={c.handle}>{i > 0 && ' · '}<a href={c.url} target="_blank" rel="noreferrer" title={c.note}>{c.name}</a></span>
          ))}
        </p>
      )}
      {data && !kid && data.mode === 'keyless' && (
        <p className="hint">Showing the trusted chaser list. An admin can add a YouTube key in Family & settings to also find other live chasers.</p>
      )}
      {popups && (
        <label className="chaser-popups">
          <span>Pop up live chasers</span>
          <select value={popups.mode} onChange={(e) => popups.onChange(e.target.value)}>
            {POPUP_MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}
