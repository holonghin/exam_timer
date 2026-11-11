const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/seasonal');

test('all twelve months follow the four seasonal ranges', () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => S.seasonForMonth(i + 1)), [
    'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
    'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'
  ]);
});
test('the season changes at real Taiwan midnight, independently of the exam date', () => {
  const boundary = Date.parse('2027-03-01T00:00:00+08:00');
  assert.equal(S.seasonForMonth(S.monthAt(boundary - 1)), 'winter');
  assert.equal(S.seasonForMonth(S.monthAt(boundary)), 'spring');
});
test('mounted illustration avoids rewriting the SVG on every clock tick', () => {
  let writes = 0;
  const host = { dataset: {}, set innerHTML(value) { writes++; this.svg = value; } };
  const icon = S.mount(host);
  icon.update(Date.parse('2026-11-12T09:00:00+08:00'));
  icon.update(Date.parse('2026-11-12T09:00:01+08:00'));
  assert.equal(writes, 1); assert.equal(host.dataset.season, 'autumn');
  icon.update(Date.parse('2026-12-01T00:00:00+08:00'));
  assert.equal(writes, 2); assert.equal(host.dataset.season, 'winter');
});
