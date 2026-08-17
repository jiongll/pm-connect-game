import { HEAT_DURATION_MS, MATCH_BONUS, ROOKIE_BONUS, HOME_FAMILY } from './config.js';
import * as db from './db.js';
import { bonusAwarded, buildLeaderboard, connectionStats } from './pairing.js';
import { computePhase } from './phase.js';
import { unlockAudio, playPairDing, playRevealSting, playChime } from './sound.js';

const $ = id => document.getElementById(id);
const ADMIN_TITLE = 'Grab Rush - PM Connect';
const ADMIN_PASS = 'grabrocket';        // client-side deterrent only - this file is public
const UNLOCK_KEY = 'grabrush_admin_ok';

let players = [];
let ticker = null;
let phase = 'setup';          // 'setup' | 'heat' | 'bonus' | 'over' - render() adapts per phase
let lastJoinCount = 0;        // R37: pulse the big number when it grows
let seenPairs = new Set();    // R42: canonical "a|b" keys already on the ticker
let pairsPrimed = false;      // first paint fills the ticker silently (mid-game refresh)
let nextDingAt = 0;           // R43: stacked pairs ding 300 ms apart, not at once
let revealStep = 0;           // R44: 0 hidden, 1 field (4th-10th), 2 third, 3 second, 4 first, 5 everything
let podiumShown = 0;          // podium lines already inserted (append-only, so each animates once)
let lastRevealPress = 0;

init();

// The gate. Client-side only by design (accepted trade-off): it keeps a
// curious player who scans the QR and edits the URL out of the control
// room, nothing more. sessionStorage survives a refresh, not a new tab.
function init() {
  document.title = ADMIN_TITLE;
  if (sessionStorage.getItem(UNLOCK_KEY) === '1') { boot(); return; }
  showView('gate');
  const tryUnlock = () => {
    unlockAudio();                      // first gesture arms the pair ding and podium sting
    if ($('admin-pass').value === ADMIN_PASS) {
      sessionStorage.setItem(UNLOCK_KEY, '1');
      $('gate-error').textContent = '';
      boot();
    } else {
      $('gate-error').textContent = 'Wrong password.';
    }
  };
  $('gate-btn').addEventListener('click', tryUnlock);
  $('admin-pass').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
}

async function boot() {
  showView('setup');
  $('bonus-rule').textContent =
    'Find someone from a different Tech Family who travels to the office a different way. '
    + 'Swap Slack IDs - you both type them in. +' + MATCH_BONUS + ' each. '
    + 'You can also find people on Slack.';

  // Both marks explained in one line, values read from config so the copy
  // cannot drift from the bonuses actually being applied. The wording and the
  // marks match the player-side bonus rows verbatim (renderBonusRows in
  // player-app.js): both screens are read in the same moment, so one bonus must
  // not carry two names. Non-breaking spaces after each emoji and a wide gap
  // between the two halves: plain spaces collapse in HTML and the marks end up
  // glued to their words.
  $('board-legend').textContent =
    '\u{1F91D} Paired successfully +' + MATCH_BONUS
    + '  \u{1F49A} From non-' + HOME_FAMILY + ' TF +' + ROOKIE_BONUS;

  const playerUrl = location.href.replace(/admin\.html.*$/, '');
  try { new QRCode($('qr'), { text: playerUrl, width: 420, height: 420 }); }
  catch { /* go/rush below is the fallback if the QR library fails */ }

  const state = await db.getGameState();
  if (!state) {
    $('admin-error').textContent =
      'Cannot reach the game server - check this laptop\'s connection and refresh.';
  }
  const session = state ? state.session : 1;
  db.onPlayers(session, list => { players = list; render(); });
  db.onGameState(s => {
    if (!s) return;
    if (s.session !== session) { location.reload(); return; }  // reset from another tab
    applyState(s);
  });
  if (state) applyState(state);

  $('start-heat').addEventListener('click', startHeat);
  for (const b of document.querySelectorAll('.new-game')) b.addEventListener('click', newGame);
  $('reveal-btn').addEventListener('click', revealPress);
  document.addEventListener('keydown', e => {      // R44: spacebar drives the reveal too
    if (e.key !== ' ' || phase !== 'over') return;
    if (!$('view-match').classList.contains('active')) return;
    if ($('modal-backdrop').classList.contains('visible')) return;
    e.preventDefault();
    revealPress();
  });
}

// One button starts the game; from there the shared clock drives the big
// screen through heat, bonus round, and final results on its own.
function applyState(state) {
  if (state.status !== 'started') { stopTicker(); setPhase('setup'); showView('setup'); return; }
  ensureTicker(state.started_at);
}

