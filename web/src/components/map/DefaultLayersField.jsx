import { LAYER_GROUPS, DEFAULT_LAYERS, LAYER_KEYS } from './layers.js';
import { parseLayerList, layerListText } from '../../../../shared/maplayers.js';

const CAMERA_LAYERS = { title: 'Cameras', layers: [{ id: 'cams', icon: '📷', label: 'Road cameras' }, { id: 'webcams', icon: '🌄', label: 'Windy webcams', note: 'Only when a Webcams key is set' }] };
const GROUPS = [...LAYER_GROUPS, CAMERA_LAYERS];
const builtInOn = LAYER_KEYS.filter((k) => DEFAULT_LAYERS[k]);

// App settings: tick the Radar & Cams layers everyone starts with. Saved as a
// list of layer ids; blank means the built-in choice.
export default function DefaultLayersField({ label, help, source, value, onChange }) {
  const parsed = parseLayerList(value);
  const on = new Set(parsed ?? builtInOn);
  const set = (ids) => onChange(layerListText(ids));
  const toggle = (id, checked) => set(checked ? [...on, id] : [...on].filter((x) => x !== id));

  return (
    <fieldset className="default-layers">
      <legend>{label} {source}</legend>
      {help && <small className="hint">{help}</small>}
      <div className="default-layer-groups">
        {GROUPS.map((g) => (
          <div key={g.title} className="default-layer-group" role="group" aria-label={g.title}>
            <b>{g.title}</b>
            {g.layers.map((l) => (
              <label key={l.id} className="layer-row" title={l.note || ''}>
                <input type="checkbox" checked={on.has(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} />
                <span aria-hidden>{l.icon}</span>
                <span>{l.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="ai-actions">
        <button type="button" className="link" disabled={parsed === null} onClick={() => onChange('')}>Use the built-in layers</button>
        <button type="button" className="link" disabled={on.size === LAYER_KEYS.length} onClick={() => set([...LAYER_KEYS])}>All on</button>
        <button type="button" className="link" disabled={on.size === 0} onClick={() => set([])}>All off</button>
      </div>
      {parsed === null && <small className="hint">Using the built-in layers.</small>}
    </fieldset>
  );
}
