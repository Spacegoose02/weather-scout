import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import './stations.css';

// Family & settings: status of weather stations and Home Assistant. Everything is
// set in the container's environment (see docs/HOME-ASSISTANT.md), so this is read-only.
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'not yet');

export default function IntegrationsPanel() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/admin/integrations').then(setS).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="error-text">{error}</p>;
  if (!s) return null;
  const { mqtt, rest } = s.homeAssistant;
  const st = s.stations;
  const pushUrl = `${window.location.origin}/api/stations/push${st.tokenRequired ? '/YOUR_TOKEN' : ''}`;
  const errs = Object.entries(st.errors || {});
  return (
    <div className="integrations">
      <h3>Weather stations</h3>
      {st.stations.length ? (
        <ul className="feeds">
          {st.stations.map((x) => (
            <li key={x.id}>{x.stale ? '🟡' : '🟢'} {x.name} ({x.model}) <code>{x.id}</code> · updated {when(x.updatedAt)}</li>
          ))}
        </ul>
      ) : <p className="hint">No station has reported yet.</p>}
      <p className="hint">
        Ecowitt: in the WS View / Ecowitt app, Weather Services → Customized, protocol Ecowitt, path <code>/api/stations/push{st.tokenRequired ? '/YOUR_TOKEN' : ''}</code>.
        Ambient Weather: awnet → Customized, path <code>/api/stations/push{st.tokenRequired ? '/YOUR_TOKEN' : ''}?</code>.
        Other stations can use the Weather Underground protocol with <code>{pushUrl}</code>.
        {st.tokenRequired ? ' YOUR_TOKEN is STATION_PUSH_TOKEN.' : ' Without STATION_PUSH_TOKEN, only uploads straight from your home network are accepted.'}
      </p>
      <dl>
        <dt>Ambient cloud</dt><dd>{st.ambientCloud ? 'on' : 'off'}</dd>
        <dt>Tempest cloud</dt><dd>{st.tempestCloud ? 'on' : 'off'}</dd>
        <dt>Tempest on the LAN</dt><dd>{st.tempestUdp ? `listening on UDP ${st.tempestUdp}` : 'off'}</dd>
      </dl>
      {errs.length > 0 && <p className="error-text">{errs.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}

      <h3>Home Assistant</h3>
      <dl>
        <dt>MQTT</dt>
        <dd>{mqtt.enabled ? `${mqtt.connected ? '🟢 connected to' : '🔴 not connected to'} ${mqtt.url} · last sent ${when(mqtt.lastPublishAt)}${mqtt.lastError ? ` · ${mqtt.lastError}` : ''}` : 'off (set MQTT_URL)'}</dd>
        <dt>REST</dt>
        <dd>{rest.enabled ? `${rest.lastError ? '🔴' : '🟢'} ${rest.url} · last sent ${when(rest.lastPublishAt)}${rest.lastError ? ` · ${rest.lastError}` : ''}` : 'off (set HA_URL and HA_TOKEN)'}</dd>
      </dl>
    </div>
  );
}
