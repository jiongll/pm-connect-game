import { GAME_NAME, TECH_FAMILIES, BUCKET_QUESTION, BUCKET_OPTIONS,
         MATCH_BONUS, BONUS_ROUND_MS } from './config.js';
import { QUESTIONS } from './questions.js';
import { TIERS } from './scoring.js';
import { startGame } from './game.js';
import * as db from './db.js';
import { bonusAwarded, validatePartner } from './pairing.js';
import { computePhase } from './phase.js';
import { unlockAudio, playTick, playGo } from './sound.js';

const $ = id => document.getElementById(id);
const SCREENS = ['entry', 'waiting', 'countdown', 'game', 'results'];
const solo = new URLSearchParams(location.search).has('solo');

let me = null;
let appState = 'entry';   // entry | waiting | countdown | playing | results

function show(name) {
  for (const s of SCREENS) $('screen-' + s).classList.toggle('active', s === name);
}

init();

async function init() {
  document.title = GAME_NAME;
  $('game-title').textContent = GAME_NAME;
  for (const tf of TECH_FAMILIES) $('tech-family').add(new Option(tf, tf));
  $('bucket-label').textContent = BUCKET_QUESTION;
  for (const b of BUCKET_OPTIONS) $('bucket').add(new Option(b, b));
  $('join-btn').addEventListener('click', join);

  if (solo) { beginCountdown(); return; }

  const savedId = localStorage.getItem('grabrush_player_id');
  if (savedId) {
    try {
      const [row, state] = await Promise.all([db.getPlayer(savedId), db.getGameState()]);
      if (state && row.session !== state.session) {
        localStorage.removeItem('grabrush_player_id');   // old game - join afresh
      } else {
        me = row;
      }
    } catch { localStorage.removeItem('grabrush_player_id'); }
  }
  if (me) enterWaiting();
}

async function join() {
  unlockAudio();                              // first user gesture unlocks sound
  $('entry-error').textContent = '';
  $('join-btn').disabled = true;
  try {
    me = await db.joinGame($('slack-id').value, $('tech-family').value, $('bucket').value);
    localStorage.setItem('grabrush_player_id', me.id);
    enterWaiting();
  } catch (err) {
    $('entry-error').textContent = err.message;
  } finally {
    $('join-btn').disabled = false;
  }
}

function enterWaiting() {
  appState = 'waiting';
  $('waiting-name').textContent = '@' + me.slack_id;
  show('waiting');
  db.onGameState(onState);
}

function onState(state) {
  if (!state) return;
  if (me && state.session !== me.session) {     // host pressed "Start new game"
    localStorage.removeItem('grabrush_player_id');
    location.reload();                          // clean slate, back to the entry form
    return;
  }
  if (state.status !== 'started' || appState !== 'waiting') return;
  const p = computePhase(state.started_at, Date.now());
  if (!p || p.phase === 'heat') { beginCountdown(); return; }
  showResultsShell();                           // joined or restored after the heat
  enterBonus(p.phase === 'bonus' ? p.bonusRemainingMs : 0);
}

// Results screen for someone who never drove this heat (late joiner or a
// refresh after the heat ended): score 0 is already on the board from join.
function showResultsShell() {
  appState = 'results';
  show('results');
  $('final-score').textContent = me.score ?? 0;
  $('final-tier').parentElement.style.display = 'none';   // no run, no tier line
}

function beginCountdown() {
  appState = 'countdown';
  show('countdown');
  let n = 3;
  $('count-num').textContent = n;
  playTick();
  const iv = setInterval(() => {
    n -= 1;
    if (n === 0) { clearInterval(iv); playGo(); play(); }
    else { $('count-num').textContent = n; playTick(); }
  }, 1000);
}

function play() {
  appState = 'playing';
  show('game');
  $('hud-name').textContent = '@' + (me ? me.slack_id : 'you');
  startGame($('game-canvas'),
    { score: $('hud-score'), tier: $('hud-tier'), time: $('hud-time'),
      banner: $('question-banner'), question: $('q-text'), options: $('q-options') },
    QUESTIONS, onGameFinish);
}

