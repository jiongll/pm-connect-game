import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function normaliseSlackId(raw) {
  return String(raw).trim().toLowerCase().replace(/^@/, '');
}

export async function joinGame(slackId, techFamily, bucket) {
  const slack_id = normaliseSlackId(slackId);
  if (!slack_id) throw new Error('Slack ID is required.');
  const state = await getGameState();          // joins always land in the current session
  const { data, error } = await client.from('players')
    .insert({ slack_id, tech_family: techFamily, bucket, score: 0, session: state?.session ?? 1 })
    .select().single();
  if (error) {
    if (error.code === '23505') throw new Error('That Slack ID has already joined.');
    throw new Error('Could not reach the game server. Check signal and try again.');
  }
  return data;
}

export async function getPlayer(id) {
  const { data, error } = await client.from('players').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getPlayers(session) {
  const { data, error } = await client.from('players').select('*').eq('session', session);
  return error ? [] : data;
}

export async function getGameState() {
  const { data } = await client.from('game_state').select('*').eq('id', 1).single();
  return data ?? null;
}

export async function setGameStatus(status) {
  const patch = { status };
  if (status === 'started') patch.started_at = new Date().toISOString();
  const { error } = await client.from('game_state').update(patch).eq('id', 1);
  if (error) throw new Error('Could not update the game state. Try again.');
}

// The admin "Start new game" reset: bump the session counter. Every client
// sees the change, snaps back to the join screen, and all reads filter to
// the new session. Old rows stay in the table, invisible - nothing is
// deleted, so the public key never needs delete rights.
export async function newSession() {
  const state = await getGameState();
  if (!state) throw new Error('Could not read the game state. Try again.');
  const { error } = await client.from('game_state')
    .update({ session: state.session + 1, status: 'waiting', started_at: null })
    .eq('id', 1);
  if (error) throw new Error('Could not start a new game. Try again.');
}

// Best-effort: 3 attempts with backoff. Returns false rather than throwing -
// the caller shows fallback copy and the local score stays on screen.
export async function submitScore(playerId, score) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await client.from('players')
      .update({ score }).eq('id', playerId);
    if (!error) return true;
    await new Promise(r => setTimeout(r, 800 * attempt));
  }
  return false;
}

// Cosmetic mid-game push so the big screen climbs during the heat. Deliberately
// NOT the same as submitScore: one attempt, no retry, never awaited by the
// caller. A failure is harmless - the board stays one tick stale and the
// authoritative submitScore at the finish still lands. No retry is the point:
// a queued retry could land AFTER the final write and pin a stale score.
export function pushLiveScore(playerId, score) {
  client.from('players').update({ score }).eq('id', playerId)
    .then(() => {}, () => {});               // swallow both paths - best effort
}

export async function claimMatch(playerId, claimedSlackId) {
  const claimed = normaliseSlackId(claimedSlackId);
  if (!claimed) throw new Error('Type their Slack ID first.');
  const { error } = await client.from('players')
    .update({ claimed_match: claimed }).eq('id', playerId);
  if (error) throw new Error('Could not save. Check signal and try again.');
}

// ── Subscriptions: realtime + polling fallback ──────────────────────
// Both paths call cb; callbacks must be idempotent. Each returns unsubscribe.

export function onGameState(cb) {
  const ch = client.channel('gs')
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state' },
        payload => cb(payload.new))
    .subscribe();
  const poll = setInterval(async () => cb(await getGameState()), 8000);
  return () => { client.removeChannel(ch); clearInterval(poll); };
}

export function onPlayers(session, cb) {
  const push = async () => cb(await getPlayers(session));
  const ch = client.channel('pl')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players' }, push)
    .subscribe();
  const poll = setInterval(push, 12000);
  push();
  return () => { client.removeChannel(ch); clearInterval(poll); };
}
