import { useState } from 'react';
import Modal from '../Modal.jsx';
import { freshStreams, readDismissed, shouldWatch, stormyAlerts, writeDismissed } from '../../chasers/chasers.js';
import { useLiveChasers } from './useLiveChasers.js';
import { ChaserPlayer, KidChaserTip, StreamList } from './LiveChasers.jsx';
import '../../chasers/chasers.css';

// A small pop-up in the corner when storm chasers are streaming live: with
// severe alerts near you (default), any time, or never (Storm Center setting).
// Each stream pops up once; dismissing hides those streams for 12 hours.
export default function ChaserPopup({ alerts, kidMode, mode, onMode }) {
  const watching = shouldWatch(mode, alerts);
  const { data } = useLiveChasers({ kid: kidMode, enabled: watching });
  const [dismissed, setDismissed] = useState(readDismissed);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(null);
  const streams = watching ? data?.streams || [] : [];
  const fresh = freshStreams(streams, dismissed);

  const dismiss = () => {
    const ids = streams.map((s) => s.videoId);
    writeDismissed(ids);
    setDismissed((d) => [...d, ...ids]);
    setOpen(false);
    setPlaying(null);
  };

  if (open) {
    return (
      <Modal title="🎥 Storm chasers live" wide onClose={dismiss}>
        {kidMode && <KidChaserTip />}
        {kidMode && stormyAlerts(alerts).some((a) => /warning/i.test(a.event)) && (
          <p className="chaser-safety">⚠️ There is a warning where you are. Make sure you are in your safe place first, then watch with a grown-up.</p>
        )}
        {playing && <ChaserPlayer stream={playing} kid={kidMode} onClose={() => setPlaying(null)} />}
        <StreamList streams={streams} onPlay={setPlaying} />
        <p className="hint">
          <button className="link" onClick={() => { onMode('off'); dismiss(); }}>Turn off these pop-ups</button>
          {' '}(you can turn them back on in Learn, Storm Center).
        </p>
      </Modal>
    );
  }
  if (!fresh.length) return null;
  const n = fresh.length;
  return (
    <aside className="chaser-toast card" role="status" aria-live="polite">
      <span className="live-badge">LIVE</span>
      <div className="chaser-toast-text">
        <strong>{n === 1 ? `${fresh[0].channel} is chasing storms live!` : `${n} storm chasers are live!`}</strong>
        <span className="hint">{stormyAlerts(alerts).length ? 'Severe weather is around. ' : ''}Watch the storms from your couch.</span>
      </div>
      <button onClick={() => { setOpen(true); setPlaying(fresh[0]); }}>Watch</button>
      <button className="ghost" onClick={dismiss} aria-label="Dismiss">✕</button>
    </aside>
  );
}
