import { GAME_NAME, TECH_FAMILIES, BUCKET_QUESTION, BUCKET_OPTIONS,
         MATCH_BONUS, BONUS_ROUND_MS } from './config.js';
import { QUESTIONS } from './questions.js';
import { TIERS } from './scoring.js';
import { startGame, drawBikeSprite } from './game.js';
import * as db from './db.js';
import { bonusAwarded, validatePartner, connectionStats, buildLeaderboard } from './pairing.js';
import { computePhase } from './phase.js';
import { unlockAudio, playTick, playGo, playBonusSting, playChime } from './sound.js';

const $ = id => document.getElementById(id);
const SCREENS = ['entry', 'waiting', 'countdown', 'game', 'results'];
const solo = new URLSearchParams(location.search).has('solo');

let me = null;
let appState = 'entry';   // entry | waiting | countdown | playing | results
let stopGridSub = null, tipIv = null, warmup = null;   // waiting-room life (R5-R7)

// R6: teach the '?' coin and the bonus round while the room fills.
const TIPS = [
  'The gold ? coin freezes time for a trivia question.',
  'Correct answers upgrade your ride - better rides earn more.',
  'Crashes cost points, never the race. Keep driving.',
  'After the heat: find a partner, both score +' + MATCH_BONUS + '.',
];

function leaveWaiting() {                     // kill the waiting-room life on countdown
  if (stopGridSub) { stopGridSub(); stopGridSub = null; }
  if (tipIv) { clearInterval(tipIv); tipIv = null; }
  if (warmup) { warmup.stop(); warmup = null; }
}

// R7/R8: practice steering while the room fills - the first real swipe at
// 0:03 is muscle memory. No coins, no score. leaveWaiting() kills the loop
// the moment the countdown starts. Solo mode skips the waiting screen, so
// this never runs there.
function startWarmup() {
  const canvas = $('warmup-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = 140;       // css pins the height to 140px
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  $('ladder-line').textContent = 'Your starting ride: ' + TIERS[0];

  let lane = 1, dashOffset = 0, last = null, raf = null;
  const laneCenter = i => W * (0.2 + i * 0.3);
  const onTap = e => {
    const x = e.clientX - canvas.getBoundingClientRect().left;
    if (x < W / 2) lane = Math.max(0, lane - 1);
    else lane = Math.min(2, lane + 1);
    e.preventDefault();
  };
  canvas.addEventListener('pointerdown', onTap);

  const frame = ts => {
    if (last === null) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    dashOffset = (dashOffset + 220 * dt) % 34;
    ctx.fillStyle = '#23232b';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]); ctx.lineDashOffset = -dashOffset;
    for (const fx of [0.35, 0.65]) {
      ctx.beginPath(); ctx.moveTo(W * fx, -20); ctx.lineTo(W * fx, H + 20); ctx.stroke();
    }
    ctx.setLineDash([]);
    drawBikeSprite(ctx, laneCenter(lane), H - 62);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  warmup = { stop() {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onTap);
  } };
}

function show(name) {
  for (const s of SCREENS) $('screen-' + s).classList.toggle('active', s === name);
}

// R2: both dropdowns force a real choice - the bonus round's fairness
// rests on tech_family and bucket being true, not defaulted.
function addPlaceholder(sel, text) {
  const o = new Option(text, '');
  o.disabled = true; o.selected = true;
  sel.add(o);
}

init();

