import { GAME_NAME, TECH_FAMILIES, BUCKET_QUESTION, BUCKET_OPTIONS, MATCH_BONUS } from './config.js';
import { QUESTIONS } from './questions.js';
import { TIERS } from './scoring.js';
import { startGame } from './game.js';
import * as db from './db.js';
import { bonusAwarded } from './pairing.js';

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
  if (state.status === 'started' && appState === 'waiting') beginCountdown();
  if (state.status === 'match_round' && appState === 'waiting') {
    appState = 'results';
    show('results');
    $('final-score').textContent = me.score ?? 0;
    enterMatchRound();
  }
  if (state.status === 'match_round' && appState === 'results') enterMatchRound();
}

function beginCountdown() {
  appState = 'countdown';
  show('countdown');
  let n = 3;
  $('count-num').textContent = n;
  const iv = setInterval(() => {
    n -= 1;
    if (n === 0) { clearInterval(iv); play(); }
    else $('count-num').textContent = n;
  }, 1000);
}

function play() {
  appState = 'playing';
  show('game');
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
    return;
  }
  $('submit-status').textContent = 'Sending your score...';
  const ok = await db.submitScore(me.id, finalScore);
  $('submit-status').textContent = ok
    ? 'Score is on the leaderboard!'
    : 'Could not reach the leaderboard - show this screen to the host.';
  db.onOwnRow(me.id, row => {
    me = { ...me, ...row };
    if (row.match_slack_id) showMatch(row);
  });
}

let pollMatch = null;
let claimWired = false;
let connectedDone = false;
let matchEntered = false;

async function enterMatchRound() {
  if (matchEntered) return;   // onState re-fires on every poll tick; run setup once
  matchEntered = true;
  try {
    const row = await db.getPlayer(me.id);
    me = { ...me, ...row };
    if (row.match_slack_id) showMatch(row); else showNoMatch();
  } catch { /* onOwnRow polling will catch up */ }
}

function showNoMatch() {
  $('match-instructions').textContent =
    'No match this round - your score stands. Go and say hello to someone anyway.';
}

function showMatch(row) {
  if (connectedDone) return;   // poll callbacks repeat; never resurrect the form
  $('match-instructions').textContent =
    'Find this person - in the room or on Slack. Swap Slack IDs, type theirs below, '
    + 'and you both get +' + MATCH_BONUS + '.';
  $('match-name').textContent = '@' + row.match_slack_id;
  $('match-context').textContent =
    'You both answered "' + row.bucket + '" - and they are from a different Tech Family.';
  $('claim-form').style.display = 'block';
  if (!claimWired) {
    claimWired = true;
    $('claim-btn').addEventListener('click', claim);
  }
  if (!pollMatch) pollMatch = setInterval(checkConnected, 4000);
}

async function claim() {
  $('claim-btn').disabled = true;
  try {
    await db.claimMatch(me.id, $('claim-input').value);
    $('claim-status').textContent =
      'Saved. Waiting for them to enter yours... Typo? Fix it and press again.';
    checkConnected();
  } catch (err) {
    $('claim-status').textContent = err.message;
  } finally {
    $('claim-btn').disabled = false;
  }
}

async function checkConnected() {
  const players = await db.getPlayers(me.session);
  const mine = players.find(p => p.id === me.id);
  if (mine && bonusAwarded(mine, players)) {
    connectedDone = true;
    clearInterval(pollMatch);
    $('claim-status').textContent = 'Connected! +' + MATCH_BONUS + ' points for you both.';
    $('claim-form').style.display = 'none';
  }
}