// The phase flag is what makes render() safe to call from anywhere:
// medals only at 'over', reveal state resets whenever we leave it.
function setPhase(p) {
  if (phase === p) return;
  phase = p;
  // Clear the tiles only - the trophy art is a permanent child of #podium (it is
  // ordered to sit beside the winner), so innerHTML='' here would delete it and
  // the next reveal would have no art at all.
  if (p !== 'over') {
    revealStep = 0; podiumShown = 0;
    for (const li of [...$('podium').querySelectorAll('li')]) li.remove();
  }
  render();
}

function showView(name) {
  for (const v of ['gate', 'setup', 'heat', 'match']) {
    $('view-' + v).classList.toggle('active', v === name);
  }
}

function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

// Anchored to started_at, not page load - refreshing the admin mid-game
// resumes at the right point in the timeline.
function ensureTicker(startedAt) {
  if (ticker) return;
  const tick = () => {
    const p = computePhase(startedAt, Date.now());
    if (!p || p.phase === 'heat') {
      setPhase('heat');
      showView('heat');
      const remaining = p ? p.heatRemainingMs : 0;
      // R11: heatRemainingMs includes the 3 s countdown - while it exceeds
      // the heat length, the phones are counting down, so mirror it here.
      if (p && remaining > HEAT_DURATION_MS) {
        showCountdown(Math.ceil((remaining - HEAT_DURATION_MS) / 1000));
      } else if (p && remaining > HEAT_DURATION_MS - 800) {
        showCountdown('GO!');
      } else {
        hideCountdown();
      }
      $('heat-timer').textContent = p ? Math.ceil(remaining / 1000) : '';
    } else if (p.phase === 'bonus') {
      hideCountdown();
      setPhase('bonus');
      showView('match');
      $('match-title').textContent = 'Bonus round';
      $('bonus-timer').textContent = Math.ceil(p.bonusRemainingMs / 1000) + 's';
    } else {
      hideCountdown();
      setPhase('over');
      showView('match');
      $('match-title').textContent = 'Final results';
      $('bonus-timer').textContent = '';
      stopTicker();          // the board keeps refreshing via onPlayers
    }
  };
  tick();
  ticker = setInterval(tick, 250);
}

// R11: the full-screen 3-2-1-GO, the phone's colours scaled up. The digit
// only re-renders on change so the pop animation fires once per number.
function showCountdown(v) {
  const num = $('admin-count-num');
  $('admin-countdown').classList.add('visible');
  const text = String(v);
  if (num.textContent === text) return;
  num.textContent = text;
  num.className = v === 'GO!' ? 'go' : 'c' + text;
  num.style.animation = 'none';
  void num.offsetWidth;                 // restart the pop per digit
  num.style.animation = '';
}

function hideCountdown() {
  $('admin-countdown').classList.remove('visible');
}

// R49: the four native browser dialogs painted grey system chrome on the
// projector at the most-watched moments. One promise-shaped modal replaces
// both kinds; confirming is also a user gesture, so it unlocks audio.
function showModal(title, line, { cancel = true, confirmLabel = 'Confirm' } = {}) {
  return new Promise(resolve => {
    $('modal-title').textContent = title;
    $('modal-line').textContent = line;
    $('modal-cancel').style.display = cancel ? '' : 'none';
    $('modal-confirm').textContent = confirmLabel;
    $('modal-backdrop').classList.add('visible');
    const done = val => {
      $('modal-backdrop').classList.remove('visible');
      $('modal-confirm').removeEventListener('click', onOk);
      $('modal-cancel').removeEventListener('click', onNo);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onOk = () => { unlockAudio(); done(true); };
    const onNo = () => done(false);
    const onKey = e => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') { unlockAudio(); done(true); }
    };
    $('modal-confirm').addEventListener('click', onOk);
    $('modal-cancel').addEventListener('click', onNo);
    document.addEventListener('keydown', onKey);
  });
}
const modalConfirm = (title, line) => showModal(title, line);
const modalAlert = (title, line) => showModal(title, line, { cancel: false, confirmLabel: 'OK' });

async function startHeat() {
  const ok = await modalConfirm('Start the match', 'Start the match for ' + players.length + ' players?');
  if (!ok) return;
  try { await db.setGameStatus('started'); }
  catch (err) { await modalAlert('Could not start the match', err.message); }
}

// The reset. Bumps the session; every phone returns to the join screen.
// Reloading afterwards re-subscribes this page to the new session.
async function newGame() {
  const ok = await modalConfirm('Start a new game?',
    'Everyone goes back to the join screen and the board clears.');
  if (!ok) return;
  try { await db.newSession(); location.reload(); }
  catch (err) { await modalAlert('Could not reset the game', err.message); }
}

