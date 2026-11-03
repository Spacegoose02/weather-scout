import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import { useChase } from '../../../kid/chaser/useChase.js';
import { listWords } from '../../../kid/chaser/live.js';
import { KidChaserTip, StreamList } from '../../chasers/LiveChasers.jsx';
import '../../../chasers/chasers.css';

// Live storm chasers from the Storm Center's trusted, kid-safe list (a grown-up
// can change it in Family & settings). In the Kid Zone they only show while
// tornado or severe thunderstorm warnings are up somewhere, and start muted.
export default function LiveChase({ weather, kid, today, user }) {
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [, save] = useChase(kid);
  const nearMe = weather?.kid?.stormSafe?.active;

  useEffect(() => {
    let live = true;
    const load = () => api('/api/chaser/live').then((f) => {
      if (!live) return;
      setFeed(f);
      setError('');
    }).catch((e) => live && setError(e.message));
    load();
    const id = setInterval(load, 2 * 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  // A stream that goes offline (or a feed that turns off) closes.
  useEffect(() => {
    if (playing && feed && !feed.streams.some((s) => s.videoId === playing.videoId)) setPlaying(null);
  }, [feed]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (s) => {
    setPlaying(s);
    save((c) => ({ ...c, watched: [...new Set([...(c.watched || []), today])] }));
  };

  if (nearMe) {
    return (
      <section className="card live-chase">
        <h2>🎥 Live chase</h2>
        <p><strong>There is a warning near your house right now.</strong> Real chasers would say: the storm comes first! Let's follow our storm steps at the top of the page with a grown-up. The chase feed will be here later.</p>
      </section>
    );
  }
  if (error) return <section className="card live-chase"><h2>🎥 Live chase</h2><p>Could not check for live chases right now. {error}</p></section>;
  if (!feed) return <section className="card live-chase"><h2>🎥 Live chase</h2><p>Looking for chasers on the road… 🚙</p></section>;

  const w = feed.warnings;
  const follow = feed.channels.filter((c) => !c.live);
  return (
    <section className="card live-chase">
      <h2>🎥 Live chase</h2>
      <KidChaserTip />
      {w.unavailable ? (
        <p className="warn-line">Could not check the National Weather Service warnings right now.</p>
      ) : w.active ? (
        <p className="warn-line">⚠️ Right now: <strong>{w.tornado} tornado</strong> and <strong>{w.severe} severe thunderstorm</strong> warning{w.tornado + w.severe === 1 ? '' : 's'}{w.states.length ? ` in ${listWords(w.states)}` : ''}.</p>
      ) : (
        <p className="warn-line">😴 No tornado or severe thunderstorm warnings anywhere right now. The chase feed turns on when storms are warned.</p>
      )}

      {playing && (
        <div className="live-player">
          <div className="live-frame">
            <iframe
              title={`${playing.title} live stream`}
              src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p className="hint small">Starts muted. Live streams are not checked ahead of time, so a grown-up can turn the sound on. If something looks scary, close it. <button className="link" onClick={() => setPlaying(null)}>Close</button></p>
        </div>
      )}

      {feed.streams.length > 0 && <StreamList streams={feed.streams} onPlay={play} />}
      {w.active && feed.available && !feed.streams.length && <p>None of the chasers are streaming right now. Check back in a few minutes!</p>}
      {!feed.available && <p className="hint">Could not reach YouTube to check the chasers right now.</p>}
      {follow.length > 0 && (
        <p className="hint small">
          Chasers on Rocky's list: {follow.map((c) => c.name).join(' · ')}.
          {user?.isAdmin ? ' Change the list in Family & settings.' : ' A grown-up can change the list in Family & settings.'}
        </p>
      )}
    </section>
  );
}
