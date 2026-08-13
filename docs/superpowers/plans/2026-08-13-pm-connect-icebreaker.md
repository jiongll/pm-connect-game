# PM Connect Ice Breaker ("Grab Rush") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first web game (90-second synchronised driving heat + cross-Tech-Family match round) served from GitHub Pages with a Supabase free-tier backend, run from a separate admin/projector page.

**Architecture:** Two static pages (`index.html` for players, `admin.html` for the facilitator) share one Supabase project holding two tables (`players`, `game_state`). All game logic runs client-side; Supabase provides joins, score writes, the start signal, match assignments, and realtime updates (with polling fallback). Pure logic (scoring, pairing, leaderboard) lives in dependency-free ES modules unit-tested with `node --test`; browser files are verified in the in-app preview and on a real phone at three milestones.

**Tech Stack:** Plain HTML/CSS/JS (ES modules, no framework, no build step), Canvas 2D, Supabase JS v2 via CDN, qrcodejs via CDN, GitHub Pages hosting, Node 20+ built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-13-pm-connect-icebreaker-design.md`

## Global Constraints

- No build step, no bundler, no npm runtime dependencies. `package.json` exists only so `node --test` runs. Node 20+.
- Supabase JS v2 loaded via `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` (exposes global `window.supabase`).
- All tunable numbers and lists live in `js/config.js`. All trivia lives in `js/questions.js`. Both are marked PLACEHOLDER where content is not final.
- Game name is **"Grab Rush"** (placeholder, single definition in `js/config.js`).
- Heat duration 90 000 ms. Match bonus 35 points. Coin +2. Collision −5 (score floor 0). Tier bonus 10 per tier at game end. A correct gate answer while already Exec pays +10 run points (late gates stay worth playing).
- Tiers, in order: `Standard, Plus, Premium, Exec`.
- The Supabase anon key is public by design. RLS allows select/insert/update to `anon` and **never delete**.
- UI copy: British English, no em dashes. Every user-visible failure state has copy — no silent failures.
- Phone-first portrait. Lane change by tapping left/right half of the canvas AND ArrowLeft/ArrowRight keys (virtual attendees on laptops).
- All players get trivia questions in the identical order (fairness). No shuffling.
- Real Grab palette (Duxton green tokens where available) with stylised look-alike shapes for coins and cars. No proprietary Grab asset files (logos, fonts, images) in this public repo — owner approved this line 2026-08-13.
- Task 0 (owner accounts) blocks Task 1's live verification and Tasks 7-9 end-to-end checks. Tasks 2-6 need no accounts and may proceed while waiting.

## Known accepted trade-offs (do not "fix" these)

- Start-signal skew up to ~3 s between clients (realtime vs poll fallback); every client still gets a full local 90 s.
- A player who refreshes mid-heat rejoins and plays a fresh full 90 s. Facilitator handles abuse socially.
- Any client with the anon key can update rows (internal event, accepted in spec). No delete policy is the guardrail.
- Reset/restart is the admin **"Start new game"** button: it bumps `game_state.session`, every client snaps back to the join screen, and all reads filter to the current session. Old rows are kept but ignored — the public key still cannot delete anything. `docs/reset.sql` is only the after-the-event full wipe.

## File structure

```
pm-connect-game/
├── index.html            player page (entry → waiting → countdown → game → results/match)
├── admin.html            facilitator page (QR + waiting room → heat → match round)
├── plumbing.html         Supabase connectivity proof + diagnostics (kept forever)
├── dev.html              solo game harness (no backend; for tuning)
├── css/style.css         all styling, both pages
├── js/config.js          credentials + every tunable
├── js/questions.js       trivia (PLACEHOLDER)
├── js/scoring.js         pure: score/tier maths            [unit tested]
├── js/pairing.js         pure: pairs/bonus/leaderboard      [unit tested]
├── js/db.js              Supabase wrapper (browser-only)
├── js/game.js            canvas game (browser-only)
├── js/player-app.js      player page state machine
├── js/admin-app.js       admin page controller
├── tests/scoring.test.js
├── tests/pairing.test.js
├── docs/facilitator-script.md
├── docs/reset.sql
├── package.json
├── .claude/launch.json
├── .gitignore
└── README.md
```

---

### Task 0: Owner accounts and backend (HUMAN — click-by-click)

**Files:** none (external services). Produces two credential strings consumed by Task 1.

**Interfaces:**
- Produces: a GitHub account with `gh` authenticated; a Supabase project with tables `players` and `game_state`, RLS policies, realtime enabled; the **Project URL** and **anon (publishable) key**.

- [ ] **Step 1: Create GitHub account** — at https://github.com/signup with a personal email. Note the username.

- [ ] **Step 2: Authenticate the gh CLI** (owner runs, assistant can drive):

```bash
which gh || brew install gh
gh auth login --web
```

Choose: GitHub.com → HTTPS → Login with a web browser → copy the one-time code → paste in browser. Expected: `✓ Logged in as <username>`.

- [ ] **Step 3: Create Supabase account** — at https://supabase.com, "Start your project", **sign in with GitHub** (reuses the account from Step 1).

- [ ] **Step 4: Create project** — New project → any name (`pm-connect-game`) → generate a database password (not needed again, but save it in a password manager) → Region **Southeast Asia (Singapore)** → Free plan → Create. Wait ~2 min for provisioning.

- [ ] **Step 5: Create tables and policies** — left sidebar **SQL Editor** → New query → paste ALL of the following → Run. Expected: `Success. No rows returned`.

```sql
-- Tables
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  session int not null default 1,
  slack_id text not null,
  tech_family text not null,
  bucket text not null,
  score int,
  match_slack_id text,
  claimed_match text,
  created_at timestamptz not null default now(),
  unique (slack_id, session)
);

create table if not exists game_state (
  id int primary key,
  status text not null default 'waiting',
  started_at timestamptz,
  session int not null default 1
);
insert into game_state (id, status) values (1, 'waiting')
on conflict (id) do nothing;

-- Row Level Security: the public key may read, insert and update - never delete.
alter table players enable row level security;
alter table game_state enable row level security;

create policy "players_select" on players for select to anon using (true);
create policy "players_insert" on players for insert to anon with check (true);
create policy "players_update" on players for update to anon using (true) with check (true);

create policy "game_state_select" on game_state for select to anon using (true);
create policy "game_state_update" on game_state for update to anon using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table game_state;
```

- [ ] **Step 6: Copy the two strings** — Project Settings (gear icon) → **API** (or "API Keys"). Copy **Project URL** (`https://xxxx.supabase.co`) and the **anon / public** key (long `eyJ…` string; newer dashboards call it "publishable"). Hand both to the assistant. NOT the `service_role` key — that one stays secret and unused.

---

### Task 1: Scaffold + plumbing proof, live on GitHub Pages

**Files:**
- Create: `package.json`, `.gitignore`, `.claude/launch.json`, `js/config.js`, `plumbing.html`, `README.md`

**Interfaces:**
- Consumes: Task 0 credentials.
- Produces: `js/config.js` exporting `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GAME_NAME`, `HEAT_DURATION_MS`, `MATCH_BONUS`, `COIN_POINTS`, `COLLISION_PENALTY`, `TIER_BONUS`, `TECH_FAMILIES`, `BUCKET_QUESTION`, `BUCKET_OPTIONS`. A live `https://<username>.github.io/pm-connect-game/` URL. This is the spec's go/no-go gate for the whole Supabase approach.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "pm-connect-game",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
.DS_Store
node_modules/
```

- [ ] **Step 3: Write `.claude/launch.json`** (local preview server)

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "static",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8080", "--bind", "127.0.0.1"],
      "port": 8080
    }
  ]
}
```

