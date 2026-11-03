import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import Modal from '../Modal.jsx';
import SpeakButton from './SpeakButton.jsx';
import { stormPhotoSpeech, KIND_LABEL, STORM_GAZER_DAYS, countStormDay } from '../../kid/stormphoto.js';
import '../../kid/stormphoto.css';

export function useStormPhoto(date) {
  const [state, setState] = useState({ loading: true });
  const load = useCallback(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api(`/api/storm-photo${date ? `?date=${date}` : ''}`)
      .then((r) => live && setState({ ...r, loading: false }))
      .catch(() => live && setState({ loading: false, photo: null, archive: [], offline: true }));
    return () => { live = false; };
  }, [date]);
  useEffect(() => load(), [load]);
  return { ...state, reload: load };
}

export function Credit({ credit }) {
  if (!credit) return null;
  return (
    <p className="storm-credit">
      📸 {credit.artist}
      {' · '}
      {credit.licenseUrl ? <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.license}</a> : credit.license}
      {' · '}
      <a href={credit.pageUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
    </p>
  );
}

async function hidePhoto(photo, after) {
  if (!confirm(`Hide this picture for everyone?\n\n${photo.caption}\n\nYou can bring it back in Family & settings.`)) return;
  try {
    await api('/api/admin/storm-photos/hidden', { method: 'POST', body: { title: photo.title, hidden: true } });
    after?.();
  } catch (e) {
    alert(e.message);
  }
}

// The Kid Zone card (and, with `compact`, the dashboard card).
export default function StormPhoto({ date, kid, isAdmin, compact = false, size = 'm', onKids }) {
  const sp = useStormPhoto(date);
  const [gallery, setGallery] = useState(false);
  const [big, setBig] = useState(null);
  const photo = sp.photo;

  const heard = () => {
    if (!kid || !date) return;
    const days = countStormDay(kid.data.stormDays, date);
    if (days === kid.data.stormDays) return;
    kid.update(() => ({ stormDays: days }));
    if (days.length >= STORM_GAZER_DAYS) kid.earn('storm-gazer');
  };

  const title = photo ? `${KIND_LABEL[photo.kind] || '⛈️ Storm'} picture of the day` : '⛈️ Storm picture of the day';
  return (
    <section className={`card storm-photo ${compact ? 'compact' : ''} size-${size}`}>
      <div className="card-title">
        <h2>{title}</h2>
        {photo && sp.archive?.length > 0 && <button className="link" onClick={() => setGallery(true)}>Past pictures</button>}
      </div>
      {sp.loading && !photo && <div className="storm-img loading" aria-label="Loading the picture" />}
      {!sp.loading && !photo && (
        <p className="hint">Rocky's storm camera is taking a nap. {sp.offline ? 'We could not reach the picture library right now.' : 'There are no pictures to show yet.'} Check back soon!</p>
      )}
      {photo && (
        <>
          <button className="storm-img-btn" onClick={() => setBig(photo)} aria-label={`See it bigger: ${photo.caption}`}>
            <img className="storm-img" src={photo.imageUrl} alt={photo.description || photo.caption} loading="lazy" width={photo.width || undefined} height={photo.height || undefined} />
          </button>
          <p className="storm-caption">{photo.caption}</p>
          {!(compact && size === 's') && photo.fact && <p className="storm-fact">💡 {photo.fact}</p>}
          <div className="storm-actions">
            <SpeakButton text={() => stormPhotoSpeech(photo)} label="Hear Rocky" onSpeak={heard} />
            {compact && onKids && <button className="link" onClick={onKids}>More in the Kid Zone →</button>}
            {isAdmin && <button className="link storm-hide" onClick={() => hidePhoto(photo, sp.reload)}>Hide this picture</button>}
          </div>
          <Credit credit={photo.credit} />
        </>
      )}
      {gallery && <Gallery today={{ date: sp.date, photo }} archive={sp.archive} onClose={() => setGallery(false)} onPick={(p) => { setGallery(false); setBig(p); }} />}
      {big && <BigPhoto photo={big} isAdmin={isAdmin} onClose={() => setBig(null)} onHidden={() => { setBig(null); sp.reload(); }} onSpeak={big === photo ? heard : undefined} />}
    </section>
  );
}

const dayName = (d) => new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

function Gallery({ today, archive, onClose, onPick }) {
  const all = [today, ...archive].filter((a) => a.photo);
  return (
    <Modal title="Rocky's storm picture album" onClose={onClose} wide>
      <p className="hint">The last few weeks of storm pictures. Tap one to see it big and hear Rocky tell you about it.</p>
      <ul className="storm-gallery">
        {all.map(({ date, photo }, i) => (
          <li key={photo.key}>
            <button onClick={() => onPick(photo)}>
              <img src={photo.imageUrl} alt={photo.caption} loading="lazy" />
              <span>{i === 0 ? 'Today' : dayName(date)} · {KIND_LABEL[photo.kind] || '⛈️ Storm'}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function BigPhoto({ photo, isAdmin, onClose, onHidden, onSpeak }) {
  return (
    <Modal title={`${KIND_LABEL[photo.kind] || '⛈️ Storm'} picture`} onClose={onClose} wide>
      <img className="storm-big" src={photo.imageUrl} alt={photo.description || photo.caption} />
      <p className="storm-caption">{photo.caption}</p>
      {photo.fact && <p className="storm-fact">💡 {photo.fact}</p>}
      <p className="storm-rocky">🦝 {photo.rocky}</p>
      <div className="storm-actions">
        <SpeakButton text={() => stormPhotoSpeech(photo)} label="Hear Rocky" onSpeak={onSpeak} />
        {isAdmin && <button className="link storm-hide" onClick={() => hidePhoto(photo, onHidden)}>Hide this picture</button>}
      </div>
      <Credit credit={photo.credit} />
    </Modal>
  );
}