async function onGameFinish(finalScore, tier) {
  appState = 'results';
  show('results');
  $('final-score').textContent = finalScore;
  $('final-tier').textContent = TIERS[tier];
  if (solo) {
    $('submit-status').textContent = 'Solo mode - score not submitted.';
    $('match-block').style.display = 'none';    // no backend, no bonus round
    return;
  }
  $('submit-status').textContent = 'Sending your score...';
  const ok = await db.submitScore(me.id, finalScore);
  $('submit-status').textContent = ok
    ? 'Score is on the leaderboard!'
    : 'Could not reach the leaderboard - show this screen to the host.';
  const state = await db.getGameState();        // shared anchor for the deadline
  const p = state ? computePhase(state.started_at, Date.now()) : null;
  enterBonus(p ? p.bonusRemainingMs : BONUS_ROUND_MS);
}

let bonusEntered = false, connectedDone = false;
let deadline = 0, tickIv = null, pollIv = null;

function enterBonus(remainingMs) {
  if (bonusEntered) return;                     // poll ticks re-fire; set up once
  bonusEntered = true;
  deadline = Date.now() + remainingMs;
  $('self-id').textContent = '@' + me.slack_id;
  $('match-instructions').textContent =
    'Find someone from a different Tech Family who travels to the office a different way. '
    + 'Swap Slack IDs, type theirs below - you both get +' + MATCH_BONUS + '. '
    + 'Tip: you can also find someone on Slack.';
  $('claim-form').style.display = 'block';
  $('claim-btn').addEventListener('click', claim);
  bonusTick();
  tickIv = setInterval(bonusTick, 250);
  pollIv = setInterval(checkConnected, 4000);
  checkConnected();
}

function bonusTick() {
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (left > 0) { $('bonus-timer').textContent = 'Bonus round: ' + left + 's left'; return; }
  clearInterval(tickIv);                        // the lock
  $('bonus-timer').textContent = '';
  $('claim-form').style.display = 'none';
  if (!connectedDone) $('claim-status').textContent = 'Bonus round closed - your score stands.';
  // Grace: a partner's claim may have landed right at the buzzer.
  setTimeout(() => { checkConnected().finally(() => clearInterval(pollIv)); }, 5000);
}

async function claim() {
  $('claim-btn').disabled = true;
  try {
    const typed = db.normaliseSlackId($('claim-input').value);
    if (!typed) { $('claim-status').textContent = 'Type their Slack ID first.'; return; }
    const players = await db.getPlayers(me.session);
    if (players.length === 0) {                 // fetch failed; we are in there ourselves
      $('claim-status').textContent = 'Could not reach the game - try again.';
      return;
    }
    // Resolve to the stored row case-insensitively; write the CANONICAL stored
    // slack_id, never the raw input - pairing.js comparisons are strict ===.
    const other = players.find(pl => String(pl.slack_id).toLowerCase() === typed);
    const verdict = validatePartner(me, other, players);
    if (!verdict.ok) { $('claim-status').textContent = verdict.reason; return; }
    await db.claimMatch(me.id, other.slack_id);
    me = { ...me, claimed_match: other.slack_id };
    $('claim-status').textContent = 'Saved. Now make sure they type YOUR ID too.';
    checkConnected();
  } catch (err) {
    $('claim-status').textContent = err.message;
  } finally {
    $('claim-btn').disabled = false;
  }
}

async function checkConnected() {
  if (connectedDone) return;
  const players = await db.getPlayers(me.session);
  const mine = players.find(pl => pl.id === me.id);
  if (mine && bonusAwarded(mine, players)) {
    connectedDone = true;
    clearInterval(pollIv);
    $('claim-status').textContent = 'Connected! +' + MATCH_BONUS + ' points for you both.';
    $('claim-form').style.display = 'none';
  }
}