- [ ] **Step 4: Write `js/config.js`** — real credentials from Task 0 go straight in (they are public-by-design):

```js
// ── Backend (from Task 0) ────────────────────────────────────────────
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';   // ← replace
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';                  // ← replace

// ── Event tunables ───────────────────────────────────────────────────
export const GAME_NAME = 'Grab Rush';            // PLACEHOLDER name
export const HEAT_DURATION_MS = 90_000;
export const MATCH_BONUS = 35;
export const COIN_POINTS = 2;
export const COLLISION_PENALTY = 5;
export const TIER_BONUS = 10;                    // points per tier at game end

// PLACEHOLDER list - replace with the real Tech Family names before the event.
export const TECH_FAMILIES = [
  'Mobility',
  'Deliveries',
  'Financial Services',
  'Marketplace & Ads',
  'Geo / Maps',
  'Platform & Infra',
  'Data & AI',
  'Other',
];

// PLACEHOLDER bucket question - may be swapped before the event.
export const BUCKET_QUESTION = 'How do you commute to work?';
export const BUCKET_OPTIONS = ['Grab', 'Train / Bus / Walk', 'Drive', 'Get dropped off'];
```

- [ ] **Step 5: Write `plumbing.html`** — self-contained connectivity proof:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plumbing test</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<style>
  body { font-family: system-ui; margin: 2rem; background: #111; color: #eee; }
  button { font-size: 1.1rem; padding: .6rem 1rem; margin: 0 .5rem .5rem 0; }
  #log { white-space: pre-wrap; background: #000; padding: 1rem; margin-top: 1rem; border-radius: 8px; }
</style>
</head>
<body>
<h1>Supabase plumbing test</h1>
<button id="write">1. Write test row</button>
<button id="read">2. Read all rows</button>
<button id="live">3. Go live</button>
<div id="log"></div>
<script type="module">
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './js/config.js';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const log = m => document.getElementById('log').textContent += m + '\n';

document.getElementById('write').onclick = async () => {
  const { data, error } = await client.from('players')
    .insert({ slack_id: 'test-' + Math.random().toString(36).slice(2, 7),
              tech_family: 'Test', bucket: 'Test' })
    .select().single();
  log(error ? 'WRITE FAILED: ' + error.message : 'WROTE: ' + data.slack_id);
};
document.getElementById('read').onclick = async () => {
  const { data, error } = await client.from('players').select('*');
  log(error ? 'READ FAILED: ' + error.message
            : 'READ ' + data.length + ' rows: ' + data.map(r => r.slack_id).join(', '));
};
document.getElementById('live').onclick = () => {
  client.channel('test')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' },
        p => log('LIVE EVENT: ' + p.eventType + ' ' + (p.new?.slack_id ?? '')))
    .subscribe(s => log('SUBSCRIPTION: ' + s));
  log('Listening... now press "Write" in another tab or on your phone.');
};
</script>
</body>
</html>
```

- [ ] **Step 6: Write `README.md`**

```markdown
# Grab Rush — PM Connect ice breaker

Phone-first driving game + cross-Tech-Family match round. Static site (GitHub
Pages) + Supabase free tier. No build step.

- Players: `index.html` (QR from the admin page)
- Facilitator: `admin.html` (projector)
- Diagnostics: `plumbing.html`
- Solo game tuning: `dev.html`
- Run of show: `docs/facilitator-script.md`
- Reset between rehearsals: press "Start new game" on the admin page

Local dev: `python3 -m http.server 8080` then http://localhost:8080/
Tests: `npm test`
```

- [ ] **Step 7: Verify locally** — start the `static` preview server, open `http://localhost:8080/plumbing.html`. Click buttons 1, 2, 3 in order, then 1 again. Expected log lines: `WROTE: test-xxxxx`, `READ n rows: …`, `SUBSCRIPTION: SUBSCRIBED`, then `LIVE EVENT: INSERT test-yyyyy` after the second write. Any FAILED line → stop, fix credentials/SQL before proceeding.

- [ ] **Step 8: Commit and push to a new public repo**

```bash
git add -A
git commit -m "feat: scaffold + supabase plumbing proof"
gh repo create pm-connect-game --public --source . --push
```

Expected: repo URL printed.

- [ ] **Step 9: Enable GitHub Pages** (owner, in browser) — repo → Settings → Pages → Source "Deploy from a branch" → Branch `main`, folder `/ (root)` → Save. Wait 2-3 min. Live URL: `https://<username>.github.io/pm-connect-game/`.

- [ ] **Step 10: Verify live on a real phone** — open `https://<username>.github.io/pm-connect-game/plumbing.html` on the owner's phone (mobile data, not office wifi). Repeat Step 7's clicks. All green = **the spec's riskiest assumption is proven**. Record the live URL in README (edit, commit, push).

---

### Task 2: Scoring module (TDD)

**Files:**
- Create: `js/scoring.js`
- Test: `tests/scoring.test.js`

**Interfaces:**
- Consumes: `COIN_POINTS`, `COLLISION_PENALTY`, `TIER_BONUS` from `js/config.js`.
- Produces: `TIERS: string[4]`, `collectCoin(score:number):number`, `hitObstacle(score:number):number`, `answerQuestion(tier:number, correct:boolean):number`, `tierPoints(tier:number):number`, `finalScore(runScore:number, tier:number):number`, `tierSpeedMultiplier(tier:number):number`, `tierHasMagnet(tier:number):boolean`.

- [ ] **Step 1: Write the failing tests** — `tests/scoring.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, collectCoin, hitObstacle, answerQuestion,
  tierPoints, finalScore, tierSpeedMultiplier, tierHasMagnet,
} from '../js/scoring.js';

test('four tiers in order', () => {
  assert.deepEqual(TIERS, ['Standard', 'Plus', 'Premium', 'Exec']);
});
test('coin adds points', () => assert.equal(collectCoin(10), 12));
test('obstacle subtracts but never below zero', () => {
  assert.equal(hitObstacle(10), 5);
  assert.equal(hitObstacle(3), 0);
});
test('correct answer upgrades one tier, capped at Exec', () => {
  assert.equal(answerQuestion(0, true), 1);
  assert.equal(answerQuestion(3, true), 3);
});
test('wrong answer changes nothing - no gain, no penalty', () => {
  assert.equal(answerQuestion(2, false), 2);
  assert.equal(answerQuestion(0, false), 0);
});
test('tier points are 10 per tier', () => {
  assert.equal(tierPoints(0), 0);
  assert.equal(tierPoints(3), 30);
});
test('final score adds tier points to run score', () => {
  assert.equal(finalScore(80, 2), 100);
});
test('speed rises with tier', () => {
  assert.ok(tierSpeedMultiplier(3) > tierSpeedMultiplier(0));
  assert.equal(tierSpeedMultiplier(0), 1);
});
test('coin magnet from Premium up', () => {
  assert.equal(tierHasMagnet(0), false);
  assert.equal(tierHasMagnet(1), false);
  assert.equal(tierHasMagnet(2), true);
  assert.equal(tierHasMagnet(3), true);
});
```

- [ ] **Step 2: Run tests, verify they fail** — `npm test`. Expected: FAIL, cannot find module `../js/scoring.js`.

- [ ] **Step 3: Write `js/scoring.js`**

