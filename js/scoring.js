import { COIN_POINTS, COLLISION_PENALTY, TIER_BONUS, TIER_SPEED_STEP, MAGNET_TIER } from './config.js';

export const TIERS = ['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', '6 Seater', 'Premium', 'Exec'];

export function collectCoin(score) { return score + COIN_POINTS; }
export function hitObstacle(score) { return Math.max(0, score - COLLISION_PENALTY); }
export function answerQuestion(tier, correct) {
  return correct ? Math.min(tier + 1, TIERS.length - 1) : tier;
}
export function tierPoints(tier) { return tier * TIER_BONUS; }
export function finalScore(runScore, tier) { return runScore + tierPoints(tier); }
export function tierSpeedMultiplier(tier) { return 1 + tier * TIER_SPEED_STEP; }
export function tierHasMagnet(tier) { return tier >= MAGNET_TIER; }
