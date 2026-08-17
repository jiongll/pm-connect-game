import { MATCH_BONUS, ROOKIE_BONUS, HOME_FAMILY } from './config.js';

// Bonus round: no assigned matches. Players find their own partner in the
// room, swap Slack IDs, and both type the other's ID. A pair counts when
// the claims are mutual AND the pairing rules hold. Mutuality is what makes
// "one pair per person" automatic: each player has a single claimed_match
// column, so nobody can be half of two mutual pairs at once.

// The pairing rules, shared by claim validation and scoring.
function rulesOk(a, b) {
  return a.slack_id !== b.slack_id          // not yourself
    && a.tech_family !== b.tech_family      // different Tech Family
    && a.bucket !== b.bucket;               // travels a different way
}

// Player-facing verdict for a claim BEFORE it is written. `other` is the
// row the typed ID resolved to (undefined if none). Returns { ok: true }
// or { ok: false, reason: <copy shown under the claim box> }.
export function validatePartner(me, other, allPlayers = []) {
  if (!other) {
    return { ok: false, reason: 'No player with that ID this round - check the spelling.' };
  }
  if (other.slack_id === me.slack_id) {
    return { ok: false, reason: "That's you! Find someone else." };
  }
  if (other.tech_family === me.tech_family) {
    return { ok: false, reason: 'Same Tech Family - find someone from a different one.' };
  }
  if (other.bucket === me.bucket) {
    return { ok: false, reason: "They travel the same way as you - find someone who doesn't." };
  }
  if (bonusAwarded(other, allPlayers) && other.claimed_match !== me.slack_id) {
    return { ok: false, reason: "They're already paired with someone else." };
  }
  return { ok: true };
}

// Mutual claims + rules pass = both get the bonus.
export function bonusAwarded(player, allPlayers) {
  if (!player.claimed_match) return false;
  const other = allPlayers.find(p => p.slack_id === player.claimed_match);
  if (!other || other.claimed_match !== player.slack_id) return false;
  return rulesOk(player, other);
}

// The quiz is Mobility product trivia, so everyone outside Mobility is
// answering about someone else's product. This is the handicap: a flat
// top-up for the away teams. A zero bonus turns it off entirely, so the
// flag stays false and nothing gets labelled.
export function rookieAwarded(player, rookieBonus = ROOKIE_BONUS, homeFamily = HOME_FAMILY) {
  return rookieBonus > 0 && player.tech_family !== homeFamily;
}

// Both bonuses are display-only: the stored score is the raw run score, so
// the board can be rebuilt from the database at any time without either
// bonus being baked in. Deliberately NOT folded into scoring.finalScore -
// the game engine shares that function with the mid-heat live board and
// does not know the player's Tech Family, so a bonus there would leak onto
// the big screen during the heat instead of landing at the end.
export function buildLeaderboard(players, matchBonus = MATCH_BONUS,
                                 rookieBonus = ROOKIE_BONUS, homeFamily = HOME_FAMILY) {
  return players
    .filter(p => p.score !== null && p.score !== undefined)
    .map(p => {
      const connected = bonusAwarded(p, players);
      const rookie = rookieAwarded(p, rookieBonus, homeFamily);
      return {
        slack_id: p.slack_id,
        tech_family: p.tech_family,
        connected,
        rookie,
        display_score: p.score
                     + (connected ? matchBonus : 0)
                     + (rookie ? rookieBonus : 0),
      };
    })
    .sort((x, y) => y.display_score - x.display_score
                 || x.slack_id.localeCompare(y.slack_id));
}

export function connectionStats(players) {
  const connected = players.filter(p => bonusAwarded(p, players)).length;
  return { connected, total: players.length };
}
