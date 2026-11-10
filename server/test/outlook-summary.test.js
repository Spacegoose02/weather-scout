import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outlookSummary, catLevel } from '../../shared/outlook.js';

const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const feat = (label, geometry) => ({ type: 'Feature', geometry, properties: { label } });
const outlook = {
  features: [
    feat('TSTM', box(-110, 28, -80, 45)),
    feat('MRGL', box(-104, 30, -88, 42)),
    feat('ENH', box(-99.5, 34.5, -95.5, 38.5)),
  ],
};

test('outlookSummary finds the top risk and the risk at a spot', () => {
  assert.deepEqual(outlookSummary(outlook, { lat: 35.5, lon: -97.5 }), { top: 'ENH', here: 'ENH' });
  assert.deepEqual(outlookSummary(outlook, { lat: 40, lon: -90 }), { top: 'ENH', here: 'MRGL' });
  assert.deepEqual(outlookSummary(outlook, { lat: 44, lon: -82 }), { top: 'ENH', here: 'TSTM' });
  assert.deepEqual(outlookSummary(outlook, { lat: 47, lon: -70 }), { top: 'ENH', here: 'NONE' });
  assert.deepEqual(outlookSummary(outlook, null), { top: 'ENH', here: null });
  assert.deepEqual(outlookSummary({ features: [] }, { lat: 35, lon: -97 }), { top: 'NONE', here: 'NONE' });
});

test('catLevel maps SPC categories to 0–5', () => {
  assert.equal(catLevel('TSTM'), 0);
  assert.equal(catLevel('SLGT'), 2);
  assert.equal(catLevel('HIGH'), 5);
  assert.equal(catLevel('NONE'), 0);
});
