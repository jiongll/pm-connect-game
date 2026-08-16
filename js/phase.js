import { HEAT_DURATION_MS, BONUS_ROUND_MS } from './config.js';

// Every screen derives "where are we in the game" from one shared anchor:
// game_state.started_at. No extra status writes, no per-screen timers.
//
//   heat  = 3 s countdown + 90 s of driving   (started_at .. +93 s)
//   bonus = 90 s to pair up                   (+93 s .. +183 s)
//   over  = final leaderboard, entries locked (+183 s ..)
export const COUNTDOWN_MS = 3_000;

export function computePhase(startedAtIso, nowMs) {
  const t0 = parseStartedAt(startedAtIso);
  if (t0 === null) return null;
  const heatEnd = t0 + COUNTDOWN_MS + HEAT_DURATION_MS;
  const bonusEnd = heatEnd + BONUS_ROUND_MS;
  if (nowMs < heatEnd) {
    return { phase: 'heat', heatRemainingMs: heatEnd - nowMs, bonusRemainingMs: BONUS_ROUND_MS };
  }
  if (nowMs < bonusEnd) {
    return { phase: 'bonus', heatRemainingMs: 0, bonusRemainingMs: bonusEnd - nowMs };
  }
  return { phase: 'over', heatRemainingMs: 0, bonusRemainingMs: 0 };
}

// PostgREST returns "2026-08-16T04:00:00+00:00"; our own writes store
// "...Z". Some engines also emit bare "...T04:00:00" - that is UTC too,
// so append the missing marker rather than letting Date.parse guess
// local time.
export function parseStartedAt(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const hasTz = /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso);
  const t = Date.parse(hasTz ? iso : iso + 'Z');
  return Number.isNaN(t) ? null : t;
}
