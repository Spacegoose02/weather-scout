import { LAYER_GROUPS, DEFAULT_LAYERS, cameraFeedRows, toggleFeed, isDefault } from './layers.js';

// The "Layers" panel on the Radar & Cams map: switch each marker group or
// overlay on or off, and cameras state by state.
export default function LayerPanel({ layers, feeds, signedIn, onChange, onClose }) {
  const set = (patch) => onChange({ ...layers, ...patch });
  const rows = cameraFeedRows(feeds || [], layers.camsOff);
  const allOn = rows.every((r) => r.on);
  const noneOn = rows.every((r) => !r.on);

  return (
    <div className="layer-panel" role="dialog" aria-label="Map layers">
      <div className="layer-head">
        <strong>Map layers</strong>
        <span>
          <button className="link" onClick={() => onChange({ ...DEFAULT_LAYERS })} disabled={isDefault(layers)}>Reset</button>
          <button className="layer-close" onClick={onClose} aria-label="Close map layers">✕</button>
        </span>
      </div>
      {LAYER_GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend>{g.title}</legend>
          {g.layers.map((l) => (
            <label key={l.id} className="layer-row">
              <input type="checkbox" checked={!!layers[l.id]} onChange={(e) => set({ [l.id]: e.target.checked })} />
              <span aria-hidden>{l.icon}</span>
              <span>{l.label}{l.note && <small>{l.note}</small>}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <fieldset>
        <legend>Road cameras</legend>
        <label className="layer-row">
          <input type="checkbox" checked={layers.cams} onChange={(e) => set({ cams: e.target.checked })} />
          <span aria-hidden>📷</span>
          <span>Cameras<small>Zoom in to see them</small></span>
        </label>
        {rows.length > 1 && (
          <div className="layer-states" aria-label="Cameras by state" hidden={!layers.cams}>
            <div className="layer-all">
              <button className="link" disabled={allOn} onClick={() => set({ camsOff: [] })}>All states</button>
              <button className="link" disabled={noneOn} onClick={() => set({ camsOff: rows.map((r) => r.id) })}>None</button>
            </div>
            {rows.map((r) => (
              <label key={r.id} className="layer-state" title={`${r.name}${r.ok ? '' : ' (not loading right now)'}`}>
                <input type="checkbox" checked={r.on} onChange={(e) => set({ camsOff: toggleFeed(layers.camsOff, r.id, e.target.checked) })} />
                <b>{r.label}</b>
                <small>{r.ok ? r.count.toLocaleString() : 'offline'}</small>
              </label>
            ))}
          </div>
        )}
        {feeds && !rows.length && <p className="hint">No camera feeds are set up yet.</p>}
      </fieldset>
      <p className="layer-saved">{signedIn ? 'Saved to your account.' : 'Saved on this device. Sign in to keep it everywhere.'}</p>
    </div>
  );
}
