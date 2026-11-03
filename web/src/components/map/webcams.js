// Windy webcams on the Radar & Cams map: pins, popups and the credit Windy asks for.
// Pictures load straight from Windy (their links expire after a few minutes),
// so popups read the newest list each time they open.
import L from 'leaflet';

export const webcamIcon = L.divIcon({ className: 'cam-pin webcam-pin', html: '<span>🌄</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
export const WEBCAM_MIN_ZOOM = 7;
// Windy's free-plan picture links last 10 minutes; reload the list before that.
export const WEBCAM_REFRESH_MS = 4 * 60_000;

const el = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text ?? '', ...(className ? { className } : {}) });
const link = (href, text, className) => Object.assign(el('a', text, className), { href, target: '_blank', rel: 'noopener noreferrer' });

export function updatedText(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 2) return 'Updated just now';
  if (min < 60) return `Updated ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `Updated ${h} hour${h === 1 ? '' : 's'} ago`;
  return `Updated ${new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

// The credit line Windy asks for, linked back to the webcam's page on windy.com.
export function windyCredit(c) {
  const p = el('div', '', 'webcam-credit');
  p.append('Webcam by ', link('https://www.windy.com/webcams', 'Windy.com'), ' · ', link(c.link, 'See it on Windy'));
  return p;
}

// Popup for one webcam. getCam() returns the newest copy, so picture links are fresh.
export function webcamPopup(getCam) {
  const c = getCam();
  const div = el('div', '', 'cam-popup webcam-popup');
  div.append(el('strong', c.title));
  const meta = [c.place, updatedText(c.updated)].filter(Boolean).join(' · ');
  if (meta) div.append(el('div', meta, 'cam-meta'));
  const stage = el('div', '', 'cam-stage');
  const actions = el('div', '', 'cam-actions');
  div.append(stage, actions, windyCredit(c));

  const message = (text) => stage.replaceChildren(el('p', text));
  const showPicture = () => {
    const cam = getCam();
    if (!cam.preview) return message('No picture from this webcam right now.');
    const img = Object.assign(document.createElement('img'), { alt: `Webcam view: ${cam.title}`, src: cam.preview, referrerPolicy: 'no-referrer' });
    img.onerror = () => message('This picture has expired. Close and reopen the pin for a fresh one.');
    stage.replaceChildren(link(cam.link, ''));
    stage.firstChild.append(img);
  };
  showPicture();
  if (c.player) {
    const button = el('button', '▶ Today’s timelapse');
    button.type = 'button';
    button.onclick = () => {
      const frame = Object.assign(document.createElement('iframe'), { src: getCam().player, title: `Timelapse: ${c.title}`, allowFullscreen: true });
      frame.setAttribute('referrerpolicy', 'origin');
      frame.setAttribute('allow', 'autoplay; fullscreen');
      stage.replaceChildren(frame);
    };
    actions.append(button);
  }
  if (!c.active) actions.append(el('span', 'This webcam may be offline.', 'cam-auto'));
  return div;
}
