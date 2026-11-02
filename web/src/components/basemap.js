import L from 'leaflet';

// Base map tiles. Every source here is free and needs no key. If one stops
// answering (CARTO started asking for a key in late 2026, which broke the old
// dark map), the layer quietly moves on to the next source in the list.
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>';
const ARCGIS = 'https://server.arcgisonline.com/ArcGIS/rest/services';

export const BASEMAP_SOURCES = {
  light: [
    { name: 'osm', layers: [['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, maxNativeZoom: 19, attribution: OSM }]] },
    { name: 'esri-street', layers: [[`${ARCGIS}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 18, attribution: `${ESRI}, HERE, Garmin, ${OSM}` }]] },
  ],
  dark: [
    {
      name: 'esri-dark',
      layers: [
        [`${ARCGIS}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 18, maxNativeZoom: 16, attribution: `${ESRI}, HERE, Garmin, ${OSM}` }],
        // Town and road names sit on their own layer above the gray base.
        [`${ARCGIS}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 18, maxNativeZoom: 16, pane: 'basemapLabels' }],
      ],
    },
    // Last resort: the regular map, darkened in CSS (.basemap-dimmed).
    { name: 'osm-dimmed', layers: [['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: OSM, className: 'basemap-dimmed' }]] },
  ],
};

// How many tiles may fail before any have loaded, before we give up on a source.
const MAX_ERRORS = 4;

const BaseMap = L.Layer.extend({
  initialize(kind) {
    this._sources = BASEMAP_SOURCES[kind] || BASEMAP_SOURCES.light;
    this._index = 0;
    this._tiles = [];
  },

  onAdd(map) {
    // Labels go above the radar (zIndex 10 in the tile pane) but below markers.
    if (!map.getPane('basemapLabels')) {
      const pane = map.createPane('basemapLabels');
      pane.style.zIndex = 350;
      pane.style.pointerEvents = 'none';
    }
    this._use(this._index);
  },

  onRemove() {
    this._clear();
  },

  bringToBack() {
    this._tiles.forEach((t) => t.bringToBack());
    return this;
  },

  sourceName() {
    return this._sources[this._index]?.name;
  },

  _clear() {
    // Only drop our own listeners: Leaflet's attribution control hooks 'remove'.
    this._tiles.forEach((t) => t.off('tileload tileerror').remove());
    this._tiles = [];
  },

  _use(i) {
    this._clear();
    this._index = i;
    const src = this._sources[i];
    let loaded = 0;
    let errors = 0;
    this._tiles = src.layers.map(([url, opts]) => L.tileLayer(url, { zIndex: 0, ...opts }));
    const main = this._tiles[0];
    main.on('tileload', () => { loaded += 1; });
    main.on('tileerror', () => {
      errors += 1;
      if (!loaded && errors >= MAX_ERRORS && i + 1 < this._sources.length && this._map) this._use(i + 1);
    });
    this._tiles.forEach((t) => t.addTo(this._map));
    this._tiles.forEach((t) => t.bringToBack());
  },
});

export const baseMap = (kind) => new BaseMap(kind);