// R44: the reveal. The board has been hidden since the heat ended, so there
// is finally something to reveal. Each press (or space): the chasing pack
// (places 4-10), then 3rd, 2nd, 1st, then the full board and the awards.
// A quick double-press skips to everything. With three drivers or fewer
// there is no pack to tease, so the first press goes straight to 3rd.
function revealPress() {
  if (phase !== 'over') return;
  unlockAudio();
  const now = Date.now();
  if (now - lastRevealPress < 350) revealStep = 5;
  else revealStep = Math.min(revealStep + 1, 5);
  // Only the row COUNT is read here, which no bonus changes - but the args
  // stay in step with render() so the two can never disagree.
  if (revealStep === 1
      && buildLeaderboard(players, MATCH_BONUS, ROOKIE_BONUS).length <= 3) revealStep = 2;
  lastRevealPress = now;
  if (revealStep === 1) playChime();
  if (revealStep >= 2 && revealStep <= 4) playRevealSting(revealStep - 2);
  render();
}

// 'setup' counts as running: no heat has finished, so no bonus is due yet.
function heatRunning() { return phase === 'setup' || phase === 'heat'; }

function render() {
  renderJoinLine();
  $('join-list').innerHTML = players.map(p =>
    '<span class="chip">@' + esc(p.slack_id) +
    ' <small>' + esc(p.tech_family) + '</small></span>').join('');

  // The rookie bonus lands at the END, not during the heat: mid-heat the
  // board climbs on real coins only, so a driver never watches a rival sit
  // 25 points ahead for a reason the big screen has not explained yet. Once
  // the heat is done it applies for the rest of the night.
  const rows = buildLeaderboard(players, MATCH_BONUS,
                                heatRunning() ? 0 : ROOKIE_BONUS, HOME_FAMILY);
  const html = rows.map(rowHtml).join('');
  $('board-heat').innerHTML = html;
  $('board-match').innerHTML = html;
  $('finished-count').textContent = rows.length;
  $('racing-line').textContent =
    players.length + (players.length === 1 ? ' driver racing' : ' drivers racing');
  // R41: no wall of alphabetical zeros - the heat board only appears once
  // real scores land (defensive: they normally land at the buzzer).
  $('board-heat').parentElement.style.display = rows.length ? '' : 'none';

  const stats = connectionStats(players);
  $('connected-count').textContent = stats.connected + ' of ' + stats.total + ' connected';

  renderPairs();
  renderFinal(rows);
}

// R38: an empty stage should invite, not report. R37: each join pulses the
// big number - a witnessed micro-event that nudges the next scan.
function renderJoinLine() {
  if (players.length === 0) {
    $('join-count').textContent = '';
    $('join-label').textContent = 'Waiting for the first driver...';
  } else {
    $('join-count').textContent = players.length;
    $('join-label').textContent = ' in the waiting room';
  }
  if (players.length > lastJoinCount) {
    const el = $('join-count');
    el.classList.remove('bump');
    void el.offsetWidth;                // restart the animation
    el.classList.add('bump');
  }
  lastJoinCount = players.length;
}

// R45: medals only once the game is over - during the bonus round the board
// is hidden anyway, and mid-heat medals would crown a wall of zeros.
function medal(i) {
  if (phase !== 'over') return '';
  return ['\u{1F451} ', '\u{1F948} ', '\u{1F949} '][i] || '';   // crown, silver, bronze
}

// Two marks, both explained by the legend under the board: handshake for a
// made connection, green heart for the away-team head start. They must stay in
// step with that legend and with the player-side rows - the legend is the key to
// this table, so a mark here that the legend does not show explains nothing.
// They read as earned decoration rather than an asterisk on the score.
function rowHtml(r, i) {
  return '<tr class="' + (r.connected ? 'connected' : '') + '">' +
    '<td>' + medal(i) + (i + 1) + '</td><td>@' + esc(r.slack_id) + '</td>' +
    '<td>' + esc(r.tech_family) + '</td>' +
    '<td>' + r.display_score + (r.connected ? ' \u{1F91D}' : '')
           + (r.rookie ? ' \u{1F49A}' : '') + '</td></tr>';
}

