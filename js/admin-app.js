import { GAME_NAME, MATCH_BONUS, HEAT_DURATION_MS } from './config.js';
import * as db from './db.js';
import { buildLeaderboard, computePairs, connectionStats } from './pairing.js';

const $ = id => document.getElementById(id);
let players = [];
let timerRunning = false;

init();

async function init() {
  document.title = GAME_NAME + ' - Control Room';
  $('admin-title').textContent = GAME_NAME + ' - Control Room';

  const playerUrl = location.href.replace(/admin\.html.*$/, '');
  new QRCode($('qr'), { text: playerUrl, width: 300, height: 300 });
  $('player-url').textContent = playerUrl;

  const state = await db.getGameState();
  const session = state ? state.session : 1;
  db.onPlayers(session, list => { players = list; render(); });
  db.onGameState(s => {
    if (!s) return;
    if (s.session !== session) { location.reload(); return; }  // reset from another tab
    setPhase(s.status);
  });
  if (state) setPhase(state.status);

  $('start-heat').addEventListener('click', startHeat);
  $('start-match').addEventListener('click', startMatchRound);
  for (const b of document.querySelectorAll('.new-game')) b.addEventListener('click', newGame);
}

function setPhase(status) {
  $('view-setup').classList.toggle('active', status === 'waiting');
  $('view-heat').classList.toggle('active', status === 'started');
  $('view-match').classList.toggle('active', status === 'match_round');
  if (status === 'started') runTimer();
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

function runTimer() {
  if (timerRunning) return;
  timerRunning = true;
  const total = HEAT_DURATION_MS / 1000 + 3; // 3s countdown + heat
  const t0 = Date.now();
  const iv = setInterval(() => {
    const left = Math.max(0, Math.ceil(total - (Date.now() - t0) / 1000));
    $('heat-timer').textContent = left;
    if (left === 0) clearInterval(iv);
  }, 250);
}

async function startMatchRound() {
  const played = players.filter(p => p.score !== null && p.score !== undefined);
  if (!confirm('Assign matches for ' + played.length + ' players who finished?')) return;
  try {
    const pairs = computePairs(played);
    await db.assignMatches(pairs, played);
    await db.setGameStatus('match_round');
  } catch (err) {
    alert('Match assignment failed: ' + err.message);
  }
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
    '<td>' + r.display_score + (r.connected ? ' 🤝' : '') + '</td></tr>').join('');
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