```js
import { COIN_POINTS, COLLISION_PENALTY, TIER_BONUS } from './config.js';

export const TIERS = ['Standard', 'Plus', 'Premium', 'Exec'];

export function collectCoin(score) { return score + COIN_POINTS; }
export function hitObstacle(score) { return Math.max(0, score - COLLISION_PENALTY); }
export function answerQuestion(tier, correct) {
  return correct ? Math.min(tier + 1, TIERS.length - 1) : tier;
}
export function tierPoints(tier) { return tier * TIER_BONUS; }
export function finalScore(runScore, tier) { return runScore + tierPoints(tier); }
export function tierSpeedMultiplier(tier) { return 1 + tier * 0.06; }
export function tierHasMagnet(tier) { return tier >= 2; }
```

- [ ] **Step 4: Run tests, verify they pass** — `npm test`. Expected: 9 pass, 0 fail.

- [ ] **Step 5: Commit** — `git add js/scoring.js tests/scoring.test.js && git commit -m "feat: scoring and tier logic"`

---

### Task 3: Pairing + leaderboard module (TDD)

**Files:**
- Create: `js/pairing.js`
- Test: `tests/pairing.test.js`

**Interfaces:**
- Consumes: `MATCH_BONUS` from `js/config.js`. Player rows shaped `{slack_id, tech_family, bucket, score?, match_slack_id?, claimed_match?}`.
- Produces: `computePairs(players):[string,string][]` (reciprocal, same bucket, different tech_family, each player at most once), `bonusAwarded(player, allPlayers):boolean`, `buildLeaderboard(players, matchBonus?):{slack_id,tech_family,display_score,connected}[]` (sorted desc, non-finishers excluded), `connectionStats(players):{connected:number,total:number}`.

- [ ] **Step 1: Write the failing tests** — `tests/pairing.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePairs, bonusAwarded, buildLeaderboard, connectionStats } from '../js/pairing.js';

const P = (slack_id, tech_family, bucket, extra = {}) =>
  ({ slack_id, tech_family, bucket, ...extra });

test('pairs same bucket, different tech family', () => {
  const pairs = computePairs([P('a', 'Mobility', 'Drive'), P('b', 'Deliveries', 'Drive')]);
  assert.equal(pairs.length, 1);
  assert.deepEqual(new Set(pairs[0]), new Set(['a', 'b']));
});

test('never pairs within the same tech family', () => {
  const pairs = computePairs([P('a', 'Mobility', 'Drive'), P('b', 'Mobility', 'Drive')]);
  assert.equal(pairs.length, 0);
});

test('never pairs across buckets', () => {
  const pairs = computePairs([P('a', 'Mobility', 'Drive'), P('b', 'Deliveries', 'Grab')]);
  assert.equal(pairs.length, 0);
});

test('maximises pairs when tech families are skewed', () => {
  const pairs = computePairs([
    P('m1', 'Mobility', 'Drive'), P('m2', 'Mobility', 'Drive'), P('m3', 'Mobility', 'Drive'),
    P('d1', 'Deliveries', 'Drive'), P('f1', 'Fin', 'Drive'),
  ]);
  assert.equal(pairs.length, 2); // 3 Mobility soak up the two singletons; one left over
});

test('each player appears in at most one pair', () => {
  const players = [
    P('a', 'X', 'B1'), P('b', 'Y', 'B1'), P('c', 'X', 'B1'), P('d', 'Z', 'B1'),
    P('e', 'X', 'B2'), P('f', 'Y', 'B2'),
  ];
  const seen = new Set();
  for (const [x, y] of computePairs(players)) {
    assert.ok(!seen.has(x) && !seen.has(y), 'player appeared twice');
    seen.add(x); seen.add(y);
  }
});

test('bonus needs mutual claims of the assigned match', () => {
  const a = P('a', 'X', 'B', { match_slack_id: 'b', claimed_match: 'b' });
  const b = P('b', 'Y', 'B', { match_slack_id: 'a', claimed_match: 'a' });
  const c = P('c', 'Z', 'B', { match_slack_id: 'd', claimed_match: 'wrong' });
  const d = P('d', 'X', 'B', { match_slack_id: 'c', claimed_match: 'c' });
  const all = [a, b, c, d];
  assert.equal(bonusAwarded(a, all), true);
  assert.equal(bonusAwarded(b, all), true);
  assert.equal(bonusAwarded(c, all), false); // typed the wrong ID
  assert.equal(bonusAwarded(d, all), false); // partner has not reciprocated correctly
});

test('no bonus without an assigned match or without a claim', () => {
  const solo = P('s', 'X', 'B', { claimed_match: 'a' });
  const quiet = P('q', 'X', 'B', { match_slack_id: 'a' });
  assert.equal(bonusAwarded(solo, [solo]), false);
  assert.equal(bonusAwarded(quiet, [quiet]), false);
});

test('leaderboard adds bonus, sorts desc, excludes non-finishers', () => {
  const a = P('a', 'X', 'B', { score: 100, match_slack_id: 'b', claimed_match: 'b' });
  const b = P('b', 'Y', 'B', { score: 50, match_slack_id: 'a', claimed_match: 'a' });
  const c = P('c', 'Z', 'B', { score: 120 });
  const late = P('z', 'Z', 'B', { score: null });
  const rows = buildLeaderboard([a, b, c, late], 35);
  assert.deepEqual(rows.map(r => r.slack_id), ['a', 'c', 'b']); // 135, 120, 85
  assert.equal(rows[0].display_score, 135);
  assert.equal(rows[0].connected, true);
  assert.equal(rows[1].connected, false);
  assert.equal(rows.length, 3);
});

test('connection stats count matched players only', () => {
  const a = P('a', 'X', 'B', { match_slack_id: 'b', claimed_match: 'b' });
  const b = P('b', 'Y', 'B', { match_slack_id: 'a', claimed_match: 'a' });
  const c = P('c', 'Z', 'B', { match_slack_id: 'd' });
  const d = P('d', 'X', 'B', { match_slack_id: 'c' });
  const e = P('e', 'X', 'B');
  const s = connectionStats([a, b, c, d, e]);
  assert.equal(s.total, 4);
  assert.equal(s.connected, 2);
});
```

- [ ] **Step 2: Run tests, verify they fail** — `npm test`. Expected: FAIL, cannot find module `../js/pairing.js`.

- [ ] **Step 3: Write `js/pairing.js`**

```js
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
```

- [ ] **Step 4: Run tests, verify they pass** — `npm test`. Expected: all scoring + pairing tests pass (18 total), 0 fail.

- [ ] **Step 5: Commit** — `git add js/pairing.js tests/pairing.test.js && git commit -m "feat: pairing, bonus and leaderboard logic"`

---

### Task 4: Database wrapper + placeholder trivia

