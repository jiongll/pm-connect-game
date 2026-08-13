import { MATCH_BONUS } from './config.js';

// Reciprocal 1-to-1 pairs: same bucket, different tech family.
// Heuristic: within each bucket, repeatedly pair one player from each of the
// two largest remaining tech-family groups. For "must differ" pairing this
// maximises the number of pairs. Leftovers stay unmatched (fine per spec).
export function computePairs(players) {
  const byBucket = new Map();
  for (const p of players) {
    if (!byBucket.has(p.bucket)) byBucket.set(p.bucket, []);
    byBucket.get(p.bucket).push(p);
  }
  const pairs = [];
  for (const group of byBucket.values()) {
    const byTf = new Map();
    for (const p of group) {
      if (!byTf.has(p.tech_family)) byTf.set(p.tech_family, []);
      byTf.get(p.tech_family).push(p);
    }
    while (true) {
      const tfGroups = [...byTf.values()]
        .filter(g => g.length > 0)
        .sort((x, y) => y.length - x.length);
      if (tfGroups.length < 2) break;
      pairs.push([tfGroups[0].pop().slack_id, tfGroups[1].pop().slack_id]);
    }
  }
  return pairs;
}

// Bonus lands only when BOTH sides typed each other's ID, and each typed
// exactly their assigned match. Derived data - nothing is written for it.
export function bonusAwarded(player, allPlayers) {
  if (!player.match_slack_id || !player.claimed_match) return false;
  if (player.claimed_match !== player.match_slack_id) return false;
  const other = allPlayers.find(p => p.slack_id === player.match_slack_id);
  return Boolean(other && other.claimed_match === player.slack_id);
}

export function buildLeaderboard(players, matchBonus = MATCH_BONUS) {
  return players
    .filter(p => p.score !== null && p.score !== undefined)
    .map(p => {
      const connected = bonusAwarded(p, players);
      return {
        slack_id: p.slack_id,
        tech_family: p.tech_family,
        connected,
        display_score: p.score + (connected ? matchBonus : 0),
      };
    })
    .sort((x, y) => y.display_score - x.display_score
                 || x.slack_id.localeCompare(y.slack_id));
}

export function connectionStats(players) {
  const matched = players.filter(p => p.match_slack_id);
  const connected = matched.filter(p => bonusAwarded(p, players));
  return { connected: connected.length, total: matched.length };
}
