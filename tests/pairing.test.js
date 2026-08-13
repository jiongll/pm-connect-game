import test from 'node:test';
import assert from 'node:assert/strict';
import { computePairs, bonusAwarded, buildLeaderboard, connectionStats } from '../js/pairing.js';

const P = (slack_id, tech_family, bucket, extra = {}) =>
  ({ slack_id, tech_family, bucket, ...extra });

test('pairs same bucket, different tech family', () => {
  const pairs = computePairs([P('a', 'Mobility', 'Drive'), P('b', 'Deliveries', 'Drive')]);
  assert.equal(pairs.length, 1);
  assert.deepEqual(new Set(pairs[0]), new Set(['a', 'b']));
});

test('never pairs within the same tech family', () => {
  const pairs = computePairs([P('a', 'Mobility', 'Drive'), P('b', 'Mobility', 'Drive')]);
  assert.equal(pairs.length, 0);
});

test('never pairs across buckets', () => {
  const pairs = computePairs([P('a', 'Mobility', 'Drive'), P('b', 'Deliveries', 'Grab')]);
  assert.equal(pairs.length, 0);
});

test('maximises pairs when tech families are skewed', () => {
  const pairs = computePairs([
    P('m1', 'Mobility', 'Drive'), P('m2', 'Mobility', 'Drive'), P('m3', 'Mobility', 'Drive'),
    P('d1', 'Deliveries', 'Drive'), P('f1', 'Fin', 'Drive'),
  ]);
  assert.equal(pairs.length, 2); // 3 Mobility soak up the two singletons; one left over
});

test('each player appears in at most one pair', () => {
  const players = [
    P('a', 'X', 'B1'), P('b', 'Y', 'B1'), P('c', 'X', 'B1'), P('d', 'Z', 'B1'),
    P('e', 'X', 'B2'), P('f', 'Y', 'B2'),
  ];
  const seen = new Set();
  for (const [x, y] of computePairs(players)) {
    assert.ok(!seen.has(x) && !seen.has(y), 'player appeared twice');
    seen.add(x); seen.add(y);
  }
});

test('bonus needs mutual claims of the assigned match', () => {
  const a = P('a', 'X', 'B', { match_slack_id: 'b', claimed_match: 'b' });
  const b = P('b', 'Y', 'B', { match_slack_id: 'a', claimed_match: 'a' });
  const c = P('c', 'Z', 'B', { match_slack_id: 'd', claimed_match: 'wrong' });
  const d = P('d', 'X', 'B', { match_slack_id: 'c', claimed_match: 'c' });
  const all = [a, b, c, d];
  assert.equal(bonusAwarded(a, all), true);
  assert.equal(bonusAwarded(b, all), true);
  assert.equal(bonusAwarded(c, all), false); // typed the wrong ID
  assert.equal(bonusAwarded(d, all), false); // partner has not reciprocated correctly
});

test('no bonus without an assigned match or without a claim', () => {
  const solo = P('s', 'X', 'B', { claimed_match: 'a' });
  const quiet = P('q', 'X', 'B', { match_slack_id: 'a' });
  assert.equal(bonusAwarded(solo, [solo]), false);
  assert.equal(bonusAwarded(quiet, [quiet]), false);
});

test('leaderboard adds bonus, sorts desc, excludes non-finishers', () => {
  const a = P('a', 'X', 'B', { score: 100, match_slack_id: 'b', claimed_match: 'b' });
  const b = P('b', 'Y', 'B', { score: 50, match_slack_id: 'a', claimed_match: 'a' });
  const c = P('c', 'Z', 'B', { score: 120 });
  const late = P('z', 'Z', 'B', { score: null });
  const rows = buildLeaderboard([a, b, c, late], 35);
  assert.deepEqual(rows.map(r => r.slack_id), ['a', 'c', 'b']); // 135, 120, 85
  assert.equal(rows[0].display_score, 135);
  assert.equal(rows[0].connected, true);
  assert.equal(rows[1].connected, false);
  assert.equal(rows.length, 3);
});

test('connection stats count matched players only', () => {
  const a = P('a', 'X', 'B', { match_slack_id: 'b', claimed_match: 'b' });
  const b = P('b', 'Y', 'B', { match_slack_id: 'a', claimed_match: 'a' });
  const c = P('c', 'Z', 'B', { match_slack_id: 'd' });
  const d = P('d', 'X', 'B', { match_slack_id: 'c' });
  const e = P('e', 'X', 'B');
  const s = connectionStats([a, b, c, d, e]);
  assert.equal(s.total, 4);
  assert.equal(s.connected, 2);
});