**Files:**
- Create: `js/db.js`, `js/questions.js`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` from `js/config.js`; global `window.supabase` (CDN).
- Produces (`js/db.js`): `normaliseSlackId(raw):string`, `joinGame(slackId, techFamily, bucket):Promise<PlayerRow>` (writes into the current session), `getPlayer(id):Promise<PlayerRow>`, `getPlayers(session):Promise<PlayerRow[]>`, `getGameState():Promise<{id,status,started_at,session}|null>`, `setGameStatus(status):Promise<void>`, `newSession():Promise<void>` (the "Start new game" reset — bumps the session, deletes nothing), `submitScore(playerId, score):Promise<boolean>` (3 retries, never throws), `assignMatches(pairs, allPlayers):Promise<void>`, `claimMatch(playerId, claimedSlackId):Promise<void>`, and subscription helpers `onGameState(cb)`, `onPlayers(session, cb)`, `onOwnRow(playerId, cb)` — each realtime + polling fallback, each returning an unsubscribe function. **Callbacks must tolerate repeated calls with identical data** (poll and realtime overlap by design).
- Produces (`js/questions.js`): `QUESTIONS: {q:string, options:[string,string,string], correct:0|1|2}[]`.

- [ ] **Step 1: Write `js/questions.js`**

```js
// ── PLACEHOLDER CONTENT ──────────────────────────────────────────────
// Replace before the event. Keep the shape exactly: three options,
// `correct` is the index of the right one. Mix roughly 40% Mobility /
// 60% playful Grab-wide. The game shows questions in this exact order
// for every player (fairness), six gates per 90-second heat.
export const QUESTIONS = [
  { q: 'What does "AB" stand for in Grab Mobility?',
    options: ['Auto Bid', 'Advance Booking', 'Airport Boost'], correct: 1 },
  { q: 'How far ahead can a Grab ride be scheduled?',
    options: ['Up to 90 days', 'Up to 7 days', 'Up to 24 hours'], correct: 0 },
  { q: 'Grab drivers are known internally as...',
    options: ['Pilots', 'Captains', 'DAX'], correct: 2 },
  { q: 'Passengers are known internally as...',
    options: ['PAX', 'Riders', 'Guests'], correct: 0 },
  { q: 'Grab began life in 2012 under which name?',
    options: ['GrabBike', 'MyTeksi', 'TaxiGo'], correct: 1 },
  { q: 'Which of these is NOT a real Grab service?',
    options: ['GrabExpress', 'GrabMart', 'GrabYacht'], correct: 2 },
  { q: 'What colour is the Grab logo?',
    options: ['Green', 'Blue', 'Orange'], correct: 0 },
  { q: 'Where is Grab headquartered?',
    options: ['Jakarta', 'Singapore', 'Kuala Lumpur'], correct: 1 },
  { q: 'The Grab superapp started as an app for...',
    options: ['Food delivery', 'Payments', 'Taxis'], correct: 2 },
  { q: 'Which one is a real Grab ride tier?',
    options: ['GrabCar Premium', 'GrabCar Turbo', 'GrabCar Max'], correct: 0 },
];
```

- [ ] **Step 2: Write `js/db.js`**

```js
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
    .insert({ slack_id, tech_family: techFamily, bucket, session: state?.session ?? 1 })
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

export async function assignMatches(pairs, allPlayers) {
  const bySlack = new Map(allPlayers.map(p => [p.slack_id, p]));
  await Promise.all(pairs.flatMap(([a, b]) => [
    client.from('players').update({ match_slack_id: b }).eq('id', bySlack.get(a).id),
    client.from('players').update({ match_slack_id: a }).eq('id', bySlack.get(b).id),
  ]));
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
  const poll = setInterval(async () => cb(await getGameState()), 3000);
  return () => { client.removeChannel(ch); clearInterval(poll); };
}

export function onPlayers(session, cb) {
  const push = async () => cb(await getPlayers(session));
  const ch = client.channel('pl')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players' }, push)
    .subscribe();
  const poll = setInterval(push, 5000);
  push();
  return () => { client.removeChannel(ch); clearInterval(poll); };
}

export function onOwnRow(playerId, cb) {
  const ch = client.channel('own-' + playerId)
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players',
          filter: 'id=eq.' + playerId },
        payload => cb(payload.new))
    .subscribe();
  const poll = setInterval(async () => {
    try { cb(await getPlayer(playerId)); } catch { /* keep polling */ }
  }, 4000);
  return () => { client.removeChannel(ch); clearInterval(poll); };
}
```

- [ ] **Step 3: Verify in the browser** — with the `static` preview running, open `http://localhost:8080/plumbing.html`, open the devtools console and run:

```js
const db = await import('./js/db.js');
await db.getGameState();          // → {id: 1, status: 'waiting', started_at: null, session: 1}
await db.joinGame('@Console.Test', 'Mobility', 'Grab');  // → row, slack_id 'console.test', session 1
await db.joinGame('console.test', 'Mobility', 'Grab');   // → throws 'already joined'
await db.getPlayers(1);           // → array including the row above
await db.newSession();            // bumps to session 2
await db.getPlayers(2);           // → [] (old rows invisible in the new session)
await db.joinGame('console.test', 'Mobility', 'Grab');   // → succeeds again (new session)
```

Expected: normalisation strips `@` and lowercases; duplicate rejected with friendly message; after `newSession()` the same Slack ID can join afresh and old rows are hidden.

- [ ] **Step 4: Run tests still green** — `npm test`. Expected: 18 pass (db.js is browser-only, untested by node).

- [ ] **Step 5: Commit** — `git add js/db.js js/questions.js && git commit -m "feat: supabase wrapper and placeholder trivia"`

---

### Task 5: Stylesheet + admin page (waiting room and heat views)

**Files:**
- Create: `css/style.css`, `admin.html`, `js/admin-app.js`

**Interfaces:**
- Consumes: `db.js` (`onPlayers`, `onGameState`, `getGameState`, `setGameStatus`, `newSession`), `pairing.js` (`buildLeaderboard`), `config.js` (`GAME_NAME`, `MATCH_BONUS`, `HEAT_DURATION_MS`), CDN global `QRCode`.
- Produces: the projector page through the heat phase. Match-round controls arrive in Task 8. CSS ids/classes used by BOTH pages: `.screen`/`.active`, `#hud`, `#question-banner`(+`.visible`), `#canvas-wrap`, `#game-canvas`, `.chip`, `.board`, `.primary`, `.error`.

- [ ] **Step 1: Write `css/style.css`**