// R42/R43: pairs appear on the billboard as they land, each with a soft
// ding. Keys are the two ids sorted, so each pair lands exactly once
// however the two mutual claims arrive; a mid-game refresh refills the
// ticker silently (pairsPrimed) instead of replaying every ding.
function renderPairs() {
  const byId = new Map(players.map(p => [p.slack_id, p]));
  const fresh = [];
  for (const p of players) {
    if (!p.claimed_match || !bonusAwarded(p, players)) continue;
    const key = [p.slack_id, p.claimed_match].sort().join('|');
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const mate = byId.get(p.claimed_match);
    fresh.push('@' + esc(p.slack_id) + ' \u{1F91D} @' + esc(p.claimed_match)
      + ' - ' + esc(p.tech_family) + ' × ' + esc(mate ? mate.tech_family : '?'));
  }
  for (const line of fresh) {
    const li = document.createElement('li');
    li.innerHTML = line;
    $('pair-ticker').prepend(li);       // newest on top
    if (pairsPrimed && phase === 'bonus') queueDing();
  }
  while ($('pair-ticker').children.length > 6) $('pair-ticker').lastElementChild.remove();
  pairsPrimed = true;

  const n = seenPairs.size;
  const text = n + (n === 1 ? ' pair' : ' pairs');
  const counter = $('pair-counter');
  if (counter.textContent !== text) {   // pulse only on change
    counter.textContent = text;
    counter.classList.remove('bump');
    void counter.offsetWidth;
    counter.classList.add('bump');
  }
}

function queueDing() {
  const now = performance.now();
  nextDingAt = Math.max(now, nextDingAt);
  setTimeout(playPairDing, nextDingAt - now);
  nextDingAt += 300;
}

// The final act: bonus billboard while the round runs, then the staged
// podium reveal (R44) with medals (R45) and the awards (R46-R48).
function renderFinal(rows) {
  const over = phase === 'over';
  $('bonus-billboard').style.display = over ? 'none' : '';
  $('reveal-bar').style.display = (over && revealStep < 5) ? '' : 'none';
  $('field').style.display = (over && revealStep === 1) ? '' : 'none';
  $('podium-stage').style.display = (over && revealStep >= 2 && revealStep < 5) ? '' : 'none';
  // The trophy art belongs to the winner, so it arrives on the press that
  // reveals 1st place - not with 3rd and 2nd, where it would give away who is
  // still to come. `hidden` rather than display so the CSS keeps one source of
  // truth for the layout.
  $('podium-art').hidden = !(over && revealStep >= 4);
  $('awards').style.display = (over && revealStep >= 5) ? '' : 'none';
  $('board-match').parentElement.style.display = (over && revealStep >= 5) ? '' : 'none';
  $('board-legend').style.display = (over && revealStep >= 5) ? '' : 'none';   // travels with its board
  if (!over) return;

  // Step 1 teases the chasing pack: places 4-10, podium withheld.
  $('board-field').innerHTML = rows.slice(3, 10).map((r, k) => rowHtml(r, k + 3)).join('');

  const podium = rows.slice(0, 3);
  const places = [                      // press order: 3rd, then 2nd, then 1st
    { idx: 2, cls: 'p3', label: '\u{1F949} 3rd' },
    { idx: 1, cls: 'p2', label: '\u{1F948} 2nd' },
    { idx: 0, cls: 'p1', label: '\u{1F451} 1st' },
  ];
  const want = Math.min(Math.max(revealStep - 1, 0), 3);
  while (podiumShown < want) {
    const place = places[podiumShown];
    podiumShown += 1;
    const r = podium[place.idx];
    if (!r) continue;                   // fewer than three drivers: skip the gap
    const li = document.createElement('li');
    li.className = place.cls;
    li.innerHTML = place.label + '<br>@' + esc(r.slack_id)
      + '<small>' + esc(r.tech_family) + '</small><b>' + r.display_score + '</b>';
    $('podium').appendChild(li);
  }
  if (revealStep >= 5) $('awards').innerHTML = awardsHtml(rows);
}

// R46/R47/R48: three award lines under the final board - warm, short, and
// computed from data already on the page. The Scenic Route line never
// mentions the score, and never fires with so few players that it stings.
function awardsHtml(rows) {
  const out = [];
  if (rows.length >= 3) {
    const last = rows[rows.length - 1];
    out.push('<p class="award">Scenic Route Award: @' + esc(last.slack_id)
      + ' - saw every cone personally. Legend.</p>');
  }
  const byTf = new Map();
  for (const r of rows) {
    if (!byTf.has(r.tech_family)) byTf.set(r.tech_family, []);
    byTf.get(r.tech_family).push(r.display_score);
  }
  let best = null;
  for (const [tf, scores] of byTf) {
    if (scores.length < 3) continue;    // R47: tiny families skew averages
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (!best || avg > best.avg) best = { tf, avg };
  }
  if (best) {
    out.push('<p class="award">Fastest fleet: ' + esc(best.tf) + ' (avg ' + best.avg + ')</p>');
  }
  const total = rows.reduce((a, r) => a + r.display_score, 0);
  const pairs = seenPairs.size;
  out.push('<p class="award">Together you banked ' + total.toLocaleString('en')
    + ' points and made ' + pairs + (pairs === 1 ? ' connection.' : ' connections.') + '</p>');
  return out.join('');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
