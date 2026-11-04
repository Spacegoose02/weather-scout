import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';
import WindyView from './WindyView.jsx';
import { baseMap } from './basemap.js';
import { lightningLayer } from '../lightning/layer.js';
import { fromRows, mergeStrikes, newestTime, countText } from '../lightning/strikes.js';
import { AGE_STEPS, SOURCES, milesToKm } from '../../../shared/lightning.js';
import '../lightning/lightning.css';
import LayerPanel from './map/LayerPanel.jsx';
import { normalizeLayers, alertVisible, anyAlerts, layerCount } from './map/layers.js';
import { webcamIcon, webcamPopup, WEBCAM_MIN_ZOOM, WEBCAM_REFRESH_MS } from './map/webcams.js';
import NearbyWebcams from './map/NearbyWebcams.jsx';
import RadarGuide from './map/RadarGuide.jsx';
import { useHazardLayers } from './map/hazardLayers.js';
import { legendFor, productGroups, shortName } from './map/radarGuide.js';

window.L = L; // leaflet.markercluster is a classic plugin that extends the global L

const camIcon = L.divIcon({ className: 'cam-pin', html: '<span>📷</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
const ALERT_STYLE = { Extreme: '#b0003a', Severe: '#e2401c', Moderate: '#f0a202', Minor: '#e8c547' };
const CAMERA_MIN_ZOOM = 8;
const BUOY_MIN_ZOOM = 4;
const TIDE_MIN_ZOOM = 7;
const tideIcon = L.divIcon({ className: 'tide-pin', html: '<span>🌊</span>', iconSize: [22, 22], iconAnchor: [11, 11] });
const CAT_COLOR = ['#5ebaff', '#ffd23f', '#ff9f1c', '#f25c05', '#d62839', '#8f2d56'];
const stormIcon = (s) => L.divIcon({
  className: 'storm-pin',
  html: `<span style="--cat:${s.category ? CAT_COLOR[s.category] : CAT_COLOR[0]}">🌀</span><b>${s.category ? s.category : s.kind.startsWith('Tropical storm') ? 'TS' : 'TD'}</b>`,
  iconSize: [36, 36], iconAnchor: [18, 18],
});

const siteIcon = (s, selected) => L.divIcon({
  className: `site-pin ${selected ? 'sel' : ''} ${s.online === false ? 'off' : ''}`,
  html: `<span>${s.id}</span>`, iconSize: [46, 20], iconAnchor: [23, 10],
});
const dist2 = (a, b) => (a.lat - b.lat) ** 2 + ((a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) ** 2;

export default function WeatherMap({ center, alerts, units = 'imperial', layers: savedLayers, onLayers, signedIn = false, lightningMiles = 0 }) {
  const el = useRef(null);
  const card = useRef(null);
  const base = useRef(null);
  const siteLayer = useRef(null);
  const outlookLayer = useRef(null);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('composite');
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState(null);
  const [full, setFull] = useState(false);
  const [dark, setDark] = useState(false);
  const [outlookDay, setOutlookDay] = useState(0);
  const [outlook, setOutlook] = useState(null);
  const [national, setNational] = useState(null);
  const [panel, setPanel] = useState(false);
  const map = useRef(null);
  const radar = useRef([]);
  const radarMeta = useRef(null);
  const camLayer = useRef(null);
  const webcamLayer = useRef(null);
  const satLayer = useRef(null);
  const alertLayer = useRef(null);
  const stormLayer = useRef(null);
  const buoyLayer = useRef(null);
  const stormBounds = useRef(null);
  const [storms, setStorms] = useState(null);
  const [buoyInfo, setBuoyInfo] = useState('');
  const [frames, setFrames] = useState([]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [opacity, setOpacity] = useState(0.7);
  // Which layers are on comes from saved preferences (account or this device).
  const [guestLayers, setGuestLayers] = useState(() => normalizeLayers(savedLayers));
  const show = useMemo(() => (onLayers ? normalizeLayers(savedLayers) : guestLayers), [onLayers, savedLayers, guestLayers]);
  const setShow = (next) => (onLayers ? onLayers(normalizeLayers(next)) : setGuestLayers(normalizeLayers(next)));
  const showRef = useRef(show);
  showRef.current = show;
  const reload = useRef({});
  const tideLayer = useRef(null);
  const [tideInfo, setTideInfo] = useState('');
  const [feeds, setFeeds] = useState(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [boltInfo, setBoltInfo] = useState('');
  const [camInfo, setCamInfo] = useState('');
  // Windy webcams: { enabled, attribution } from the server; hidden without a key.
  const [webcams, setWebcams] = useState(null);
  const webcamsOn = useRef(false);
  webcamsOn.current = !!webcams?.enabled && show.webcams;
  const [webcamInfo, setWebcamInfo] = useState('');
  const [nearby, setNearby] = useState(false);
  const [windy, setWindy] = useState(null); // { lat, lon, zoom } while the Windy map is open

  // Map + radar setup
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lon], 8);
    map.current = m;
    base.current = baseMap('light').addTo(m);
    L.circleMarker([center.lat, center.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#2f6fde', fillOpacity: 1 }).addTo(m).bindTooltip('You are here');

    let cancelled = false;
    api('/api/radar').then((r) => {
      if (cancelled) return;
      radarMeta.current = r;
      if (r.satellite) {
        satLayer.current = L.tileLayer.wms(r.satellite.wms, {
          layers: r.satellite.layers, format: 'image/png', transparent: true, opacity: 0.65, zIndex: 5, attribution: r.satellite.attribution,
        });
      }
      setProducts(r.products || [{ id: 'composite', name: 'Radar', legend: 'dbz', frames: r.frames }]);
    });

    // Nationwide warning polygons, refreshed every 2 minutes.
    const loadNational = () => api('/api/alerts/national').then((n) => !cancelled && setNational(n)).catch(() => {});
    loadNational();
    const natTimer = setInterval(loadNational, 120_000);
    api('/api/radar/sites').then((r) => !cancelled && setSites(r.sites || [])).catch(() => {});
    api('/api/cameras/feeds').then((r) => !cancelled && setFeeds(r.feeds || [])).catch(() => !cancelled && setFeeds([]));
    api('/api/webcams/info').then((r) => !cancelled && setWebcams(r)).catch(() => !cancelled && setWebcams({ enabled: false }));

    import('leaflet.markercluster').then(() => {
      if (cancelled) return;
      camLayer.current = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false });
      m.addLayer(camLayer.current);
      loadCams();
      webcamLayer.current = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false, attribution: '<a href="https://www.windy.com/webcams" target="_blank" rel="noopener noreferrer">Webcams provided by Windy.com</a>', iconCreateFunction: (cl) => L.divIcon({ className: 'webcam-cluster', html: `<span>🌄 ${cl.getChildCount()}</span>`, iconSize: [46, 26] }) });
      loadWebcams();
    });

    // Windy webcams in view. Markers keep the newest copy of each webcam, because
    // Windy's picture links expire; the list reloads every few minutes while on.
    let webcamTimer;
    let webcamRefresh;
    const webcamMarkers = new Map();
    const loadWebcams = () => {
      clearTimeout(webcamTimer);
      clearTimeout(webcamRefresh);
      webcamTimer = setTimeout(async () => {
        const layer = webcamLayer.current;
        if (!layer) return;
        if (!webcamsOn.current) { m.removeLayer(layer); setWebcamInfo(''); return; }
        m.addLayer(layer);
        if (m.getZoom() < WEBCAM_MIN_ZOOM) {
          layer.clearLayers();
          webcamMarkers.clear();
          setWebcamInfo('Zoom in to see Windy webcams.');
          return;
        }
        const b = m.getBounds();
        try {
          const r = await api(`/api/webcams?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}`);
          if (cancelled || !webcamLayer.current) return;
          const keep = new Set(r.webcams.map((c) => c.id));
          for (const [id, entry] of webcamMarkers) {
            if (!keep.has(id) && !entry.marker.isPopupOpen()) {
              layer.removeLayer(entry.marker);
              webcamMarkers.delete(id);
            }
          }
          const added = [];
          for (const c of r.webcams) {
            const entry = webcamMarkers.get(c.id);
            if (entry) { entry.cam = c; continue; }
            const next = { cam: c };
            next.marker = L.marker([c.lat, c.lon], { icon: webcamIcon, title: c.title }).bindPopup(() => webcamPopup(() => next.cam), { maxWidth: 380, minWidth: 280 });
            webcamMarkers.set(c.id, next);
            added.push(next.marker);
          }
          layer.addLayers(added);
          if (r.zoomIn) setWebcamInfo('Zoom in to see Windy webcams.');
          else setWebcamInfo(r.total ? `${r.total} Windy webcam${r.total === 1 ? '' : 's'}${r.truncated ? ' (zoom in for more)' : ''}` : 'No Windy webcams in this view.');
        } catch (e) {
          setWebcamInfo(`Windy webcams unavailable: ${e.message}`);
        }
        webcamRefresh = setTimeout(loadWebcams, WEBCAM_REFRESH_MS);
      }, 350);
    };
    m.on('moveend', loadWebcams);
    reload.current.webcams = loadWebcams;

    let camTimer;
    const markers = new Map();
    const loadCams = () => {
      clearTimeout(camTimer);
      camTimer = setTimeout(async () => {
        if (!camLayer.current) return;
        if (!showRef.current.cams) { setCamInfo(''); return; }
        if (m.getZoom() < CAMERA_MIN_ZOOM) {
          camLayer.current.clearLayers();
          markers.clear();
          setCamInfo('Zoom in to see road cameras.');
          return;
        }
        const b = m.getBounds();
        try {
          const off = showRef.current.camsOff;
          const hide = off.length ? `&hide=${encodeURIComponent(off.join(','))}` : '';
          const r = await api(`/api/cameras?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}${hide}`);
          // Update markers in place so an open popup survives the map panning to fit it.
          const keep = new Set(r.cameras.map((c) => c.id));
          for (const [id, marker] of markers) {
            if (!keep.has(id) && !marker.isPopupOpen()) {
              camLayer.current.removeLayer(marker);
              markers.delete(id);
            }
          }
          const added = r.cameras.filter((c) => !markers.has(c.id)).map((c) => {
            const marker = L.marker([c.lat, c.lon], { icon: camIcon, title: c.name }).bindPopup(() => cameraPopup(c), { maxWidth: 380, minWidth: 280 });
            markers.set(c.id, marker);
            return marker;
          });
          camLayer.current.addLayers(added);
          if (!r.feeds.length) setCamInfo('No camera feeds are set up yet. An admin can add state 511 feeds in cameras.json.');
          else if (!r.total) setCamInfo(off.length ? 'No cameras in this view (some states are off in Layers).' : 'No cameras in this view.');
          else setCamInfo(`${r.total} camera${r.total === 1 ? '' : 's'} in view${r.truncated ? ' (zoom in for all)' : ''}.`);
        } catch (e) {
          setCamInfo(`Cameras unavailable: ${e.message}`);
        }
      }, 350);
    };
    m.on('moveend', loadCams);
    reload.current.cams = loadCams;

    // Ocean buoys (NOAA NDBC), loaded for the current view.
    buoyLayer.current = L.layerGroup().addTo(m);
    let buoyTimer;
    const loadBuoys = () => {
      clearTimeout(buoyTimer);
      buoyTimer = setTimeout(async () => {
        if (!buoyLayer.current) return;
        if (!showRef.current.buoys || m.getZoom() < BUOY_MIN_ZOOM) { buoyLayer.current.clearLayers(); setBuoyInfo(''); return; }
        const b = m.getBounds();
        try {
          const r = await api(`/api/buoys?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}&units=${units}`);
          if (cancelled || !buoyLayer.current) return;
          buoyLayer.current.clearLayers();
          for (const x of r.buoys) {
            L.marker([x.lat, x.lon], { icon: buoyIcon(x), title: `Buoy ${x.id}` })
              .bindPopup(() => buoyPopup(x, r.units), { maxWidth: 260 })
              .addTo(buoyLayer.current);
          }
          setBuoyInfo(r.total ? `${r.total} buoy${r.total === 1 ? '' : 's'}` : '');
        } catch {
          setBuoyInfo('Buoys unavailable');
        }
      }, 400);
    };
    m.on('moveend', loadBuoys);
    reload.current.buoys = loadBuoys;
    loadBuoys();

    // NOAA tide stations, loaded for the current view once you zoom in.
    tideLayer.current = L.layerGroup().addTo(m);
    let tideTimer;
    const loadTides = () => {
      clearTimeout(tideTimer);
      tideTimer = setTimeout(async () => {
        if (!tideLayer.current) return;
        if (!showRef.current.tides) { tideLayer.current.clearLayers(); setTideInfo(''); return; }
        if (m.getZoom() < TIDE_MIN_ZOOM) { tideLayer.current.clearLayers(); setTideInfo('Zoom in to see tide stations.'); return; }
        const b = m.getBounds();
        try {
          const r = await api(`/api/tides/stations?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}`);
          if (cancelled || !tideLayer.current) return;
          tideLayer.current.clearLayers();
          for (const x of r.stations) {
            L.marker([x.lat, x.lon], { icon: tideIcon, title: `${x.name} tides` })
              .bindPopup(() => tidePopup(x, units), { maxWidth: 260 })
              .addTo(tideLayer.current);
          }
          setTideInfo(r.total ? `${r.total} tide station${r.total === 1 ? '' : 's'}` : '');
        } catch {
          setTideInfo('Tide stations unavailable');
        }
      }, 400);
    };
    m.on('moveend', loadTides);
    reload.current.tides = loadTides;
    loadTides();

    // Active tropical storms (NHC): cone, forecast track and current position.
    api('/api/tropics').then((t) => {
      if (cancelled) return;
      setStorms(t.storms);
      const g = L.layerGroup();
      const shapes = L.geoJSON(t.features, {
        style: (f) => (f.properties.kind === 'cone'
          ? { color: '#f25c05', weight: 1.5, fillColor: '#ffffff', fillOpacity: 0.35, dashArray: '4 3' }
          : { color: '#1d2433', weight: 2 }),
        filter: (f) => f.geometry.type !== 'Point' || f.properties.kind === 'track',
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: '#1d2433', weight: 1, fillColor: '#fff', fillOpacity: 1 }),
        onEachFeature: (f, layer) => f.properties.name && f.geometry.type === 'Point' && layer.bindTooltip(f.properties.name),
      }).addTo(g);
      const bounds = t.features.features.length ? shapes.getBounds() : L.latLngBounds([]);
      for (const s of t.storms) bounds.extend([s.lat, s.lon]);
      stormBounds.current = bounds.isValid() ? bounds : null;
      for (const s of t.storms) L.marker([s.lat, s.lon], { icon: stormIcon(s), title: s.name, zIndexOffset: 1000 }).bindPopup(() => stormPopup(s)).addTo(g);
      stormLayer.current = g;
      g.addTo(m);
    }).catch(() => setStorms([]));

    return () => {
      cancelled = true;
      clearTimeout(camTimer);
      clearTimeout(webcamTimer);
      clearTimeout(webcamRefresh);
      clearTimeout(buoyTimer);
      clearTimeout(tideTimer);
      clearInterval(natTimer);
      reload.current = {};
      tideLayer.current = null;
      m.remove();
      siteLayer.current = null;
      outlookLayer.current = null;
      stormLayer.current = null;
      buoyLayer.current = null;
      radar.current = [];
      satLayer.current = null;
      camLayer.current = null;
      webcamLayer.current = null;
    };
  }, [center.lat, center.lon, units]);

  const product = products.find((p) => p.id === productId) || products[0];

  // Build the tile layers for the chosen product (one per animation frame).
  useEffect(() => {
    const m = map.current;
    if (!m || !product) return undefined;
    if (product.site && !site) return undefined;
    const list = product.site ? [{ time: null, url: product.template.replace('{site}', site.id) }] : product.frames;
    const meta = radarMeta.current || {};
    radar.current.forEach((l) => l.remove());
    radar.current = list.map((f, i) => L.tileLayer(f.url, { opacity: 0, maxNativeZoom: meta.maxNativeZoom || 12, maxZoom: 18, zIndex: 10, attribution: i === 0 ? meta.attribution : '' }).addTo(m));
    setFrames(list);
    setFrame(product.future ? 0 : list.length - 1);
    return undefined;
  }, [product, site]);

  // Radar animation
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), product?.future ? 1000 : 600);
    return () => clearInterval(id);
  }, [playing, frames.length, product?.future]);

  // Default radar site: the closest one that is reporting.
  useEffect(() => {
    if (site || !sites.length) return;
    const ok = sites.filter((x) => x.online !== false);
    setSite((ok.length ? ok : sites).reduce((best, x) => (dist2(x, center) < dist2(best, center) ? x : best)));
  }, [sites, site, center]);

  // Radar site pins, only in single-site mode.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    siteLayer.current?.remove();
    siteLayer.current = null;
    if (!product?.site || !sites.length || !show.radarSites) return;
    const g = L.layerGroup();
    for (const x of sites) {
      L.marker([x.lat, x.lon], { icon: siteIcon(x, x.id === site?.id), title: `${x.name} radar`, zIndexOffset: x.id === site?.id ? 900 : 0 })
        .on('click', () => setSite(x))
        .bindTooltip(`${x.name}${x.online === false ? ' (not reporting)' : ''}`)
        .addTo(g);
    }
    siteLayer.current = g.addTo(m);
  }, [product?.site, sites, site, show.radarSites]);

  // Base map
  useEffect(() => {
    const m = map.current;
    if (!m || !base.current) return;
    base.current.remove();
    base.current = baseMap(dark ? 'dark' : 'light').addTo(m);
    base.current.bringToBack();
  }, [dark]);

  // SPC outlook
  useEffect(() => {
    let off = false;
    if (!outlookDay) { setOutlook(null); return undefined; }
    api(`/api/outlook?day=${outlookDay}`).then((o) => !off && setOutlook(o)).catch(() => !off && setOutlook({ features: [], failed: true }));
    return () => { off = true; };
  }, [outlookDay]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    outlookLayer.current?.remove();
    outlookLayer.current = null;
    if (!outlook?.features?.length) return;
    outlookLayer.current = L.geoJSON(outlook, {
      style: (f) => ({ color: f.properties.stroke, weight: 2, fillColor: f.properties.fill, fillOpacity: 0.3 }),
      onEachFeature: (f, layer) => layer.bindPopup(() => outlookPopup(f.properties, outlook.day)),
    }).addTo(m);
    outlookLayer.current.bringToBack();
  }, [outlook]);

  // Full screen: the browser's own full screen when allowed, otherwise fill the window.
  useEffect(() => {
    const m = map.current;
    const node = card.current;
    if (full && node?.requestFullscreen && !document.fullscreenElement) node.requestFullscreen().catch(() => {});
    if (!full && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (full) setDark(true);
    document.body.classList.toggle('radar-full-open', full);
    const t = setTimeout(() => m?.invalidateSize(), 120);
    const onKey = (e) => e.key === 'Escape' && setFull(false);
    const onChange = () => { if (!document.fullscreenElement) setFull(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [full]);
  useEffect(() => () => document.body.classList.remove('radar-full-open'), []);

  useEffect(() => {
    radar.current.forEach((layer, i) => layer.setOpacity(show.radar && i === frame ? opacity : 0));
  }, [frame, opacity, show.radar, frames.length]);

  useEffect(() => {
    const m = map.current;
    if (!m || !satLayer.current) return;
    if (show.satellite) m.addLayer(satLayer.current);
    else m.removeLayer(satLayer.current);
  }, [show.satellite, frames.length]);

  useEffect(() => {
    const m = map.current;
    if (!m || !camLayer.current) return;
    if (show.cams) m.addLayer(camLayer.current);
    else m.removeLayer(camLayer.current);
  }, [show.cams]);

  // Storm reports, wildfires and river gauges (their own layer groups, after the map exists).
  const hazardInfo = useHazardLayers(map, show, [center.lat, center.lon, units]);

  // Reload cameras when the layer or a state is switched; buoys and tides when switched on.
  const camsOffKey = show.camsOff.join(',');
  useEffect(() => { reload.current.cams?.(); }, [show.cams, camsOffKey]);
  useEffect(() => { reload.current.buoys?.(); }, [show.buoys]);
  useEffect(() => { reload.current.webcams?.(); }, [show.webcams, webcams?.enabled]);
  useEffect(() => { reload.current.tides?.(); }, [show.tides]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [on, layer] of [[show.storms, stormLayer.current], [show.buoys, buoyLayer.current], [show.tides, tideLayer.current]]) {
      if (!layer) continue;
      if (on) m.addLayer(layer);
      else m.removeLayer(layer);
    }
  }, [show.storms, show.buoys, show.tides, storms]);

  // Live lightning: strikes in view, refreshed every 30 s and re-faded every 15 s.
  useEffect(() => {
    const m = map.current;
    if (!m || !show.lightning) { setBoltInfo(''); return undefined; }
    const layer = lightningLayer().addTo(m);
    let strikes = [];
    let off = false;
    let attribution = '';
    let ring = null;
    if (lightningMiles > 0) {
      ring = L.circle([center.lat, center.lon], { radius: lightningMiles * 1609.344, color: '#ffd23f', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(m);
    }
    const load = async (fresh) => {
      const b = m.getBounds().pad(0.1);
      const since = fresh ? 0 : newestTime(strikes);
      try {
        const r = await api(`/api/lightning?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}${since ? `&since=${since}` : ''}`);
        if (off) return;
        const now = r.now || Date.now();
        strikes = mergeStrikes(fresh ? [] : strikes, fromRows(r.strikes), now);
        layer.setStrikes(strikes, now);
        const text = r.sources.map((x) => SOURCES[x.id]?.attribution).filter(Boolean).join(' · ');
        if (text !== attribution) {
          if (attribution) m.attributionControl?.removeAttribution(attribution);
          attribution = text;
          if (text) m.attributionControl?.addAttribution(text);
        }
        const down = r.sources.length && r.sources.every((x) => !x.ok && x.error);
        setBoltInfo(down ? 'Lightning data is catching up…' : countText(strikes, now));
      } catch (e) {
        if (!off) setBoltInfo(e.status === 404 ? '' : 'Lightning unavailable');
      }
    };
    load(true);
    const poll = setInterval(() => load(false), 30_000);
    const fade = setInterval(() => layer.restyle(Date.now()), 15_000);
    let moveTimer;
    const onMove = () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => load(true), 500); };
    m.on('moveend', onMove);
    return () => {
      off = true;
      clearInterval(poll);
      clearInterval(fade);
      clearTimeout(moveTimer);
      m.off('moveend', onMove);
      if (attribution) m.attributionControl?.removeAttribution(attribution);
      layer.remove();
      ring?.remove();
    };
  }, [show.lightning, center.lat, center.lon, units, lightningMiles]);

  // Alert polygons
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    alertLayer.current?.remove();
    alertLayer.current = null;
    if (!anyAlerts(show)) return;
    if (national?.features?.length) {
      alertLayer.current = L.geoJSON(national, {
        filter: (f) => alertVisible(show, f.properties.event),
        style: (f) => ({ color: f.properties.color, weight: f.properties.rank >= 70 ? 2.5 : 1.5, fillColor: f.properties.color, fillOpacity: f.properties.rank >= 70 ? 0.18 : 0.08 }),
        onEachFeature: (f, layer) => layer.bindPopup(() => alertPopup(f.properties), { maxWidth: 300 }),
      }).addTo(m);
      return;
    }
    const features = alerts.filter((a) => a.geometry && alertVisible(show, a.event)).map((a) => ({ type: 'Feature', geometry: a.geometry, properties: a }));
    if (!features.length) return;
    alertLayer.current = L.geoJSON(features, {
      style: (f) => ({ color: ALERT_STYLE[f.properties.severity] || '#e8c547', weight: 2, fillOpacity: 0.15 }),
      onEachFeature: (f, layer) => layer.bindTooltip(f.properties.event),
    }).addTo(m);
  }, [alerts, show.warnings, show.watches, show.advisories, national]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = frames[frame]?.time;
  const timeText = !frames.length ? '…'
    : product?.site ? `${site?.name || ''} radar${site?.latest ? `, ${new Date(site.latest).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
      : !t ? 'Latest'
        : product?.future ? `${frames[frame].lead ? `+${frames[frame].lead} h · ` : 'Now · '}${new Date(t).toLocaleTimeString([], { hour: 'numeric' })}`
          : `${new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${frame === frames.length - 1 ? ' (latest)' : ''}`;
  const warnings = (national?.features || []).filter((f) => f.properties.rank >= 70).slice().reverse();
  const legend = legendFor(product);
  const siteProducts = products.filter((p) => p.site);
  const openWindy = () => {
    const c = map.current?.getCenter();
    setWindy(c ? { lat: c.lat, lon: c.lng, zoom: Math.min(map.current.getZoom(), 9) } : { lat: center.lat, lon: center.lon, zoom: 7 });
  };
  const zoomTo = (f) => {
    const b = L.geoJSON(f).getBounds();
    if (b.isValid()) map.current?.flyToBounds(b.pad(0.4), { maxZoom: 9 });
    setPanel(false);
  };

  return (
    <section className={`card map-card ${full ? 'full' : ''}`} ref={card}>
      {full && (
        <div className="radar-bar" role="toolbar" aria-label="Radar products">
          <span className="radar-brand">🦝 Weather Scout radar</span>
          {products.filter((p) => !p.site).map((p) => (
            <button key={p.id} className={p.id === productId ? 'on' : ''} aria-pressed={p.id === productId} onClick={() => setProductId(p.id)} title={p.note}>{p.name}</button>
          ))}
          {siteProducts.length > 0 && (
            <label className={`radar-select ${product?.site ? 'on' : ''}`} title="One radar up close: reflectivity, velocity and dual-pol products">📡 One radar{' '}
              <select value={product?.site ? productId : ''} onChange={(e) => setProductId(e.target.value)}>
                {!product?.site && <option value="" disabled>Pick…</option>}
                {siteProducts.map((p) => <option key={p.id} value={p.id}>{shortName(p)}</option>)}
              </select>
            </label>
          )}
          <button className={show.satellite ? 'on' : ''} aria-pressed={show.satellite} onClick={() => setShow({ ...show, satellite: !show.satellite })}>Satellite</button>
          <button className={show.lightning ? 'on' : ''} aria-pressed={show.lightning} onClick={() => setShow({ ...show, lightning: !show.lightning })}>⚡ Lightning</button>
          <label className="radar-select">Outlook{' '}
            <select value={outlookDay} onChange={(e) => setOutlookDay(Number(e.target.value))}>
              <option value={0}>Off</option><option value={1}>Day 1</option><option value={2}>Day 2</option><option value={3}>Day 3</option>
            </select>
          </label>
          <button onClick={() => setDark(!dark)} aria-pressed={dark}>{dark ? '🌙 Dark' : '☀️ Light'} map</button>
          <button onClick={openWindy} title="Animated wind, gusts and forecast models">🌬️ Windy</button>
          <button className="radar-exit" onClick={() => setFull(false)} aria-label="Exit full screen">✕</button>
        </div>
      )}
      {full && show.warnings && national && (
        <div className="warn-badge-wrap">
          <button className="warn-badge" onClick={() => setPanel(!panel)} aria-expanded={panel}>⚠️ <b>{national.counts?.warning || 0}</b> warnings</button>
          {panel && (
            <div className="warn-panel" role="dialog" aria-label="Active warnings">
              <div className="warn-head"><strong>Active warnings</strong><span>{national.counts?.watch || 0} watches · {national.counts?.advisory || 0} advisories</span></div>
              {!warnings.length && <p className="hint">No warnings right now.</p>}
              <ul>
                {warnings.slice(0, 60).map((f) => (
                  <li key={f.properties.id}><button onClick={() => zoomTo(f)}><i style={{ background: f.properties.color }} /> <b>{f.properties.event}</b><span>{f.properties.area}</span></button></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="map-controls">
        {frames.length > 1 && (
          <>
            <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause radar' : 'Play radar'}>{playing ? '❚❚' : '▶'}</button>
            <input
              type="range" min={0} max={Math.max(0, frames.length - 1)} value={frame}
              onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} aria-label="Radar time"
            />
          </>
        )}
        <span className="radar-time">{timeText}</span>
        <div className="layer-anchor">
          <button className={`layers-btn ${layersOpen ? 'on' : ''}`} onClick={() => setLayersOpen(!layersOpen)} aria-expanded={layersOpen} aria-haspopup="dialog">
            🗂️ Layers <span className="layer-count">{layerCount(show, { webcams: !!webcams?.enabled })}</span>
          </button>
          {layersOpen && <LayerPanel layers={show} feeds={feeds} webcams={webcams?.enabled ? webcams.attribution : null} signedIn={signedIn} onChange={setShow} onClose={() => setLayersOpen(false)} />}
        </div>
        {!full && products.length > 1 && (
          <label className="radar-select">Show{' '}
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {productGroups(products).map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <label className="opacity">Opacity <input type="range" min={0.2} max={1} step={0.1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
        {webcams?.enabled && <button className="webcams-btn" onClick={() => setNearby(true)} title="Live pictures from Windy webcams near you">🌄 Webcams near me</button>}
        {!full && <button className="windy-btn" onClick={openWindy} title="Animated wind, gusts and forecast models">🌬️ Windy wind map</button>}
        {!full && <button className="full-btn" onClick={() => setFull(true)} aria-label="Full screen radar">⛶ Full screen</button>}
        {full && (
          <div className="radar-legend" aria-label={`${legend.label} color scale`}>
            <span className="lg-label">{legend.label}</span>
            <span className="lg-bar" style={{ background: `linear-gradient(90deg, ${legend.stops.join(', ')})` }} />
            <span className="lg-ends">{legend.ends.map((e, i) => <span key={i}>{e}</span>)}</span>
          </div>
        )}
        {full && show.lightning && <LightningLegend miles={lightningMiles} units={units} />}
        {full && product?.note && <span className="radar-note">{product.note}{outlook?.features && outlookDay ? ` · SPC Day ${outlookDay} outlook: ${outlook.features.length ? [...new Set(outlook.features.map((f) => f.properties.name))].join(', ') : 'no severe risk'}` : ''}</span>}
      </div>
      <div ref={el} className="map" role="application" aria-label="Radar and camera map" />
      <RadarGuide product={product} legend={legend} full={full} site={site} onPick={setProductId} products={products} />
      <div className="map-foot">
        <span className="legend" aria-label="Radar colors from light to heavy" hidden={product && product.legend !== 'dbz'}><i /> light <i /> moderate <i /> heavy <i /> intense</span>
        <span>
          {storms && (storms.length
            ? <button className="link" onClick={() => stormBounds.current && map.current?.flyToBounds(stormBounds.current.pad(0.1), { maxZoom: 6 })}>🌀 {storms.length} active storm{storms.length === 1 ? '' : 's'}</button>
            : 'No active tropical storms.')}
          {show.lightning && boltInfo && ` · ${boltInfo}`}
          {show.buoys && buoyInfo && ` · ${buoyInfo}`}
          {show.tides && tideInfo && ` · ${tideInfo}`}
          {hazardInfo && ` · ${hazardInfo}`}
          {show.cams && camInfo && ` · ${camInfo}`}
          {webcamsOn.current && webcamInfo && ` · ${webcamInfo}`}
        </span>
        {webcamsOn.current && webcams.attribution && (
          <a className="webcam-attrib" href={webcams.attribution.url} target="_blank" rel="noopener noreferrer">{webcams.attribution.text}</a>
        )}
      </div>
      {nearby && <NearbyWebcams center={center} units={units} attribution={webcams?.attribution} onClose={() => setNearby(false)} />}
      {windy && <WindyView center={windy} units={units} onClose={() => setWindy(null)} />}
    </section>
  );
}

// Strike colors by age, plus the alert circle when one is set.
function LightningLegend({ miles, units }) {
  return (
    <div className="bolt-legend" aria-label="Lightning colors by age">
      <span className="lg-label">⚡ Lightning</span>
      {AGE_STEPS.map((s) => <span key={s.min} className="bolt-chip"><i style={{ background: s.color, borderColor: s.ring }} />{s.label}</span>)}
      {miles > 0 && <span className="bolt-chip"><i className="ring" />{units === 'metric' ? `${Math.round(milesToKm(miles))} km` : `${miles} mi`} alert</span>}
    </div>
  );
}

function cameraPopup(c) {
  const div = document.createElement('div');
  div.className = 'cam-popup';
  const title = document.createElement('strong');
  title.textContent = c.name;
  const meta = document.createElement('div');
  meta.className = 'cam-meta';
  meta.textContent = [c.road, c.direction, c.feedName].filter(Boolean).join(' · ');
  const stage = document.createElement('div');
  stage.className = 'cam-stage';
  const actions = document.createElement('div');
  actions.className = 'cam-actions';
  div.append(title, meta, stage, actions);

  const button = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = onClick;
    actions.append(b);
    return b;
  };
  const showMessage = (text) => stage.replaceChildren(Object.assign(document.createElement('p'), { textContent: text }));

  if (c.imageUrl) {
    const img = document.createElement('img');
    img.alt = `Camera view: ${c.name}`;
    const refresh = () => {
      stage.replaceChildren(img);
      img.src = `${c.imageUrl}?t=${Date.now()}`;
    };
    img.onerror = () => showMessage('This camera is not sending pictures right now.');
    refresh();
    button('🔄 Refresh', refresh);
    // Stills-only cameras (Kentucky, for example) refresh themselves while the popup is open.
    if (!c.video && !c.embed) {
      const note = Object.assign(document.createElement('span'), { className: 'cam-auto', textContent: '● Updates every 30 s' });
      actions.append(note);
      const timer = setInterval(() => {
        if (!div.isConnected) return clearInterval(timer);
        if (stage.contains(img)) img.src = `${c.imageUrl}?t=${Date.now()}`;
      }, 30_000);
    }
  }

  if (c.video) {
    const startVideo = () => playHls(c, stage, showMessage);
    // No still picture (Delaware): start the live video right inside the popup.
    if (!c.imageUrl) startVideo();
    button(c.imageUrl ? '▶ Live video' : '🔄 Reload', startVideo);
  }
  else if (c.embed) {
    // No still picture (Maryland): start the live player right inside the popup.
    const startLive = () => {
      const frame = Object.assign(document.createElement('iframe'), { src: c.embed, title: `Live camera: ${c.name}`, allowFullscreen: true });
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('allow', 'autoplay; fullscreen');
      stage.replaceChildren(frame);
    };
    if (!c.imageUrl) startLive();
    button(c.imageUrl ? '▶ Watch live' : '🔄 Reload', startLive);
    actions.append(Object.assign(document.createElement('a'), { href: c.embed, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open in new tab' }));
  }
  return div;
}

async function playHls(c, stage, showMessage) {
  const video = Object.assign(document.createElement('video'), { muted: true, autoplay: true, controls: true, playsInline: true });
  stage.replaceChildren(video);
  const fail = () => showMessage('Live video is not available for this camera right now.');
  video.onerror = fail;
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = c.video; // Safari / iOS play HLS natively
    return;
  }
  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) return fail();
  const hls = new Hls({ maxBufferLength: 10 });
  hls.on(Hls.Events.ERROR, (_, data) => data.fatal && (hls.destroy(), fail()));
  hls.loadSource(c.video);
  hls.attachMedia(video);
  // Stop streaming when the popup closes and the element leaves the page.
  const watch = new MutationObserver(() => {
    if (!video.isConnected) {
      hls.destroy();
      watch.disconnect();
    }
  });
  watch.observe(document.body, { childList: true, subtree: true });
}

function buoyIcon(b) {
  const label = b.waveHeight != null ? `${Math.round(b.waveHeight)}` : '';
  return L.divIcon({ className: 'buoy-pin', html: `<span>${label}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] });
}

const el = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text ?? '', ...(className ? { className } : {}) });

function buoyPopup(b, units) {
  const imp = units !== 'metric';
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `NOAA buoy ${b.id}`));
  const rows = [
    ['🌊 Waves', b.waveHeight != null ? `${b.waveHeight} ${imp ? 'ft' : 'm'}${b.wavePeriod ? ` every ${b.wavePeriod} s` : ''}` : null],
    ['🌡️ Water', b.waterTemp != null ? `${Math.round(b.waterTemp)}°` : null],
    ['🌬️ Wind', b.wind != null ? `${b.wind}${b.gust ? `, gusts ${b.gust}` : ''} ${imp ? 'mph' : 'km/h'}` : null],
    ['☁️ Air', b.airTemp != null ? `${Math.round(b.airTemp)}°` : null],
  ].filter(([, v]) => v);
  for (const [k, v] of rows) { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); }
  if (b.time) div.append(el('div', `Reported ${new Date(b.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, 'cam-meta'));
  const a = el('a', 'Station page');
  a.href = `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(b.id)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  div.append(a);
  return div;
}

function tidePopup(s, units) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `🌊 ${s.name}${s.state ? `, ${s.state}` : ''}`));
  const body = el('p', 'Loading tides…', 'storm-kid');
  const a = el('a', 'NOAA tide station');
  a.href = `https://tidesandcurrents.noaa.gov/stationhome.html?id=${encodeURIComponent(s.id)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  div.append(body, a);
  api(`/api/tides?lat=${s.lat}&lon=${s.lon}&units=${units}`).then((t) => {
    if (!t.next?.length) { body.textContent = 'No tide times right now.'; return; }
    body.textContent = t.state ? `The tide is ${t.state}.` : '';
    for (const e of t.next.slice(0, 3)) {
      const r = el('div', '', 'buoy-row');
      const when = new Date(e.time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      r.append(el('span', e.type === 'high' ? '⬆️ High' : '⬇️ Low'), el('b', `${when} · ${e.height} ${t.unit}`));
      div.insertBefore(r, a);
    }
  }).catch(() => { body.textContent = 'Tide times are unavailable right now.'; });
  return div;
}

function stormPopup(s) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `${s.kind} ${s.name}`));
  if (s.category) div.append(el('div', `Category ${s.category}`, 'cam-meta'));
  const rows = [
    ['🌬️ Winds', s.windMph != null ? `${s.windMph} mph` : null],
    ['🧭 Moving', s.movement ? `${s.movement.dir} at ${s.movement.mph} mph` : null],
    ['📉 Pressure', s.pressure ? `${s.pressure} mb` : null],
  ].filter(([, v]) => v);
  for (const [k, v] of rows) { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); }
  div.append(el('p', s.kid, 'storm-kid'));
  if (s.advisoryUrl) {
    const a = el('a', 'Latest NHC advisory');
    a.href = s.advisoryUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    div.append(a);
  }
  return div;
}

function alertPopup(p) {
  const div = el('div', '', 'buoy-popup');
  const h = el('strong', p.event);
  h.style.borderLeft = `6px solid ${p.color}`;
  h.style.paddingLeft = '6px';
  div.append(h);
  if (p.area) div.append(el('div', p.area, 'cam-meta'));
  if (p.ends) div.append(el('div', `Until ${new Date(p.ends).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`, 'cam-meta'));
  if (p.headline) div.append(el('p', p.headline, 'storm-kid'));
  if (p.kid) div.append(el('p', `🦝 ${p.kid}`, 'storm-kid'));
  return div;
}

function outlookPopup(p, day) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `Day ${day} severe outlook: ${p.name}`));
  div.append(el('p', p.meaning, 'storm-kid'));
  div.append(el('div', 'From the NOAA Storm Prediction Center', 'cam-meta'));
  return div;
}