```css
/* ── Base ───────────────────────────────────────────────────────── */
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0b0f0d; color: #f2f5f3;
  overscroll-behavior: none;
  -webkit-user-select: none; user-select: none;
}
button { font: inherit; cursor: pointer; }
input, select {
  font: inherit; width: 100%; padding: .8rem;
  border-radius: 10px; border: 1px solid #2c3a31;
  background: #131a16; color: #f2f5f3;
}
label { display: block; margin: .9rem 0; font-size: .95rem; }
label > input, label > select { margin-top: .35rem; }
.primary {
  display: block; width: 100%; margin-top: 1.2rem; padding: .95rem;
  font-size: 1.05rem; font-weight: 700; border: 0; border-radius: 12px;
  background: #00b45e; color: #04140b;
}
.primary:disabled { opacity: .5; }
.error { color: #ff9c8f; margin-top: .8rem; min-height: 1.2em; }

/* ── Player screens ─────────────────────────────────────────────── */
#app { height: 100%; display: flex; flex-direction: column; }
.screen { display: none; flex: 1; flex-direction: column; padding: 1.4rem; }
.screen.active { display: flex; }
#screen-entry h1 { color: #37e08b; margin-bottom: .2rem; }
.tagline { color: #9db3a6; margin-bottom: 1rem; }
#screen-waiting, #screen-countdown { justify-content: center; text-align: center; }
#screen-waiting p { color: #9db3a6; margin-top: .6rem; }
.pulse {
  width: 18px; height: 18px; border-radius: 50%; background: #00b45e;
  margin: 2rem auto 0; animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(0, 180, 94, .6); }
  100% { box-shadow: 0 0 0 26px rgba(0, 180, 94, 0); }
}
#count-num { font-size: 7rem; font-weight: 800; text-align: center; color: #37e08b; }

/* ── Game screen ────────────────────────────────────────────────── */
#screen-game { padding: 0; }
#hud {
  display: flex; justify-content: space-between; align-items: center;
  padding: .6rem 1rem; font-size: 1rem; background: #101512;
}
#hud b { color: #37e08b; }
#question-banner {
  display: none; padding: .55rem 1rem; background: #123c26;
  border-bottom: 2px solid #00b45e; font-size: .95rem;
}
#question-banner.visible { display: block; }
#q-text { font-weight: 700; }
#q-options { color: #b9e8cd; margin-top: .2rem; font-size: .88rem; }
#canvas-wrap { flex: 1; position: relative; }
#game-canvas { position: absolute; inset: 0; touch-action: none; }
#controls-hint { text-align: center; padding: .45rem; color: #9db3a6; font-size: .85rem; }

/* ── Results ────────────────────────────────────────────────────── */
.big-score { font-size: 3.2rem; font-weight: 800; color: #37e08b; margin: .4rem 0; }
.big-score span + span { font-size: 1.4rem; }
#match-block {
  margin-top: 1.4rem; padding: 1.1rem; border-radius: 14px;
  background: #10231a; border: 1px solid #1e4a33;
}
#match-block h3 { color: #37e08b; margin-bottom: .5rem; }
.match-name { font-size: 1.7rem; font-weight: 800; margin: .5rem 0; }
#claim-form { display: none; margin-top: .8rem; }
#claim-status { margin-top: .6rem; color: #b9e8cd; min-height: 1.2em; }

/* ── Admin ──────────────────────────────────────────────────────── */
.admin body, body.admin { background: #0b0f0d; }
.admin-view { display: none; padding: 2rem; }
.admin-view.active { display: block; }
.admin-head { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1.4rem; }
.admin-head h1 { color: #37e08b; }
.count-big { font-size: 3.4rem; font-weight: 800; color: #37e08b; }
#setup-grid { display: grid; grid-template-columns: 340px 1fr; gap: 2rem; align-items: start; }
#qr { background: #fff; padding: 14px; border-radius: 12px; width: fit-content; }
#player-url { color: #9db3a6; word-break: break-all; margin-top: .6rem; display: block; }
#join-list { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
.chip {
  background: #142019; border: 1px solid #24402f; border-radius: 999px;
  padding: .35rem .8rem; font-size: .95rem;
}
.chip small { color: #8fae9c; margin-left: .35rem; }
.board { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 1.15rem; }
.board td { padding: .5rem .8rem; border-bottom: 1px solid #1c261f; }
.board tr:nth-child(1) td { color: #ffd76a; font-weight: 800; }
.board tr:nth-child(2) td, .board tr:nth-child(3) td { color: #cde7d8; font-weight: 700; }
.board tr.connected td { background: rgba(0, 180, 94, .08); }
#heat-timer { font-size: 4rem; font-weight: 800; color: #ffd76a; }
#connected-count { font-size: 1.6rem; color: #37e08b; font-weight: 700; }
.admin-btn {
  padding: .9rem 1.6rem; font-size: 1.1rem; font-weight: 700;
  border: 0; border-radius: 12px; background: #00b45e; color: #04140b;
}
.admin-btn.ghost {
  background: #142019; color: #cde7d8; border: 1px solid #24402f;
  margin-left: auto; padding: .55rem 1rem; font-size: .95rem;
}
```

- [ ] **Step 2: Write `admin.html`**

```html
<!doctype html>
<html lang="en" class="admin">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grab Rush - Control Room</title>
<link rel="stylesheet" href="css/style.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js"></script>
</head>
<body class="admin">

<div id="view-setup" class="admin-view active">
  <div class="admin-head">
    <h1 id="admin-title">Grab Rush - Control Room</h1>
    <button class="admin-btn ghost new-game">Start new game</button>
  </div>
  <div id="setup-grid">
    <div>
      <div id="qr"></div>
      <span id="player-url"></span>
    </div>
    <div>
      <p class="count-big"><span id="join-count">0</span> in the waiting room</p>
      <div id="join-list"></div>
      <button id="start-heat" class="admin-btn" style="margin-top:1.6rem">Start the heat</button>
    </div>
  </div>
</div>

<div id="view-heat" class="admin-view">
  <div class="admin-head">
    <h1>Heat in progress</h1>
    <span id="heat-timer">93</span>
    <span><span id="finished-count">0</span> finished</span>
    <button class="admin-btn ghost new-game">Start new game</button>
  </div>
  <table class="board"><tbody id="board-heat"></tbody></table>
</div>

<div id="view-match" class="admin-view">
  <div class="admin-head">
    <h1>Match round</h1>
    <span id="connected-count">0 of 0 connected</span>
    <button class="admin-btn ghost new-game">Start new game</button>
  </div>
  <table class="board"><tbody id="board-match"></tbody></table>
</div>

<script type="module" src="js/admin-app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `js/admin-app.js`** (heat scope; match round extends it in Task 8)

```js
import { GAME_NAME, MATCH_BONUS, HEAT_DURATION_MS } from './config.js';
import * as db from './db.js';
import { buildLeaderboard } from './pairing.js';

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
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

- [ ] **Step 4: Verify in the preview** — open `http://localhost:8080/admin.html`. Expected: QR renders, player URL shown, waiting-room count matches rows created during Tasks 1/4 testing (test rows are fine for now). In devtools console run `(await import('./js/db.js')).joinGame('live-check','Test','Grab')` — the chip and count must appear within ~2 s without a reload (realtime) or ≤5 s (poll fallback).

- [ ] **Step 5: Verify the phase switch** — console: `(await import('./js/db.js')).setGameStatus('started')`. Expected: view flips to "Heat in progress", timer counts down from 93. Then reset for later tasks: `(await import('./js/db.js')).setGameStatus('waiting')`.

- [ ] **Step 6: Verify the reset button** — press **Start new game** → confirm. Expected: the page reloads and the waiting room shows 0, even though the old rows still exist in the table (they belong to the previous session). Console-join one more player and confirm the chip appears — new joins land in the new session.

- [ ] **Step 7: Commit** — `git add css/style.css admin.html js/admin-app.js && git commit -m "feat: admin page - QR, waiting room, heat view, session reset"`

---

### Task 6: The game engine + solo harness

**Files:**
- Create: `js/game.js`, `dev.html`

**Interfaces:**
- Consumes: `HEAT_DURATION_MS` from `config.js`; all of `scoring.js`; `QUESTIONS` shape from `questions.js`.
- Produces: `startGame(canvas, hud, questions, onFinish)` where `hud = {score, tier, time, banner, question, options}` (DOM elements), and `onFinish(finalScore:number, tier:number)` fires exactly once when the heat ends. Returns `{stop():void}`. Gates appear at fixed elapsed seconds `[12, 26, 40, 54, 68, 82]`; road slows to 0.45× while a gate is on screen; correct answer = tier up + 2 s speed boost (already at Exec: +`TIER_BONUS` run points instead, so late gates stay live); wrong = nothing.

- [ ] **Step 1: Write `js/game.js`**

