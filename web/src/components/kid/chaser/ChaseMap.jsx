import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { baseMap } from '../../basemap.js';
import { CONUS, REPORT_COLOR, REPORT_NAME, inConus, timeLabel } from '../../../kid/chaser/live.js';

const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
const targetIcon = L.divIcon({ className: 'chase-target-pin', html: '<span>🎯</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
const homeIcon = L.divIcon({ className: 'chase-home-pin', html: '<span>🏠</span>', iconSize: [26, 26], iconAnchor: [13, 13] });

// A map of the lower 48 with the SPC outlook, storm reports, home and the kid's target.
export default function ChaseMap({ outlook, reports, target, home, onPick, height = 340, label = 'Storm map' }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, minZoom: 3, maxBounds: [[CONUS.south - 8, CONUS.west - 15], [CONUS.north + 8, CONUS.east + 15]] });
    m.fitBounds([[CONUS.south + 1, CONUS.west + 2], [CONUS.north - 1, CONUS.east - 1]]);
    baseMap(dark() ? 'dark' : 'light').addTo(m);
    m.on('click', (e) => {
      if (pick.current && inConus(e.latlng.lat, e.latlng.lng)) pick.current({ lat: e.latlng.lat, lon: e.latlng.lng });
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
    };
  }, []);

  const swap = (name, layer) => {
    layers.current[name]?.remove();
    layers.current[name] = layer ? layer.addTo(map.current) : null;
  };

  useEffect(() => {
    swap('outlook', outlook?.features?.length ? L.geoJSON(outlook, {
      interactive: false,
      style: (f) => ({ color: f.properties.stroke, weight: 1.5, fillColor: f.properties.fill, fillOpacity: 0.35 }),
    }) : null);
  }, [outlook]);

  useEffect(() => {
    if (!reports?.length) return swap('reports', null);
    const g = L.layerGroup();
    // Tornadoes last, so they sit on top.
    const order = { hail: 0, wind: 1, tornado: 2 };
    for (const r of [...reports].sort((a, b) => order[a.type] - order[b.type])) {
      L.circleMarker([r.lat, r.lon], { radius: r.type === 'tornado' ? 6 : 4, color: '#fff', weight: 1, fillColor: REPORT_COLOR[r.type], fillOpacity: 0.95 })
        .bindTooltip(`${REPORT_NAME[r.type]} · ${r.location}, ${r.state} · ${timeLabel(r.time)}`)
        .addTo(g);
    }
    swap('reports', g);
  }, [reports]);

  useEffect(() => {
    swap('home', home ? L.marker([home.lat, home.lon], { icon: homeIcon, interactive: false, keyboard: false }) : null);
  }, [home?.lat, home?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!target) return swap('target', null);
    const g = L.layerGroup([
      L.circle([target.lat, target.lon], { radius: 50 * 1609, color: '#5a3f8f', weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false }),
      L.marker([target.lat, target.lon], { icon: targetIcon, interactive: false, keyboard: false, zIndexOffset: 1000 }),
    ]);
    swap('target', g);
  }, [target?.lat, target?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={`chase-map${onPick ? ' pickable' : ''}`} style={{ height }} role="application" aria-label={label} />;
}
