// "Easier to see" settings: bigger text, a color-blind friendly radar and less
// motion. Saved with the rest of the preferences and applied as attributes on
// <html>, so plain CSS does the work (see styles.css, "Easier to see").
import { useEffect } from 'react';

export const TEXT_SIZES = [
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' },
  { id: 'xlarge', label: 'Extra large' },
];

export const DEFAULT_A11Y = { text: 'normal', cbRadar: false, lessMotion: false };

export function normalizeA11y(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  return {
    text: TEXT_SIZES.some((t) => t.id === s.text) ? s.text : 'normal',
    cbRadar: s.cbRadar === true,
    lessMotion: s.lessMotion === true,
  };
}

// Daltonization for red-green color blindness (deuteranopia, the most common
// kind): the red/green difference a color-blind eye loses is moved into
// brightness and blue, so radar's green, yellow and red bands stay apart.
// Rows are R, G, B, A for an SVG feColorMatrix.
export const CB_MATRIX = [
  1, 0, 0, 0, 0,
  -0.4375, 1.4375, 0, 0, 0,
  0.2625, -0.5625, 1.3, 0, 0,
  0, 0, 0, 1, 0,
].join(' ');

function ensureFilter() {
  if (typeof document === 'undefined' || document.getElementById('ws-cb-filters')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'ws-cb-filters';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const filter = document.createElementNS(ns, 'filter');
  filter.id = 'ws-cb';
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const m = document.createElementNS(ns, 'feColorMatrix');
  m.setAttribute('type', 'matrix');
  m.setAttribute('values', CB_MATRIX);
  filter.append(m);
  svg.append(filter);
  document.body.append(svg);
}

export function useA11y(saved) {
  const a = normalizeA11y(saved);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.text = a.text;
    if (a.cbRadar) { ensureFilter(); root.dataset.cbRadar = 'on'; } else delete root.dataset.cbRadar;
    if (a.lessMotion) root.dataset.motion = 'less'; else delete root.dataset.motion;
  }, [a.text, a.cbRadar, a.lessMotion]);
  return a;
}

// True when the family turned on Less motion or the device asks for reduced motion.
export function prefersLessMotion() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.motion === 'less' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