```js
import { HEAT_DURATION_MS, TIER_BONUS } from './config.js';
import * as S from './scoring.js';

const TIER_COLORS = ['#00b45e', '#0e8f8f', '#3d3f66', '#15151a'];
const GATE_TIMES = [12, 26, 40, 54, 68, 82];

export function startGame(canvas, hud, questions, onFinish) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const roadLeft = () => W * 0.08;
  const roadWidth = () => W * 0.84;
  const laneWidth = () => roadWidth() / 3;
  const laneCenter = i => roadLeft() + laneWidth() * (i + 0.5);
  const carY = () => H - 130;

  let elapsed = 0, last = null, raf = null, finished = false;
  let carLane = 1, tier = 0, score = 0;
  let coins = [], obstacles = [], gate = null;
  let dashOffset = 0, coinTimer = 0.4, obstacleTimer = 1.2;
  let nextGate = 0, qIndex = 0;
  let boostUntil = -1, invulnUntil = -1, feedback = null;

  function moveLeft() { carLane = Math.max(0, carLane - 1); }
  function moveRight() { carLane = Math.min(2, carLane + 1); }
  function onPointer(e) {
    const x = (e.touches ? e.touches[0].clientX : e.clientX)
      - canvas.getBoundingClientRect().left;
    if (x < W / 2) moveLeft(); else moveRight();
    e.preventDefault();
  }
  function onKey(e) {
    if (e.key === 'ArrowLeft') moveLeft();
    if (e.key === 'ArrowRight') moveRight();
  }
  canvas.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);

  function speed() {
    let s = 340 * S.tierSpeedMultiplier(tier);
    if (gate) s *= 0.45;                      // reading time
    if (elapsed < boostUntil) s *= 1.4;       // correct-answer boost
    return s;
  }

  function update(dt) {
    elapsed += dt;
    const dy = speed() * dt;
    dashOffset = (dashOffset + dy) % 48;

    coinTimer -= dt;
    if (coinTimer <= 0) {
      coins.push({ lane: Math.floor(Math.random() * 3), y: -30 });
      coinTimer = 0.65;
    }
    obstacleTimer -= dt;
    if (obstacleTimer <= 0 && !gate) {        // fair: no cones while reading
      obstacles.push({ lane: Math.floor(Math.random() * 3), y: -40 });
      obstacleTimer = 1.6;
    }
    if (nextGate < GATE_TIMES.length && elapsed >= GATE_TIMES[nextGate]) {
      gate = { y: -60, q: questions[qIndex % questions.length] };
      qIndex++; nextGate++;
      hud.question.textContent = gate.q.q;
      hud.options.textContent = gate.q.options
        .map((o, i) => 'ABC'[i] + ': ' + o).join('   ');
      hud.banner.classList.add('visible');
    }

    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (gate) gate.y += dy;

    coins = coins.filter(c => {
      const near = Math.abs(c.y - carY()) < 46;
      const laneOk = c.lane === carLane
        || (S.tierHasMagnet(tier) && Math.abs(c.lane - carLane) === 1);
      if (near && laneOk) { score = S.collectCoin(score); return false; }
      return c.y < H + 60;
    });

    obstacles = obstacles.filter(o => {
      if (Math.abs(o.y - carY()) < 50 && o.lane === carLane
          && elapsed > invulnUntil) {
        score = S.hitObstacle(score);
        invulnUntil = elapsed + 1.2;
        feedback = { text: 'Ouch!', until: elapsed + 0.8, good: false };
        return false;
      }
      return o.y < H + 60;
    });

    if (gate && gate.y >= carY()) {
      const correct = carLane === gate.q.correct;
      const atMax = tier === S.TIERS.length - 1;   // already Exec
      tier = S.answerQuestion(tier, correct);
      if (correct && atMax) score += TIER_BONUS;   // Exec: late gates stay worth playing
      feedback = correct
        ? { text: atMax ? 'Exec bonus +' + TIER_BONUS + '!'
                        : 'Upgraded to ' + S.TIERS[tier] + '!',
            until: elapsed + 1.5, good: true }
        : { text: 'Not quite - no change', until: elapsed + 1.5, good: false };
      if (correct) boostUntil = elapsed + 2;
      gate = null;
      hud.banner.classList.remove('visible');
    }

    hud.score.textContent = score;
    hud.tier.textContent = S.TIERS[tier];
    hud.time.textContent = Math.max(0, Math.ceil(HEAT_DURATION_MS / 1000 - elapsed));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0d3321';                 // verges
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#26262e';                 // road
    ctx.fillRect(roadLeft(), 0, roadWidth(), H);

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 22]);
    ctx.lineDashOffset = -dashOffset;
    for (let i = 1; i < 3; i++) {
      const x = roadLeft() + laneWidth() * i;
      ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, H + 30); ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const c of coins) {                   // stylised Grab Coin
      const x = laneCenter(c.lane);
      ctx.fillStyle = '#00c853';
      ctx.beginPath(); ctx.arc(x, c.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a5ffce'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui';
      ctx.fillText('G', x, c.y + 1);
    }

    for (const o of obstacles) {               // traffic cones
      const x = laneCenter(o.lane);
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(x, o.y - 22); ctx.lineTo(x - 18, o.y + 18);
      ctx.lineTo(x + 18, o.y + 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 12, o.y + 2, 24, 6);
    }

    if (gate) {                                // answer gates A / B / C
      for (let i = 0; i < 3; i++) {
        const x = laneCenter(i), w = laneWidth() - 14;
        ctx.fillStyle = 'rgba(0, 177, 79, 0.25)';
        ctx.fillRect(x - w / 2, gate.y - 34, w, 68);
        ctx.strokeStyle = '#00b14f'; ctx.lineWidth = 3;
        ctx.strokeRect(x - w / 2, gate.y - 34, w, 68);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 30px system-ui';
        ctx.fillText('ABC'[i], x, gate.y);
      }
    }

    const cx = laneCenter(carLane), cy = carY();   // the car, tier-coloured
    const flash = elapsed < invulnUntil && Math.floor(elapsed * 10) % 2 === 0;
    ctx.globalAlpha = flash ? 0.4 : 1;
    ctx.fillStyle = TIER_COLORS[tier];
    roundRect(cx - 26, cy - 44, 52, 88, 12); ctx.fill();
    if (tier === 3) {                          // Exec gets the gold trim
      ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 3;
      roundRect(cx - 26, cy - 44, 52, 88, 12); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(160, 220, 255, 0.85)';   // windscreen
    roundRect(cx - 18, cy - 30, 36, 22, 6); ctx.fill();
    ctx.globalAlpha = 1;

    if (feedback && elapsed < feedback.until) {
      ctx.fillStyle = feedback.good ? '#7dffb0' : '#ffb0a8';
      ctx.font = 'bold 22px system-ui';
      ctx.fillText(feedback.text, W / 2, H * 0.32);
    }
  }

  function end() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    onFinish(S.finalScore(score, tier), tier);
  }

  function frame(ts) {
    if (last === null) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);  // clamp background-tab jumps
    last = ts;
    update(dt);
    draw();
    if (elapsed * 1000 >= HEAT_DURATION_MS) { end(); return; }
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return { stop: end };
}
```

- [ ] **Step 2: Write `dev.html`** (solo harness, no backend)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>Game dev harness</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<main id="app">
  <section id="screen-game" class="screen active">
    <div id="hud">
      <span>Score <b id="hud-score">0</b></span>
      <span id="hud-tier">Standard</span>
      <span><b id="hud-time">90</b>s</span>
    </div>
    <div id="question-banner"><p id="q-text"></p><p id="q-options"></p></div>
    <div id="canvas-wrap"><canvas id="game-canvas"></canvas></div>
    <p id="controls-hint">Tap left / right to change lane (or arrow keys)</p>
  </section>
</main>
<script type="module">
import { startGame } from './js/game.js';
import { QUESTIONS } from './js/questions.js';
const $ = id => document.getElementById(id);
startGame($('game-canvas'),
  { score: $('hud-score'), tier: $('hud-tier'), time: $('hud-time'),
    banner: $('question-banner'), question: $('q-text'), options: $('q-options') },
  QUESTIONS,
  (score, tier) => alert('Final score: ' + score + ' (tier index ' + tier + ')'));
