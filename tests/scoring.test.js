import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, collectCoin, hitObstacle, answerQuestion,
  tierPoints, finalScore, tierSpeedMultiplier, tierHasMagnet,
} from '../js/scoring.js';

test('four tiers in order', () => {
  assert.deepEqual(TIERS, ['Standard', 'Plus', 'Premium', 'Exec']);
});
test('coin adds points', () => assert.equal(collectCoin(10), 12));
test('obstacle subtracts but never below zero', () => {
  assert.equal(hitObstacle(10), 5);
  assert.equal(hitObstacle(3), 0);
});
test('correct answer upgrades one tier, capped at Exec', () => {
  assert.equal(answerQuestion(0, true), 1);
  assert.equal(answerQuestion(3, true), 3);
});
test('wrong answer changes nothing - no gain, no penalty', () => {
  assert.equal(answerQuestion(2, false), 2);
  assert.equal(answerQuestion(0, false), 0);
});
test('tier points are 10 per tier', () => {
  assert.equal(tierPoints(0), 0);
  assert.equal(tierPoints(3), 30);
});
test('final score adds tier points to run score', () => {
  assert.equal(finalScore(80, 2), 100);
});
test('speed rises with tier', () => {
  assert.ok(tierSpeedMultiplier(3) > tierSpeedMultiplier(0));
  assert.equal(tierSpeedMultiplier(0), 1);
});
test('coin magnet from Premium up', () => {
  assert.equal(tierHasMagnet(0), false);
  assert.equal(tierHasMagnet(1), false);
  assert.equal(tierHasMagnet(2), true);
  assert.equal(tierHasMagnet(3), true);
});