async function init() {
  document.title = GAME_NAME;
  $('game-title').textContent = GAME_NAME;
  addPlaceholder($('tech-family'), 'Pick your family...');
  for (const tf of TECH_FAMILIES) $('tech-family').add(new Option(tf, tf));
  $('bucket-label').textContent = BUCKET_QUESTION;
  addPlaceholder($('bucket'), 'Pick one...');
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
  if (!$('tech-family').value || !$('bucket').value) {
    $('entry-error').textContent = 'Pick your Tech Family and how you commute - the bonus round needs both.';
    return;
  }
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
  stopGridSub = db.onPlayers(me.session, list => {   // R5: watch the room fill up
    const others = Math.max(0, list.length - 1);
    $('grid-count').textContent =
      'You + ' + others + (others === 1 ? ' other' : ' others') + ' are on the grid';
  });
  let tip = 0;
  $('tip-line').textContent = TIPS[0];
  tipIv = setInterval(() => {                        // R6: rotate with a gentle fade
    tip = (tip + 1) % TIPS.length;
    $('tip-line').style.opacity = 0;
    setTimeout(() => {
      $('tip-line').textContent = TIPS[tip];
      $('tip-line').style.opacity = 1;
    }, 250);
  }, 4000);
  startWarmup();
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

function setDigit(n) {                        // R9: pop, colour-coded 3-2-1
  const el = $('count-num');
  el.textContent = n;
  el.className = 'c' + n;                     // green, amber, gold
  void el.offsetWidth;                        // restart the pop animation
  el.classList.add('pop');
}

function beginCountdown() {
  appState = 'countdown';
  leaveWaiting();                             // R5/R7: the waiting room is over
  show('countdown');
  let n = 3;
  setDigit(n);
  playTick();
  navigator.vibrate?.(40);                    // R10: silently no-ops on iOS
  const iv = setInterval(() => {
    n -= 1;
    if (n === 0) {
      clearInterval(iv);
      playGo();
      navigator.vibrate?.(120);
      play();                                 // the run starts under the GO!
      const go = $('go-flash');               // held over the first 400 ms (R9)
      go.textContent = 'GO!';
      go.classList.add('show');
      setTimeout(() => go.classList.remove('show'), 450);
    } else {
      setDigit(n);
      playTick();
      navigator.vibrate?.(40);
    }
  }, 1000);
}

function play() {
  appState = 'playing';
  show('game');
  $('hud-name').textContent = '@' + (me ? me.slack_id : 'you');
  startGame($('game-canvas'),
    { score: $('hud-score'), tier: $('hud-tier'), time: $('hud-time'),
      banner: $('question-banner'), question: $('q-text'), options: $('q-options'),
      flash: $('crash-flash'), qbar: $('q-bar') },
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
  if (remainingMs > 5000) {                     // R28: permission to stand up and move
    $('bi-sub').textContent = '+' + MATCH_BONUS + '. Stand up. Find a partner.';
    $('bonus-interstitial').classList.add('show');
    playBonusSting();
    setTimeout(() => $('bonus-interstitial').classList.remove('show'), 2000);
  }
  $('self-id').textContent = '@' + me.slack_id;
  $('badge-tf').textContent = me.tech_family;   // R29: the phone is a wearable name tag
  $('badge-bucket').textContent = me.bucket;
  $('self-id').addEventListener('click', copyId);
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

// R30: remote players paste into Slack; in the room it's a harmless flourish.
async function copyId() {
  try {
    await navigator.clipboard.writeText('@' + me.slack_id);
    $('copy-toast').textContent = 'Copied - paste it in Slack';
    setTimeout(() => { $('copy-toast').textContent = ''; }, 2000);
  } catch { /* clipboard blocked - nothing to clean up */ }
}

function bonusTick() {
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (left > 0) {
    $('bonus-timer').textContent = 'Bonus round: ' + left + 's left';
    $('bonus-timer').classList.toggle('urgent', left <= 10);       // R34: fun panic
    if (left <= 10 && !connectedDone) {
      $('match-instructions').textContent = '10 seconds - grab anyone with different badges!';
    }
    return;
  }
  clearInterval(tickIv);                        // the lock
  $('bonus-timer').textContent = '';
  $('bonus-timer').classList.remove('urgent');
  $('claim-form').style.display = 'none';
  if (!connectedDone) {
    $('claim-status').textContent =             // R35: the unpaired leave feeling fine
      'No pair this time - your driving score stands. '
      + 'Go and say hello to someone anyway. No points required.';
  }
  showRank();                                   // R50: a rank is an identity, told at lock
  // Grace: a partner's claim may have landed right at the buzzer.
  setTimeout(() => { checkConnected().finally(() => clearInterval(pollIv)); }, 5000);
}

// R50: fetch once at the lock. "9th of 44" is a story to tell the person
// next to you; deliberately withheld until eyes-up time is over.
async function showRank() {
  try {
    const players = await db.getPlayers(me.session);
    if (players.length === 0) return;
    const rows = buildLeaderboard(players, MATCH_BONUS);
    const mine = rows.find(r => r.slack_id === me.slack_id);
    if (!mine) return;
    const rank = rows.filter(r => r.display_score > mine.display_score).length + 1;  // ties share
    $('rank-line').textContent = 'You finished ' + ordinal(rank) + ' of ' + rows.length + '.';
  } catch { /* no rank line is fine - the projector has the board */ }
}

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
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
  const players = await db.getPlayers(me.session);
  if (players.length === 0) return;             // fetch failed - try again next poll
  const stats = connectionStats(players);       // R32: social proof, live
  const pairs = Math.floor(stats.connected / 2);
  $('pair-count').textContent =
    pairs > 0 ? pairs + (pairs === 1 ? ' pair' : ' pairs') + ' made so far' : '';
  if (connectedDone) return;                    // paired: keep the counter ticking only
  const mine = players.find(pl => pl.id === me.id);
  if (mine && bonusAwarded(mine, players)) {
    connectedDone = true;
    $('claim-status').textContent = 'Connected! +' + MATCH_BONUS + ' points for you both.';
    $('claim-form').style.display = 'none';
    celebrate(mine, players);                   // R33 then R31
  }
}

// R33 + R31: green flash, a big handshake, falling confetti, a chime - then
// the game hands over to its real mission: the conversation.
function celebrate(mine, players) {
  playChime();
  const cel = $('celebrate');
  cel.innerHTML = '<span id="celebrate-emoji">\u{1F91D}</span>';
  for (let i = 0; i < 12; i++) {                // 12 CSS divs, transform/opacity only
    const c = document.createElement('i');
    c.style.left = (4 + Math.random() * 92) + '%';
    c.style.background = Math.random() < 0.5 ? '#00b14f' : '#ffd76a';
    c.style.animationDelay = (Math.random() * 250) + 'ms';
    cel.appendChild(c);
  }
  cel.classList.add('show');
  setTimeout(() => { cel.classList.remove('show'); cel.innerHTML = ''; }, 1300);

  // R31: opener keyed to the PARTNER's commute. Keys must match
  // BUCKET_OPTIONS in js/config.js character for character.
  const OPENERS = {
    'Grab': 'Ask them their best back-seat story.',
    'Train / Bus / Walk': "Ask them the worst thing about their route - there's always one.",
    'Drive': 'Ask them where they park. Watch their face.',
    'Get dropped off': "Dropped off - by whom? There's a story there.",
  };
  const partner = players.find(pl => String(pl.slack_id) === mine.claimed_match);
  $('opener-head').textContent = '+' + MATCH_BONUS + ' banked. Now the real game: talk.';
  $('opener-prompt').textContent = (partner && OPENERS[partner.bucket]) || '';
  $('opener-card').style.display = 'block';
}
