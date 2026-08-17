import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePartner, bonusAwarded, buildLeaderboard, connectionStats } from '../js/pairing.js';

// Minimal player rows - only the columns the pairing logic reads.
const P = (slack_id, tech_family, bucket, extra = {}) =>
  ({ slack_id, tech_family, bucket, ...extra });

test('accepts a different-TF, different-bucket partner', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'FS', 'Grab');
  assert.deepEqual(validatePartner(me, other, [me, other]), { ok: true });
});

test('rejects an unknown ID', () => {
  const me = P('a', 'Mobility', 'Drive');
  const verdict = validatePartner(me, undefined, [me]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /No player with that ID/);
});

test('rejects yourself', () => {
  const me = P('a', 'Mobility', 'Drive');
  const verdict = validatePartner(me, me, [me]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /That's you/);
});

test('rejects the same Tech Family', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'Mobility', 'Grab');
  const verdict = validatePartner(me, other, [me, other]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /Same Tech Family/);
});

test('rejects the same commute bucket', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'FS', 'Drive');
  const verdict = validatePartner(me, other, [me, other]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /travel the same way/);
});

test('rejects someone already mutually paired with a third player', () => {
  const me = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Grab', { claimed_match: 'c' });
  const c = P('c', 'GFB', 'Drive', { claimed_match: 'b' });
  const verdict = validatePartner(me, b, [me, b, c]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /already paired/);
});

test('accepts someone who has already claimed ME (completing the pair)', () => {
  const me = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  assert.deepEqual(validatePartner(me, b, [me, b]), { ok: true });
});

test('re-validating an already-connected partner stays ok (idempotent re-claim)', () => {
  const me = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  assert.deepEqual(validatePartner(me, b, [me, b]), { ok: true });
});

test('bonus needs mutual claims', () => {
  const a = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  const c = P('c', 'GFB', 'Train / Bus / Walk', { claimed_match: 'a' });   // one-sided
  const all = [a, b, c];
  assert.equal(bonusAwarded(a, all), true);
  assert.equal(bonusAwarded(b, all), true);
  assert.equal(bonusAwarded(c, all), false);
});

test('no bonus without a claim, or when the partner never reciprocates', () => {
  const a = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  const all = [a, b];
  assert.equal(bonusAwarded(a, all), false);   // never claimed anyone
  assert.equal(bonusAwarded(b, all), false);   // claimed a, but a never reciprocated
});

test('mutual claims still fail the rules: same TF or same bucket', () => {
  const a = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'Mobility', 'Grab', { claimed_match: 'a' });   // same TF
  const c = P('c', 'FS', 'Drive', { claimed_match: 'd' });
  const d = P('d', 'GFB', 'Drive', { claimed_match: 'c' });       // same bucket
  const all = [a, b, c, d];
  assert.equal(bonusAwarded(a, all), false);
  assert.equal(bonusAwarded(b, all), false);
  assert.equal(bonusAwarded(c, all), false);
  assert.equal(bonusAwarded(d, all), false);
});

test('leaderboard adds bonus, sorts desc, excludes non-finishers', () => {
  const a = P('a', 'Mobility', 'Drive', { score: 100, claimed_match: 'b' });
  const b = P('b', 'FS', 'Grab', { score: 50, claimed_match: 'a' });
  const c = P('c', 'GFB', 'Drive', { score: 120 });
  const late = P('late', 'ACE', 'Drive', { score: null });
  // Rookie bonus pinned off - this test is about the match bonus alone.
  const rows = buildLeaderboard([a, b, c, late], 35, 0);
  assert.deepEqual(rows.map(r => r.slack_id), ['a', 'c', 'b']);   // 135, 120, 85
  assert.equal(rows[0].display_score, 135);
  assert.equal(rows[0].connected, true);
  assert.equal(rows[1].connected, false);
  assert.equal(rows.length, 3);
});

// The quiz is Mobility trivia, so everyone else gets a small top-up. It is a
// display-layer bonus like the match bonus: the stored score stays untouched.
test('rookie bonus goes to everyone outside the home family', () => {
  const mob = P('mob', 'Mobility', 'Drive', { score: 100 });
  const fs = P('fs', 'FS', 'Grab', { score: 100 });
  const rows = buildLeaderboard([mob, fs], 35, 25, 'Mobility');
  const byId = Object.fromEntries(rows.map(r => [r.slack_id, r]));
  assert.equal(byId.mob.display_score, 100);      // home family, no top-up
  assert.equal(byId.mob.rookie, false);
  assert.equal(byId.fs.display_score, 125);       // 100 + 25
  assert.equal(byId.fs.rookie, true);
});

test('rookie bonus stacks with the match bonus', () => {
  const a = P('a', 'FS', 'Drive', { score: 100, claimed_match: 'b' });
  const b = P('b', 'GFB', 'Grab', { score: 100, claimed_match: 'a' });
  const rows = buildLeaderboard([a, b], 35, 25, 'Mobility');
  // Both paired and both outside Mobility: 100 + 35 + 25.
  assert.equal(rows[0].display_score, 160);
  assert.equal(rows[1].display_score, 160);
  assert.ok(rows.every(r => r.connected && r.rookie));
});

test('rookie bonus can change the ranking', () => {
  const mob = P('mob', 'Mobility', 'Drive', { score: 110 });
  const fs = P('fs', 'FS', 'Grab', { score: 100 });
  // Without the bonus Mobility leads by 10; 25 is enough to overturn that.
  assert.deepEqual(buildLeaderboard([mob, fs], 35, 0, 'Mobility').map(r => r.slack_id),
                   ['mob', 'fs']);
  assert.deepEqual(buildLeaderboard([mob, fs], 35, 25, 'Mobility').map(r => r.slack_id),
                   ['fs', 'mob']);
});

test('rookie bonus of 0 disables it entirely', () => {
  const fs = P('fs', 'FS', 'Grab', { score: 100 });
  const [row] = buildLeaderboard([fs], 35, 0, 'Mobility');
  assert.equal(row.display_score, 100);
  assert.equal(row.rookie, false);         // nothing to label when nothing is added
});

test('connection stats count everyone as the base', () => {
  const a = P('a', 'Mobility', 'Drive', { score: 10, claimed_match: 'b' });
  const b = P('b', 'FS', 'Grab', { score: 20, claimed_match: 'a' });
  const e = P('e', 'GFB', 'Drive', { score: 0 });
  assert.deepEqual(connectionStats([a, b, e]), { connected: 2, total: 3 });
});
