import test from 'node:test';
import assert from 'node:assert/strict';
import { computePhase, parseStartedAt, COUNTDOWN_MS } from '../js/phase.js';
import { HEAT_DURATION_MS, BONUS_ROUND_MS } from '../js/config.js';

const START = '2026-08-16T04:00:00Z';
const T0 = Date.parse(START);
const HEAT_END = COUNTDOWN_MS + HEAT_DURATION_MS;    // 93 s after start
const BONUS_END = HEAT_END + BONUS_ROUND_MS;         // 183 s after start

test('heat phase while the drive is on', () => {
  const p = computePhase(START, T0 + 10_000);
  assert.equal(p.phase, 'heat');
  assert.equal(p.heatRemainingMs, HEAT_END - 10_000);
  assert.equal(p.bonusRemainingMs, BONUS_ROUND_MS);
});

test('bonus phase starts exactly when the heat ends', () => {
  const p = computePhase(START, T0 + HEAT_END);
  assert.equal(p.phase, 'bonus');
  assert.equal(p.bonusRemainingMs, BONUS_ROUND_MS);
});

test('bonus counts down', () => {
  const p = computePhase(START, T0 + HEAT_END + 60_000);
  assert.equal(p.phase, 'bonus');
  assert.equal(p.bonusRemainingMs, BONUS_ROUND_MS - 60_000);
});

test('over when the bonus window closes', () => {
  const p = computePhase(START, T0 + BONUS_END);
  assert.equal(p.phase, 'over');
  assert.equal(p.heatRemainingMs, 0);
  assert.equal(p.bonusRemainingMs, 0);
});

test('parses PostgREST offset, bare, and Z timestamp variants as UTC', () => {
  assert.equal(parseStartedAt('2026-08-16T04:00:00+00:00'), T0);
  assert.equal(parseStartedAt('2026-08-16T04:00:00'), T0);
  assert.equal(parseStartedAt('2026-08-16T04:00:00Z'), T0);
});

test('garbage start times return null instead of a guessed phase', () => {
  assert.equal(parseStartedAt(null), null);
  assert.equal(parseStartedAt(''), null);
  assert.equal(parseStartedAt('not a date'), null);
  assert.equal(computePhase(null, T0), null);
});
