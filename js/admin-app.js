import { MATCH_BONUS } from './config.js';
import * as db from './db.js';
import { buildLeaderboard, connectionStats } from './pairing.js';
import { computePhase } from './phase.js';

const $ = id => document.getElementById(id);
const ADMIN_TITLE = 'PM Connect - GrabRush!';
const ADMIN_PASS = 'grabrocket';        // client-side deterrent only - this file is public
const UNLOCK_KEY = 'grabrush_admin_ok';

let players = [];
let ticker = null;

init();

// The gate. Client-side only by design (accepted trade-off): it keeps a
// curious player who scans the QR and edits the URL out of the control
// room, nothing more. sessionStorage survives a refresh, not a new tab.
function init() {
  document.title = ADMIN_TITLE;
  $('admin-title').textContent = ADMIN_TITLE;
  if (sessionStorage.getItem(UNLOCK_KEY) === '1') { boot(); return; }
  showView('gate');
  const tryUnlock = () => {
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

  const playerUrl = location.href.replace(/admin\.html.*$/, '');
  try { new QRCode($('qr'), { text: playerUrl, width: 300, height: 300 }); }
  catch { /* the plain URL below is the fallback */ }
  $('player-url').textContent = playerUrl;

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
}

// One button starts the game; from there the shared clock drives the big
// screen through heat, bonus round, and final results on its own.
function applyState(state) {
  if (state.status !== 'started') { stopTicker(); showView('setup'); return; }
  ensureTicker(state.started_at);
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
      showView('heat');
      $('heat-timer').textContent = p ? Math.ceil(p.heatRemainingMs / 1000) : '';
    } else if (p.phase === 'bonus') {
      showView('match');
      $('match-title').textContent = 'Bonus round';
      $('bonus-timer').textContent = Math.ceil(p.bonusRemainingMs / 1000) + 's';
      $('bonus-rule').style.display = '';
    } else {
      showView('match');
      $('match-title').textContent = 'Final results';
      $('bonus-timer').textContent = '';
      $('bonus-rule').style.display = 'none';
      stopTicker();          // the board keeps refreshing via onPlayers
    }
  };
  tick();
  ticker = setInterval(tick, 250);
}

async function startHeat() {
  if (!confirm('Start the heat for ' + players.length + ' players?')) return;
  try { await db.setGameStatus('started'); }
  catch (err) { alert(err.message); }
}

// The reset. Bumps the session; every phone returns to the join screen.
// Reloading afterwards re-subscribes this page to the new session.
async function newGame() {
  if (!confirm('Start a new game? Everyone goes back to the join screen and the board clears.')) return;
  try { await db.newSession(); location.reload(); }
  catch (err) { alert(err.message); }
}

function render() {
  $('join-count').textContent = players.length;
  $('join-list').innerHTML = players.map(p =>
    '<span class="chip">@' + esc(p.slack_id) +
    ' <small>' + esc(p.tech_family) + '</small></span>').join('');

  const rows = buildLeaderboard(players, MATCH_BONUS);
  const html = rows.map((r, i) =>
    '<tr class="' + (r.connected ? 'connected' : '') + '">' +
    '<td>' + (i + 1) + '</td><td>@' + esc(r.slack_id) + '</td>' +
    '<td>' + esc(r.tech_family) + '</td>' +
    '<td>' + r.display_score + (r.connected ? ' \u{1F91D}' : '') + '</td></tr>').join('');
  $('board-heat').innerHTML = html;
  $('board-match').innerHTML = html;
  $('finished-count').textContent = rows.length;

  const stats = connectionStats(players);
  $('connected-count').textContent = stats.connected + ' of ' + stats.total + ' connected';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