</script>
</body>
</html>
```

- [ ] **Step 3: Verify in the preview** — open `http://localhost:8080/dev.html`. Play a full run. Check every one of:
  - arrow keys and click-left/right both change lane
  - coins collect (+2 each), cones cost 5, score never below 0
  - at ~12 s the banner shows question 1 and the road visibly slows
  - driving through the correct lane upgrades the car (colour changes, "Upgraded to Plus!")
  - wrong lane → "Not quite - no change", tier keeps its colour
  - during the run reach Premium and confirm adjacent-lane coins collect (magnet)
  - reach Exec, answer one more gate correctly → "Exec bonus +10!" and score jumps by 10
  - timer hits 0 at 90 s → alert with a plausible score (engaged play ≈ 90-150)
  - after the alert, arrow keys do nothing (listeners removed)

- [ ] **Step 4: Verify mobile layout** — resize the preview to the mobile preset and reload. Expected: portrait layout fills the screen, tapping halves changes lane, no page scroll or bounce while playing.

- [ ] **Step 5: Commit** — `git add js/game.js dev.html && git commit -m "feat: canvas driving game with trivia gates and tier progression"`

---

### Task 7: Player page — entry to results

**Files:**
- Create: `index.html`, `js/player-app.js`

**Interfaces:**
- Consumes: everything produced so far. localStorage key `grabrush_player_id`. A saved player whose row belongs to an older session is treated as not joined (cleared, back to the entry form).
- Produces: full player flow through score submission. The match block exists in the DOM (hidden) but its behaviour arrives in Task 8. URL flag `?solo=1` skips the backend entirely (dev + demo).

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>Grab Rush</title>
<link rel="stylesheet" href="css/style.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
<main id="app">

  <section id="screen-entry" class="screen active">
    <h1 id="game-title">Grab Rush</h1>
    <p class="tagline">One heat. 90 seconds. Bragging rights.</p>
    <label>Slack ID (this is your name on the leaderboard)
      <input id="slack-id" placeholder="e.g. jionglin.low" autocomplete="off"
             autocapitalize="none" spellcheck="false">
    </label>
    <label>Tech Family
      <select id="tech-family"></select>
    </label>
    <label><span id="bucket-label"></span>
      <select id="bucket"></select>
    </label>
    <button id="join-btn" class="primary">Join the waiting room</button>
    <p id="entry-error" class="error"></p>
  </section>

  <section id="screen-waiting" class="screen">
    <h2>You're in, <span id="waiting-name"></span></h2>
    <p>Eyes on the big screen. The heat starts when the host says go.</p>
    <div class="pulse"></div>
  </section>

  <section id="screen-countdown" class="screen">
    <div id="count-num">3</div>
  </section>

  <section id="screen-game" class="screen">
    <div id="hud">
      <span>Score <b id="hud-score">0</b></span>
      <span id="hud-tier">Standard</span>
      <span><b id="hud-time">90</b>s</span>
    </div>
    <div id="question-banner"><p id="q-text"></p><p id="q-options"></p></div>
    <div id="canvas-wrap"><canvas id="game-canvas"></canvas></div>
    <p id="controls-hint">Tap left / right to change lane</p>
  </section>

  <section id="screen-results" class="screen">
    <h2>Finished!</h2>
    <p class="big-score"><span id="final-score">0</span> <span>pts</span></p>
    <p>You finished in a <b id="final-tier">Standard</b>.</p>
    <p id="submit-status"></p>
    <div id="match-block">
      <h3>Your match</h3>
      <p id="match-instructions">When the host opens the match round, your match appears here.</p>
      <p class="match-name" id="match-name"></p>
      <p id="match-context"></p>
      <div id="claim-form">
        <input id="claim-input" placeholder="Their Slack ID" autocomplete="off"
               autocapitalize="none" spellcheck="false">
        <button id="claim-btn" class="primary">We met - confirm</button>
      </div>
      <p id="claim-status"></p>
    </div>
  </section>

</main>
<script type="module" src="js/player-app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `js/player-app.js`** (match-round functions land in Task 8)

```js
import { GAME_NAME, TECH_FAMILIES, BUCKET_QUESTION, BUCKET_OPTIONS } from './config.js';
import { QUESTIONS } from './questions.js';
import { TIERS } from './scoring.js';
import { startGame } from './game.js';
import * as db from './db.js';

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
}
```

- [ ] **Step 3: Verify solo mode** — preview `http://localhost:8080/index.html?solo=1`. Expected: straight to 3-2-1 countdown, full game, results screen with "Solo mode - score not submitted."

- [ ] **Step 4: Verify the full heat end-to-end, locally** — reset first: on `admin.html` press **Start new game** (built in Task 5). Then:
  1. Tab A: `admin.html` — 0 in waiting room
  2. Tab B: `index.html` — join as `pax-one`, Mobility, Grab → waiting screen; admin count becomes 1 (within 5 s)
  3. Tab C: `index.html` in a private/incognito window (separate localStorage!) — join as `pax-two`, Deliveries, Grab
  4. Tab B duplicate check: reload `index.html` in a THIRD normal tab — it must go straight to the waiting screen (rejoin via localStorage), not the entry form
  5. Admin: Start the heat → both player tabs count down within ~3 s and play
  6. Let both finish → both scores appear on the admin heat board as they land
  7. Admin: press **Start new game** → within ~3 s both player tabs reload to the entry form, and the admin waiting room reads 0
  Expected at every step; any deviation is a bug to fix now.

- [ ] **Step 5: Push and verify on a real phone** — `git add index.html js/player-app.js && git commit -m "feat: player flow - entry, waiting room, heat, results" && git push`. After Pages redeploys (~2 min): reset data again, then on the owner's phone join via the live URL, start the heat from the laptop's admin page, play the full 90 s on the phone. Expected: countdown, playable game, score lands on the admin leaderboard. **This is milestone 2.**

---

### Task 8: Match round, both sides

**Files:**
- Modify: `js/admin-app.js`, `admin.html`, `js/player-app.js`

**Interfaces:**
- Consumes: `computePairs`, `connectionStats` (pairing.js), `assignMatches`, `claimMatch`, `onOwnRow`, `getPlayers` (db.js), `MATCH_BONUS` (config.js), `bonusAwarded` (pairing.js).
- Produces: the complete match round — admin assigns pairs and shows "X of Y connected"; players see their match, claim, and both get the bonus live.

- [ ] **Step 1: Add the match button to `admin.html`** — inside `<div id="view-heat">`, after the `<table>` line, add:

```html
  <button id="start-match" class="admin-btn" style="margin-top:1.4rem">Start the match round</button>
```

- [ ] **Step 2: Extend `js/admin-app.js`** — change the pairing import line to:

```js
import { buildLeaderboard, computePairs, connectionStats } from './pairing.js';
```

In `init()`, after the `start-heat` listener line, add:

```js
  $('start-match').addEventListener('click', startMatchRound);
```

After the `runTimer()` function, add:

```js
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
```

At the end of `render()`, add:

```js
  const stats = connectionStats(players);
  $('connected-count').textContent = stats.connected + ' of ' + stats.total + ' connected';
```

- [ ] **Step 3: Extend `js/player-app.js`** — change the two import lines to:

```js
import { GAME_NAME, TECH_FAMILIES, BUCKET_QUESTION, BUCKET_OPTIONS, MATCH_BONUS } from './config.js';
import { bonusAwarded } from './pairing.js';
```

(the second is a new line after the existing imports). In `onState`, add a second transition:

