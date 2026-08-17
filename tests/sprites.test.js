import test from 'node:test';
import assert from 'node:assert/strict';
import { findRuns, SPRITE_COUNT } from '../js/sprites.js';

// Build a column-occupancy array from [gap, run, gap, run...] widths.
function columns(...widths) {
  const out = [];
  widths.forEach((n, i) => { for (let j = 0; j < n; j++) out.push(i % 2 === 1); });
  return out;
}

test('seven vehicles separated by real gaps give seven runs', () => {
  const occ = columns(30, 60, 40, 80, 40, 100, 40, 100, 40, 120, 40, 110, 40, 140, 30);
  assert.equal(findRuns(occ).length, SPRITE_COUNT);
});

test('a hairline gap inside one vehicle does not split it', () => {
  // 50 on, 3 off, 50 on - one vehicle with a thin break (e.g. bike mirror)
  const occ = columns(20, 50, 3, 50, 20);
  const runs = findRuns(occ);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], { start: 20, end: 122 });
});

test('narrow noise blobs are dropped', () => {
  const occ = columns(20, 4, 30, 60, 20);       // 4px speck, then a vehicle
  const runs = findRuns(occ);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].start, 54);
});

test('empty sheet gives no runs', () => {
  assert.deepEqual(findRuns(new Array(200).fill(false)), []);
});

test('run bounds are inclusive and exact', () => {
  const occ = columns(10, 25, 10);
  assert.deepEqual(findRuns(occ), [{ start: 10, end: 34 }]);
});