```js
  if (state.status === 'match_round' && appState === 'results') enterMatchRound();
```

In `onGameFinish`, after the submit-status assignment, add:

```js
  db.onOwnRow(me.id, row => {
    me = { ...me, ...row };
    if (row.match_slack_id) showMatch(row);
  });
```

Then append these functions at the end of the file:

```js
let pollMatch = null;
let claimWired = false;
let connectedDone = false;

async function enterMatchRound() {
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
    $('claim-status').textContent = 'Saved. Waiting for them to enter yours...';
    checkConnected();
  } catch (err) {
    $('claim-status').textContent = err.message;
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
```

- [ ] **Step 4: Run tests still green** — `npm test`. Expected: 18 pass.

- [ ] **Step 5: Verify the match round end-to-end, locally** — reset via the admin **Start new game** button. Join and play three players from three isolated tabs (normal + incognito + a different browser): `pax-one` Mobility/Grab, `pax-two` Deliveries/Grab, `pax-three` Mobility/Drive. Start heat, let all three finish. Then admin → "Start the match round". Expected:
  - `pax-one` and `pax-two` each see the other's ID with the bucket line; `pax-three` sees the no-match copy
  - `pax-one` types `pax-two` → "Saved. Waiting..."; leaderboard unchanged
  - `pax-two` types `pax-one` → within ~4 s BOTH phones show "Connected! +35", the admin board re-ranks with both scores +35 and 🤝, and the counter reads "2 of 2 connected"
  - typing a wrong ID first (e.g. `pax-thre`) then correcting it also ends Connected (last claim wins)

- [ ] **Step 6: Commit and push** — `git add -A && git commit -m "feat: match round - assignment, mutual claims, live bonus" && git push`

---

### Task 9: Polish, facilitator kit, rehearsal

**Files:**
- Create: `docs/facilitator-script.md`, `docs/reset.sql`
- Modify: `README.md` (live URLs), `css/style.css` only if visual fixes surface in rehearsal

**Interfaces:**
- Consumes: everything.
- Produces: the event-day run book and the final verified deploy. **This is milestone 3.**

- [ ] **Step 1: Write `docs/reset.sql`**

```sql
-- FULL WIPE - run in the Supabase dashboard → SQL Editor after the event
-- (or to purge rehearsal data for good). Day-to-day resets do NOT need
-- this: the admin page's "Start new game" button starts a clean session
-- without deleting anything, and the public key stays non-destructive.
truncate table players;
update game_state set status = 'waiting', started_at = null, session = 1 where id = 1;
```

- [ ] **Step 2: Write `docs/facilitator-script.md`**

```markdown
# Facilitator run book - Grab Rush (10 minutes)

## Before the session (day before + 30 min before)
- [ ] Open `admin.html` on the projector laptop; confirm QR renders
- [ ] Press **Start new game** (clears the room and board from rehearsals)
- [ ] Phone check: join from your own phone on mobile data; confirm your
      name appears in the waiting room; press **Start new game** again after
- [ ] Paste the player URL in the session Slack channel, pinned, for
      virtual attendees
- [ ] Charge the projector laptop; hotspot as wifi backup

## Script
**0:00** - "Phones out, scan the QR - or grab the link pinned in Slack.
Slack ID, Tech Family, one question. You have two minutes."
(Watch the counter climb. Chase stragglers by name - it is on the screen.)

**2:00** - "Locking the doors. 3... 2... 1..." → press **Start the heat**.
Latecomers: they can still join and play solo after the heat; their score
lands on the board late. Do not restart the heat.

**2:30-4:00** - Commentate the board as scores land. Call out Tech
Families, not just names.

**4:00** - Top 3 stand up / wave on the call. One line each: name, TF.

**6:00** - "Look at your phone. That name is your match - same answer to
the commute question, different Tech Family. Find them in the room, or DM
them on Slack if either of you is remote. Swap Slack IDs, type each
other's in, you BOTH get +35. The board re-ranks live. Three minutes."

**9:00** - Final board. Crown the winner: "drove well AND got off their
chair." Note the connected counter: "X new cross-TF conversations in
three minutes."

## If things break
- Player page will not load → mobile data, not office wifi; the URL is
  also in Slack
- Waiting-room count stuck → refresh admin.html (state is in the
  database, nothing is lost)
- A player's score did not land → their phone shows "Could not reach the
  leaderboard - show this screen to the host": read it out, note it
  manually
- Supabase down entirely → players screenshot their results screens into
  the Slack channel; eyeball the top 3; pair people by pointing:
  "left half of the room, find someone on the right half from another TF"

## After
- Screenshot the final board for the follow-up post
- Round two some day? Just press **Start new game**. Run `docs/reset.sql`
  only to purge all data for good
```

- [ ] **Step 3: Update `README.md`** — replace the local-dev line block with the live URLs (player, admin, plumbing) recorded from Task 1 Step 10. Keep the local dev instructions beneath them.

- [ ] **Step 4: Full dress rehearsal on real devices** — press **Start new game**, then: admin on the laptop, owner's phone + one more real phone (or a colleague) as players, one laptop player over the Slack-pasted URL for the virtual path. Run the entire show: join → heat → top 3 → match round → mutual claim → final board. Every checklist item in the facilitator script must hold. Fix and re-push anything that does not; repeat until clean.

- [ ] **Step 5: Design critique pass** — per the owner's global standards: review both pages for hierarchy, typography, spacing, colour, accessibility (contrast of `#9db3a6` on `#0b0f0d`, tap-target sizes ≥ 44 px, focus states on inputs). Before the pass, pull the real Grab palette via the `design-tokens` MCP (`find_duxton_color_tokens_by_prefix`, prefix `green`) and swap the placeholder greens (`#00b45e`, `#37e08b`) for the true Duxton values if they differ — palette only, no proprietary asset files (owner-approved line). Present as a table with verdicts; fix only what the owner approves.

- [ ] **Step 6: Final commit and push** — `git add -A && git commit -m "feat: facilitator run book, reset script, rehearsal fixes" && git push`

---

## Self-review checklist (done at plan-writing time)

- Spec coverage: QR onboarding ✓, Slack link for virtual ✓, 3-field entry ✓, admin-gated synchronised start ✓, waiting-room count ✓, 90 s heat ✓, 3-lane tap control + laptop keys ✓, stylised Grab Coins ✓, obstacles non-fatal ✓, trivia gates with slow-down reading time ✓, tier progression with perks ✓, wrong answer = no gain no penalty ✓, mixed placeholder trivia pool ✓, live leaderboard with TF ✓, best-effort writes + local score independence ✓, reciprocal 1-to-1 same-bucket-cross-TF matching ✓, mutual verification + 35-point bonus ✓, "X of Y connected" counter ✓, unmatched players unaffected ✓, plumbing-first build order ✓, screenshot fallback + facilitator script ✓, reset between rehearsals via the admin "Start new game" session bump (owner request, 2026-08-13) ✓, Exec-tier gate bonus so late gates stay live (game-design review, 2026-08-13) ✓, latecomer line ✓.
- Placeholder scan: the only PLACEHOLDER markers are deliberate content stubs (name, trivia, TF list, bucket question) named as such in the spec.
- Type consistency: `players` row fields (`session, slack_id, tech_family, bucket, score, match_slack_id, claimed_match`) match across SQL, db.js, pairing.js tests, and both apps; every `getPlayers`/`onPlayers` call site passes a session; `hud` object keys match between game.js, dev.html, and player-app.js; `startGame(canvas, hud, questions, onFinish)` signature identical at all three call sites.
