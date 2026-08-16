# Playtest Round 2 Implementation Plan (bonus round, wall clock, six tiers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the owner's second-playtest feedback into the live game with zero database schema changes: @-prefixed ID fields, a 90-second wall-clock hard stop, the player's name on screen, a self-serve bonus round that replaces assigned matching, score popups at the action, and a six-tier vehicle ladder.

**Architecture:** A new pure module `js/phase.js` derives the game stage (heat, bonus, over) for every screen from one shared anchor, `game_state.started_at` - no new status writes, no per-screen timers. Pairing becomes mutual claims validated by rules (different Tech Family, same commute bucket) in a rewritten `js/pairing.js`. In `js/game.js` the heat clock splits from game time: `wall` always advances (hard stop at 90 s), `elapsed` still freezes during quizzes (physics, popups, feedback).

**Tech Stack:** unchanged - vanilla ES modules, canvas, Supabase REST via the CDN `window.supabase` client, `node --test`, GitHub Pages.

## Global Constraints

- Repo: `/Users/jionglin.low/Projects/pm-connect-game`. Work on `main` (established practice for this project). Never touch the live Supabase database - no REST calls, no SQL. All tests are pure Node.
- **Zero DB schema changes.** `game_state.status` is only ever `'waiting'` or `'started'`; never write `'match_round'`. `players.match_slack_id` stays in the schema but goes unused.
- `TIERS` exactly: `['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', 'Premium', 'Exec']`.
- `TECH_FAMILIES` exactly (14 entries): ACE, BTP, COREX, Data Product, Ecomm, Geo & IoT, PSPO, FS, Integrity, Mobility, FF, SPA, GFB, Other.
- `BONUS_ROUND_MS = 90_000`. Phase boundaries from `started_at`: heat until +93 s (`COUNTDOWN_MS` 3_000 + `HEAT_DURATION_MS` 90_000), bonus until +183 s, then over.
- Pairing rule: partner must be a DIFFERENT `tech_family` AND the SAME `bucket`, and not yourself. A pair counts only when claims are mutual. One pair per person is automatic: each player has a single `claimed_match` column.
- All user-facing numbers come from config imports (`MATCH_BONUS`, `COIN_POINTS`, `COLLISION_PENALTY`, `TIER_BONUS`) - never hard-code them in UI strings or popups.
- Canvas drawings only. No Grab asset files (logos, fonts, images) may be added to the repo.
- **Pinned copy** - use EXACTLY (British English, no em dashes; `35` always interpolated from `MATCH_BONUS`):
  - Player bonus instruction: `Find someone from a different Tech Family who travels the same way as you. Swap Slack IDs, type theirs below - you both get +35.`
  - Self block: label `You are`, then the big `@<slack_id>`, then `Show this screen when you meet someone.`
  - Player countdown: `Bonus round: <n>s left`
  - Closed: `Bonus round closed - your score stands.`
  - Not found: `No player with that ID this round - check the spelling.`
  - Yourself: `That's you! Find someone else.`
  - Same TF: `Same Tech Family - find someone from a different one.`
  - Different bucket: `They don't travel the same way as you - find someone who does.`
  - Taken: `They're already paired with someone else.`
  - Saved: `Saved. Now make sure they type YOUR ID too.`
  - Connected: `Connected! +35 points for you both.`
  - Empty input: `Type their Slack ID first.` (`db.claimMatch` already throws exactly this string - reuse it, do not reword)
  - Fetch failed: `Could not reach the game - try again.`
  - Admin rule line: `Find someone from a different Tech Family who travels the same way as you. Swap Slack IDs - you both type them in. +35 each.`
  - Admin view titles: `Bonus round` during the window, `Final results` after.
- **Accepted trade-offs - do NOT "fix" these:** ~3 s start skew between phones; refresh mid-heat = a fresh 90 s run; device clock skew of a few seconds; a late joiner during the heat drives the full 90 s and gets whatever bonus window the shared clock leaves (possibly none); slow quiz answers eat driving time; collision boxes stay lane-based regardless of vehicle drawing; the anon key can update rows; reset is session-bump based.
- **Known intra-branch state:** Task 3 deletes `computePairs` while `js/admin-app.js` still imports it until Task 5, so the admin page's module is dead in the working tree between Tasks 3 and 5. Intentional - nothing deploys until after the final review. Tests never load `admin-app.js`, so `npm test` stays green throughout.
- Tests: `npm test` runs `node --test tests/*.test.js`. Suite is 18 at base, 19 after Task 1, 28 from Task 3 onward.

---

### Task 1: Six-tier config + real Tech Families (transcription tier)

**Files:**
- Modify: `js/config.js` (three changes)
- Modify: `js/scoring.js` (one line)
- Rewrite: `tests/scoring.test.js`

**Interfaces:**
- Produces: `TIERS` (6 entries, exact order above), `BONUS_ROUND_MS = 90_000`, `TECH_FAMILIES` (14 entries). Task 2 keys `TIER_COLORS`/drawings off tier index 0-5; Task 3 imports `BONUS_ROUND_MS` in `phase.js`; Tasks 4-5 rely on all three.
- Note: `js/scoring.js` functions are already length-generic (`answerQuestion` caps at `TIERS.length - 1`, `tierPoints` = `tier * TIER_BONUS`) - the TIERS array is the only scoring change.

- [ ] **Step 1: Rewrite the scoring tests for the six-tier ladder**

Replace the entire contents of `tests/scoring.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, collectCoin, hitObstacle, answerQuestion,
  tierPoints, finalScore, tierSpeedMultiplier, tierHasMagnet,
} from '../js/scoring.js';

test('six tiers in order, GrabBike to Exec', () => {
  assert.deepEqual(TIERS, ['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', 'Premium', 'Exec']);
});

test('coin adds points', () => assert.equal(collectCoin(10), 12));

test('obstacle subtracts but never below zero', () => {
  assert.equal(hitObstacle(10), 5);
  assert.equal(hitObstacle(3), 0);
});

test('correct answer upgrades one tier, capped at Exec', () => {
  assert.equal(answerQuestion(0, true), 1);
  assert.equal(answerQuestion(5, true), 5);
});

test('five correct answers climb GrabBike to Exec', () => {
  let tier = 0;
  for (let i = 0; i < 5; i++) tier = answerQuestion(tier, true);
  assert.equal(TIERS[tier], 'Exec');
});

test('wrong answer changes nothing - no gain, no penalty', () => {
  assert.equal(answerQuestion(2, false), 2);
  assert.equal(answerQuestion(0, false), 0);
});

test('tier points are 10 per tier', () => {
  assert.equal(tierPoints(0), 0);
  assert.equal(tierPoints(5), 50);
});

test('final score adds tier points to run score', () => {
  assert.equal(finalScore(80, 2), 100);
});

test('speed rises with tier', () => {
  assert.ok(tierSpeedMultiplier(5) > tierSpeedMultiplier(0));
  assert.equal(tierSpeedMultiplier(0), 1);
});

test('coin magnet from Standard up', () => {
  assert.equal(tierHasMagnet(0), false);
  assert.equal(tierHasMagnet(1), false);
  assert.equal(tierHasMagnet(2), true);
  assert.equal(tierHasMagnet(5), true);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL - 2 of the 10 new scoring tests fail against the current four-tier ladder (`six tiers in order`, and `correct answer upgrades one tier, capped at Exec` because `answerQuestion(5, true)` currently returns 3). The 9 pairing tests still pass.

- [ ] **Step 3: Change the TIERS line in `js/scoring.js`**

Line 3 currently reads:

```js
export const TIERS = ['Standard', 'Plus', 'Premium', 'Exec'];
```

Replace with:

```js
export const TIERS = ['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', 'Premium', 'Exec'];
```

No other change in this file.

- [ ] **Step 4: Make the three config changes in `js/config.js`**

(a) Directly below the `HEAT_DURATION_MS` line (currently line 7), add:

```js
export const BONUS_ROUND_MS = 90_000;             // pairing window after the heat ends
```

(b) Update the `MAGNET_TIER` comment (the value stays 2; on the six-tier ladder index 2 is now Standard). The line becomes:

```js
export const MAGNET_TIER = 2;                    // tier index that unlocks the coin magnet (2 = Standard on the six-tier ladder)
```

(c) Replace the whole `TECH_FAMILIES` block (currently lines 28-38, including the `// PLACEHOLDER list` comment) with:

```js
// Confirmed 2026-08-16 - the real Tech Family list for the event.
export const TECH_FAMILIES = [
  'ACE',
  'BTP',
  'COREX',
  'Data Product',
  'Ecomm',
  'Geo & IoT',
  'PSPO',
  'FS',
  'Integrity',
  'Mobility',
  'FF',
  'SPA',
  'GFB',
  'Other',
];
```

`BUCKET_QUESTION` and `BUCKET_OPTIONS` stay exactly as they are.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS - 19 tests (10 scoring + 9 pairing). The old pairing tests use inline TF strings, not the config list, so the rename cannot break them.

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/scoring.js tests/scoring.test.js
git commit -m "feat: six-tier ladder, real Tech Families, bonus-round config"
```

---

### Task 2: Wall-clock hard stop, score popups, six vehicle drawings

**Files:**
- Modify: `js/game.js` only. Read the whole file before editing - the line numbers below are from the current file at base b901cca.

**Interfaces:**
- Consumes: `TIERS` (6 entries) via the existing `* as S` scoring import; `COIN_POINTS`, `COLLISION_PENALTY` newly imported from config.
- Produces: no new exports. `startGame(canvas, hud, questions, onFinish)` signature unchanged; `onFinish(finalScore, tier)` unchanged. Behaviour contract for later tasks: the game now ALWAYS ends at 90 s of wall time, even mid-quiz.

There are no unit tests for canvas code in this repo (established pattern); verification is syntax check + suite + greps.

- [ ] **Step 1: Extend the config import**

The import at the top of the file currently pulls `HEAT_DURATION_MS, TIER_BONUS, BASE_SPEED, ...` from `./config.js`. Add `COIN_POINTS` and `COLLISION_PENALTY` to that same import list. Example result:

```js
import { HEAT_DURATION_MS, TIER_BONUS, COIN_POINTS, COLLISION_PENALTY,
         BASE_SPEED, COIN_EVERY, OBSTACLE_EVERY,
         BOOST_MULTIPLIER, BOOST_SECONDS, QUIZ_COUNT, QUIZ_SECONDS,
         QUIZ_FIRST_AT, QUIZ_LAST_AT } from './config.js';
```

- [ ] **Step 2: Replace the module-level TIER_COLORS and add the new module constants**

Line 6 currently reads:

```js
const TIER_COLORS = ['#00b14f', '#17b5a6', '#3d3f66', '#15151a'];
```

Replace with:

```js
const TIER_COLORS = ['#2ec46a', '#ffb54d', '#00b14f', '#17b5a6', '#3d3f66', '#15151a'];
const POPUP_LIFE = 0.9;                          // seconds a score popup lives

// Car liveries, Standard to Exec: longer and fancier each step up.
// Indices 0-1 (bike, tuk-tuk) have their own drawing functions.
const CAR_STYLE = [null, null,
  { stretch: 0, stripe: false, spoiler: false },   // Standard
  { stretch: 0, stripe: true,  spoiler: false },   // Plus
  { stretch: 4, stripe: true,  spoiler: true  },   // Premium
  { stretch: 8, stripe: true,  spoiler: true  },   // Exec
];
```

- [ ] **Step 3: Add the wall clock and popup list to game state**

Line 36 currently: `let elapsed = 0, last = null, raf = null, finished = false;`
becomes: `let elapsed = 0, wall = 0, last = null, raf = null, finished = false;`

Line 38 currently: `let coins = [], obstacles = [], vip = null, quiz = null;`
becomes: `let coins = [], obstacles = [], vip = null, quiz = null, popups = [];`

- [ ] **Step 4: Add the popup spawner (inside the startGame closure, directly above `openQuiz`, currently line 66)**

```js
  function popScore(text, x, y, good) {          // floating +N / -N at the action
    popups.push({ text, x, y, born: elapsed, good });
  }
```

- [ ] **Step 5: Switch the VIP spawn to the wall clock and pop on coins/crashes**

(a) The VIP spawn condition (currently line 141) changes `elapsed >=` to `wall >=` so the quizzes spread across the real 90 s:

```js
    if (!vip && nextQuiz < quizTimes.length && wall >= quizTimes[nextQuiz]) {
```

(b) In the coin filter (currently lines 150-156), add a popup beside the collect call. The hit branch becomes:

```js
      if (near && laneOk) {
        score = S.collectCoin(score);
        popScore('+' + COIN_POINTS, laneCenter(c.lane), c.y, true);
        return false;
      }
```

(c) In the obstacle filter (currently lines 158-167), the line
`feedback = { text: 'Ouch!', until: elapsed + 0.8, good: false };`
is REPLACED by:

```js
        popScore('-' + COLLISION_PENALTY, laneCenter(o.lane), o.y, false);
```

(The popup replaces the centre-screen "Ouch!". The centre `feedback` mechanism itself stays - quizzes still use it for "Nice!"/"Not quite".)

(d) At the end of `update()`, directly BEFORE the `hud.score.textContent` line (currently line 180), add the popup cull:

```js
    popups = popups.filter(p => elapsed - p.born < POPUP_LIFE);
```

(e) DELETE the `hud.time.textContent = ...` line from `update()` (currently line 182). The HUD clock moves to `frame()` in Step 8 so it ticks even during quizzes. Keep the `hud.score` and `hud.tier` lines.

- [ ] **Step 6: Pop +10 on a correct VIP answer, in `resume()`**

Directly after the existing line `if (correct && atMax) score += TIER_BONUS;` (currently line 114), add:

```js
    if (correct) popScore('+' + TIER_BONUS, laneCenter(carLane), carY() - 70, true);
```

(Truthful number: each tier step is worth exactly `TIER_BONUS` at the final tally, and at max tier it is +10 immediately.)

- [ ] **Step 7: Replace `drawCar` (currently lines 239-265) with the six-vehicle family**

Delete the whole `drawCar` function and put these four functions in its place:

```js
  function drawVehicle(cx, cy) {               // the player, one drawing per tier
    const flash = elapsed < invulnUntil && Math.floor(elapsed * 10) % 2 === 0;
    ctx.globalAlpha = flash ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';      // shared ground shadow
    ctx.beginPath(); ctx.ellipse(cx, cy + 42, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    if (tier === 0) drawBike(cx, cy);
    else if (tier === 1) drawTukTuk(cx, cy);
    else drawCarBody(cx, cy);
    ctx.globalAlpha = 1;
  }

  function drawBike(cx, cy) {                  // GrabBike: two wheels and a rider
    ctx.fillStyle = '#111116';                 // wheels
    ctx.beginPath(); ctx.arc(cx, cy - 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = TIER_COLORS[0];          // frame
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy + 26); ctx.stroke();
    ctx.strokeStyle = '#15151a';               // handlebar
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx - 16, cy - 18); ctx.lineTo(cx + 16, cy - 18); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = TIER_COLORS[0];            // rider: shoulders + helmet
    ctx.beginPath(); ctx.ellipse(cx, cy + 8, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9fcde';
    ctx.beginPath(); ctx.arc(cx, cy - 2, 9, 0, Math.PI * 2); ctx.fill();
  }

  function drawTukTuk(cx, cy) {                // GrabTukTuk: three wheels and a canopy
    ctx.fillStyle = '#111116';                 // rear wheels + front wheel
    roundRect(cx - 28, cy + 12, 9, 20, 4); ctx.fill();
    roundRect(cx + 19, cy + 12, 9, 20, 4); ctx.fill();
    roundRect(cx - 4, cy - 40, 8, 16, 4); ctx.fill();
    ctx.fillStyle = TIER_COLORS[1];            // body, narrower at the nose
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 38);
    ctx.quadraticCurveTo(cx - 24, cy - 20, cx - 24, cy + 4);
    ctx.lineTo(cx - 24, cy + 30); ctx.lineTo(cx + 24, cy + 30);
    ctx.lineTo(cx + 24, cy + 4);
    ctx.quadraticCurveTo(cx + 24, cy - 20, cx + 10, cy - 38);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#15151a';                 // canopy over the cab
    roundRect(cx - 20, cy - 8, 40, 34, 8); ctx.fill();
    ctx.fillStyle = 'rgba(165, 220, 255, 0.9)';// windscreen
    roundRect(cx - 12, cy - 26, 24, 12, 4); ctx.fill();
    ctx.fillStyle = '#fff9d9';                 // single headlamp
    ctx.beginPath(); ctx.arc(cx, cy - 36, 4, 0, Math.PI * 2); ctx.fill();
  }

  function drawCarBody(cx, cy) {
    const v = CAR_STYLE[tier];
    const top = cy - 44 - v.stretch, h = 88 + v.stretch * 2;
    ctx.fillStyle = '#111116';                 // wheels
    roundRect(cx - 31, top + 12, 9, 22, 4); ctx.fill();
    roundRect(cx + 22, top + 12, 9, 22, 4); ctx.fill();
    roundRect(cx - 31, top + h - 34, 9, 22, 4); ctx.fill();
    roundRect(cx + 22, top + h - 34, 9, 22, 4); ctx.fill();
    if (v.spoiler) {
      ctx.fillStyle = '#0c0c10';
      roundRect(cx - 22, top + h - 6, 44, 8, 3); ctx.fill();
    }
    ctx.fillStyle = TIER_COLORS[tier];         // body
    roundRect(cx - 26, top, 52, h, 14); ctx.fill();
    if (tier === S.TIERS.length - 1) {         // Exec gets the gold trim
      ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 3;
      roundRect(cx - 26, top, 52, h, 14); ctx.stroke();
    }
    if (v.stripe) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(cx - 2, top + 4, 4, h - 8);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';   // sheen
    roundRect(cx - 20, top + 4, 18, h - 8, 9); ctx.fill();
    ctx.fillStyle = 'rgba(165, 220, 255, 0.9)';    // windscreen
    roundRect(cx - 18, top + 12, 36, 20, 6); ctx.fill();
    ctx.fillStyle = 'rgba(165, 220, 255, 0.55)';   // rear window
    roundRect(cx - 16, top + h - 24, 32, 14, 5); ctx.fill();
    ctx.fillStyle = '#fff9d9';                     // headlamps
    roundRect(cx - 20, top + 2, 10, 5, 2); ctx.fill();
    roundRect(cx + 10, top + 2, 10, 5, 2); ctx.fill();
  }
```

(`drawCarBody` at `stretch: 0` is geometry-identical to the old `drawCar`; the invulnerability flash and ground shadow moved up into `drawVehicle` so all three vehicle types share them. `roundRect(x, y, w, h, r)` is the existing helper at lines 185-193 - callers call `.fill()`/`.stroke()` themselves.)

Then update the call site in `draw()` (currently line 305) from `drawCar(laneCenter(carLane), carY());` to:

```js
    drawVehicle(laneCenter(carLane), carY());
```

- [ ] **Step 8: Render popups in `draw()`**

Directly after the `drawVehicle(...)` call and BEFORE the centre-feedback block (currently lines 307-314), add:

```js
    for (const p of popups) {                  // score popups float up and fade
      const age = elapsed - p.born;
      ctx.globalAlpha = Math.max(0, 1 - age / POPUP_LIFE);
      ctx.font = 'bold 26px system-ui';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(4, 14, 9, 0.85)';
      ctx.strokeText(p.text, p.x, p.y - age * 70);
      ctx.fillStyle = p.good ? '#ffd76a' : '#ff8f81';
      ctx.fillText(p.text, p.x, p.y - age * 70);
      ctx.globalAlpha = 1;
    }
```

(`draw()` already sets `textAlign = 'center'` at the top of every frame, so no alignment reset is needed.)

- [ ] **Step 9: Force-close an open quiz in `end()`**

`end()` (currently lines 317-326) becomes:

```js
  function end() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    if (quiz) { clearInterval(quiz.interval); clearTimeout(quiz.timeout); }
    hud.banner.classList.remove('visible');    // a quiz may be open at the buzzer
    quiz = null;                               // unanswered = no gain, no penalty
    canvas.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    onFinish(S.finalScore(score, tier), tier);
  }
```

(Clearing already-fired timers is a harmless no-op, so the 900 ms settle-resume window needs no special casing - `resume()` already returns early on `finished`.)

- [ ] **Step 10: Replace `frame()` (currently lines 328-338) with the wall-clock version**

```js
  function frame(ts) {
    if (last === null) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);  // clamp background-tab jumps
    last = ts;
    wall += dt;                                // the 90 s heat clock never pauses
    if (!quiz) {                               // the world still freezes mid-quiz
      update(dt);
      draw();
    }
    hud.time.textContent = Math.max(0, Math.ceil(HEAT_DURATION_MS / 1000 - wall));
    if (wall * 1000 >= HEAT_DURATION_MS) { end(); return; }
    raf = requestAnimationFrame(frame);
  }
```

- [ ] **Step 11: Verify**

Run: `node --check js/game.js`
Expected: no output (clean parse).

Run: `npm test`
Expected: PASS - 19 tests.

Run: `grep -c "Ouch" js/game.js`
Expected: `0` (grep exits 1 - that is the pass condition).

Run: `grep -n "drawCar\b" js/game.js`
Expected: no matches (only `drawCarBody` remains).

- [ ] **Step 12: Commit**

```bash
git add js/game.js
git commit -m "feat: wall-clock hard stop, score popups, six vehicle drawings"
```

---

### Task 3: Mutual-claim pairing rules + shared phase clock (TDD)

**Files:**
- Rewrite: `js/pairing.js`
- Create: `js/phase.js`
- Rewrite: `tests/pairing.test.js`
- Create: `tests/phase.test.js`

**Interfaces:**
- Consumes: `MATCH_BONUS`, `HEAT_DURATION_MS`, `BONUS_ROUND_MS` from `js/config.js` (Task 1).
- Produces (Tasks 4 and 5 rely on these exact signatures):
  - `validatePartner(me, other, allPlayers) -> { ok: true } | { ok: false, reason: <pinned copy> }`
  - `bonusAwarded(player, allPlayers) -> boolean` (mutual claims + rules pass)
  - `buildLeaderboard(players, matchBonus = MATCH_BONUS)` - byte-identical behaviour to today
  - `connectionStats(players) -> { connected, total }` (total = ALL players)
  - `computePhase(startedAtIso, nowMs) -> { phase: 'heat'|'bonus'|'over', heatRemainingMs, bonusRemainingMs } | null`
  - `parseStartedAt(iso) -> epoch ms | null`, `COUNTDOWN_MS = 3_000`
- DELETES: `computePairs` (see the intra-branch note in Global Constraints - `admin-app.js` keeps importing it until Task 5; that is expected and not yours to fix).

- [ ] **Step 1: Rewrite the pairing tests**

Replace the entire contents of `tests/pairing.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePartner, bonusAwarded, buildLeaderboard, connectionStats } from '../js/pairing.js';

// Minimal player rows - only the columns the pairing logic reads.
const P = (slack_id, tech_family, bucket, extra = {}) =>
  ({ slack_id, tech_family, bucket, ...extra });

test('accepts a different-TF, same-bucket partner', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'FS', 'Drive');
  assert.deepEqual(validatePartner(me, other, [me, other]), { ok: true });
});

test('rejects an unknown ID', () => {
  const me = P('a', 'Mobility', 'Drive');
  const verdict = validatePartner(me, undefined, [me]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /No player with that ID/);
});

test('rejects yourself', () => {
  const me = P('a', 'Mobility', 'Drive');
  const verdict = validatePartner(me, me, [me]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /That's you/);
});

test('rejects the same Tech Family', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'Mobility', 'Drive');
  const verdict = validatePartner(me, other, [me, other]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /Same Tech Family/);
});

test('rejects a different commute bucket', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'FS', 'Grab');
  const verdict = validatePartner(me, other, [me, other]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /travel the same way/);
});

test('rejects someone already mutually paired with a third player', () => {
  const me = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Drive', { claimed_match: 'c' });
  const c = P('c', 'GFB', 'Drive', { claimed_match: 'b' });
  const verdict = validatePartner(me, b, [me, b, c]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /already paired/);
});

test('accepts someone who has already claimed ME (completing the pair)', () => {
  const me = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Drive', { claimed_match: 'a' });
  assert.deepEqual(validatePartner(me, b, [me, b]), { ok: true });
});

test('bonus needs mutual claims', () => {
  const a = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'FS', 'Drive', { claimed_match: 'a' });
  const c = P('c', 'GFB', 'Drive', { claimed_match: 'a' });   // one-sided
  const all = [a, b, c];
  assert.equal(bonusAwarded(a, all), true);
  assert.equal(bonusAwarded(b, all), true);
  assert.equal(bonusAwarded(c, all), false);
});

test('no bonus without a claim, or when the partner never reciprocates', () => {
  const a = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Drive', { claimed_match: 'a' });
  const all = [a, b];
  assert.equal(bonusAwarded(a, all), false);   // never claimed anyone
  assert.equal(bonusAwarded(b, all), false);   // claimed a, but a never reciprocated
});

test('mutual claims still fail the rules: same TF or different bucket', () => {
  const a = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'Mobility', 'Drive', { claimed_match: 'a' });   // same TF
  const c = P('c', 'FS', 'Drive', { claimed_match: 'd' });
  const d = P('d', 'GFB', 'Grab', { claimed_match: 'c' });         // different bucket
  const all = [a, b, c, d];
  assert.equal(bonusAwarded(a, all), false);
  assert.equal(bonusAwarded(b, all), false);
  assert.equal(bonusAwarded(c, all), false);
  assert.equal(bonusAwarded(d, all), false);
});

test('leaderboard adds bonus, sorts desc, excludes non-finishers', () => {
  const a = P('a', 'Mobility', 'Drive', { score: 100, claimed_match: 'b' });
  const b = P('b', 'FS', 'Drive', { score: 50, claimed_match: 'a' });
  const c = P('c', 'GFB', 'Grab', { score: 120 });
  const late = P('late', 'ACE', 'Drive', { score: null });
  const rows = buildLeaderboard([a, b, c, late], 35);
  assert.deepEqual(rows.map(r => r.slack_id), ['a', 'c', 'b']);   // 135, 120, 85
  assert.equal(rows[0].display_score, 135);
  assert.equal(rows[0].connected, true);
  assert.equal(rows[1].connected, false);
  assert.equal(rows.length, 3);
});

test('connection stats count everyone as the base', () => {
  const a = P('a', 'Mobility', 'Drive', { score: 10, claimed_match: 'b' });
  const b = P('b', 'FS', 'Drive', { score: 20, claimed_match: 'a' });
  const e = P('e', 'GFB', 'Drive', { score: 0 });
  assert.deepEqual(connectionStats([a, b, e]), { connected: 2, total: 3 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - the pairing test file errors with "does not provide an export named 'validatePartner'". Scoring's 10 still pass.

- [ ] **Step 3: Rewrite `js/pairing.js`**

Replace the entire file with:

```js
import { MATCH_BONUS } from './config.js';

// Bonus round: no assigned matches. Players find their own partner in the
// room, swap Slack IDs, and both type the other's ID. A pair counts when
// the claims are mutual AND the pairing rules hold. Mutuality is what makes
// "one pair per person" automatic: each player has a single claimed_match
// column, so nobody can be half of two mutual pairs at once.

// The pairing rules, shared by claim validation and scoring.
function rulesOk(a, b) {
  return a.slack_id !== b.slack_id          // not yourself
    && a.tech_family !== b.tech_family      // different Tech Family
    && a.bucket === b.bucket;               // travels the same way
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
  if (other.bucket !== me.bucket) {
    return { ok: false, reason: "They don't travel the same way as you - find someone who does." };
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
  const connected = players.filter(p => bonusAwarded(p, players)).length;
  return { connected, total: players.length };
}
```

- [ ] **Step 4: Run the pairing tests**

Run: `npm test`
Expected: PASS - 22 tests (10 scoring + 12 pairing).

- [ ] **Step 5: Write the phase tests**

Create `tests/phase.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePhase, parseStartedAt, COUNTDOWN_MS } from '../js/phase.js';
import { HEAT_DURATION_MS, BONUS_ROUND_MS } from '../js/config.js';

const START = '2026-08-16T04:00:00Z';
const T0 = Date.parse(START);
const HEAT_END = COUNTDOWN_MS + HEAT_DURATION_MS;    // 93 s after start
const BONUS_END = HEAT_END + BONUS_ROUND_MS;         // 183 s after start

test('heat phase while the drive is on', () => {
  const p = computePhase(START, T0 + 10_000);
  assert.equal(p.phase, 'heat');
  assert.equal(p.heatRemainingMs, HEAT_END - 10_000);
  assert.equal(p.bonusRemainingMs, BONUS_ROUND_MS);
});

test('bonus phase starts exactly when the heat ends', () => {
  const p = computePhase(START, T0 + HEAT_END);
  assert.equal(p.phase, 'bonus');
  assert.equal(p.bonusRemainingMs, BONUS_ROUND_MS);
});

test('bonus counts down', () => {
  const p = computePhase(START, T0 + HEAT_END + 60_000);
  assert.equal(p.phase, 'bonus');
  assert.equal(p.bonusRemainingMs, BONUS_ROUND_MS - 60_000);
});

test('over when the bonus window closes', () => {
  const p = computePhase(START, T0 + BONUS_END);
  assert.equal(p.phase, 'over');
  assert.equal(p.heatRemainingMs, 0);
  assert.equal(p.bonusRemainingMs, 0);
});

test('parses PostgREST offset, bare, and Z timestamp variants as UTC', () => {
  assert.equal(parseStartedAt('2026-08-16T04:00:00+00:00'), T0);
  assert.equal(parseStartedAt('2026-08-16T04:00:00'), T0);
  assert.equal(parseStartedAt('2026-08-16T04:00:00Z'), T0);
});

test('garbage start times return null instead of a guessed phase', () => {
  assert.equal(parseStartedAt(null), null);
  assert.equal(parseStartedAt(''), null);
  assert.equal(parseStartedAt('not a date'), null);
  assert.equal(computePhase(null, T0), null);
});
```

- [ ] **Step 6: Run tests to verify the phase tests fail**

Run: `npm test`
Expected: FAIL - the phase test file cannot find module `../js/phase.js`. The other 22 pass.

- [ ] **Step 7: Create `js/phase.js`**

```js
import { HEAT_DURATION_MS, BONUS_ROUND_MS } from './config.js';

// Every screen derives "where are we in the game" from one shared anchor:
// game_state.started_at. No extra status writes, no per-screen timers.
//
//   heat  = 3 s countdown + 90 s of driving   (started_at .. +93 s)
//   bonus = 90 s to pair up                   (+93 s .. +183 s)
//   over  = final leaderboard, entries locked (+183 s ..)
export const COUNTDOWN_MS = 3_000;

export function computePhase(startedAtIso, nowMs) {
  const t0 = parseStartedAt(startedAtIso);
  if (t0 === null) return null;
  const heatEnd = t0 + COUNTDOWN_MS + HEAT_DURATION_MS;
  const bonusEnd = heatEnd + BONUS_ROUND_MS;
  if (nowMs < heatEnd) {
    return { phase: 'heat', heatRemainingMs: heatEnd - nowMs, bonusRemainingMs: BONUS_ROUND_MS };
  }
  if (nowMs < bonusEnd) {
    return { phase: 'bonus', heatRemainingMs: 0, bonusRemainingMs: bonusEnd - nowMs };
  }
  return { phase: 'over', heatRemainingMs: 0, bonusRemainingMs: 0 };
}

// PostgREST returns "2026-08-16T04:00:00+00:00"; our own writes store
// "...Z". Some engines also emit bare "...T04:00:00" - that is UTC too,
// so append the missing marker rather than letting Date.parse guess
// local time.
export function parseStartedAt(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const hasTz = /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso);
  const t = Date.parse(hasTz ? iso : iso + 'Z');
  return Number.isNaN(t) ? null : t;
}
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS - 28 tests (10 scoring + 12 pairing + 6 phase).

- [ ] **Step 9: Commit**

```bash
git add js/pairing.js js/phase.js tests/pairing.test.js tests/phase.test.js
git commit -m "feat: mutual-claim pairing rules and shared phase clock"
```

---

### Task 4: Player bonus flow - @ fields, HUD name, self-serve pairing

**Files:**
- Modify: `index.html` (entry label, HUD, results section)
- Modify: `dev.html` (one word)
- Modify: `css/style.css` (three edits)
- Rewrite: `js/player-app.js`

**Interfaces:**
- Consumes: `validatePartner`, `bonusAwarded` from `js/pairing.js`; `computePhase` from `js/phase.js`; `BONUS_ROUND_MS`, `MATCH_BONUS` from config; `db.normaliseSlackId`, `db.claimMatch`, `db.getPlayers`, `db.getGameState` (all already exported).
- Produces: the player UI. Element ids Task 5 does NOT share (admin has its own): `bonus-timer` exists in BOTH pages, which is why the CSS below scopes the player one under `#screen-results` and Task 5 scopes the admin one under `body.admin`.
- Must NOT reference: `db.onOwnRow`, `match_slack_id`, or the `'match_round'` status - all three die this round.

- [ ] **Step 1: Update `index.html`**

(a) The Slack ID label (currently lines 16-19) becomes:

```html
    <label>Slack ID (this is your name on the leaderboard)
      <span class="id-field"><span class="at">@</span><input id="slack-id"
             placeholder="jionglin.low" autocomplete="off"
             autocapitalize="none" spellcheck="false"></span>
    </label>
```

(b) The HUD (currently lines 41-45) gains a name slot and starts on the new bottom tier:

```html
    <div id="hud">
      <span>Score <b id="hud-score">0</b></span>
      <span id="hud-name"></span>
      <span id="hud-tier">GrabBike</span>
      <span><b id="hud-time">90</b>s</span>
    </div>
```

(c) In the results section, the final-tier line's initial text changes from `Standard` to `GrabBike`:

```html
    <p>You finished in the <b id="final-tier">GrabBike</b> tier.</p>
```

(d) The whole `match-block` div (currently lines 56-67) becomes:

```html
    <div id="match-block">
      <h3>Bonus round</h3>
      <p id="bonus-timer"></p>
      <p class="self-label">You are</p>
      <p class="self-id" id="self-id"></p>
      <p class="self-label">Show this screen when you meet someone.</p>
      <p id="match-instructions"></p>
      <div id="claim-form">
        <span class="id-field"><span class="at">@</span><input id="claim-input"
               placeholder="their.slack.id" autocomplete="off"
               autocapitalize="none" spellcheck="false"></span>
        <button id="claim-btn" class="primary">We met - confirm</button>
      </div>
      <p id="claim-status"></p>
    </div>
```

(The old `match-name` and `match-context` elements are deleted.)

- [ ] **Step 2: Update `dev.html`**

Line 14: `<span id="hud-tier">Standard</span>` becomes `<span id="hud-tier">GrabBike</span>`. Nothing else in this file changes.

- [ ] **Step 3: Update `css/style.css` (three edits)**

(a) Directly AFTER the rule `label > input, label > select { margin-top: .35rem; }` (currently line 17), add:

```css
/* @-prefixed ID fields - the @ is furniture, users type only the ID */
.id-field {
  display: flex; align-items: center;
  background: #131a16; border: 1px solid #2c3a31; border-radius: 10px;
}
label .id-field { margin-top: .35rem; }
.id-field:focus-within { border-color: #00b14f; }
.id-field .at { padding-left: .85rem; color: #9db3a6; font-weight: 700; }
.id-field input {
  flex: 1; margin: 0; border: 0; background: transparent; padding-left: .3rem;
}
.id-field input:focus { outline: none; }
```

(b) In the game-screen section (after the `#hud b` rule), add:

```css
#hud-name { color: #9db3a6; font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 28%; }
```

(c) DELETE the `.match-name` rule (currently line 86: `.match-name { font-size: 1.7rem; font-weight: 800; margin: .5rem 0; }`) and put in its place:

```css
#screen-results #bonus-timer { color: #ffd76a; font-weight: 800; min-height: 1.3em; }
.self-label { color: #9db3a6; margin: .2rem 0; }
.self-id {
  font-size: 2.4rem; font-weight: 800; color: #ffd76a;
  margin: .1rem 0 .4rem; word-break: break-all;
}
```

- [ ] **Step 4: Rewrite `js/player-app.js`**

Replace the entire file with:

```js
import { GAME_NAME, TECH_FAMILIES, BUCKET_QUESTION, BUCKET_OPTIONS,
         MATCH_BONUS, BONUS_ROUND_MS } from './config.js';
import { QUESTIONS } from './questions.js';
import { TIERS } from './scoring.js';
import { startGame } from './game.js';
import * as db from './db.js';
import { bonusAwarded, validatePartner } from './pairing.js';
import { computePhase } from './phase.js';

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
  const iv = setInterval(() => {
    n -= 1;
    if (n === 0) { clearInterval(iv); play(); }
    else $('count-num').textContent = n;
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
    'Find someone from a different Tech Family who travels the same way as you. '
    + 'Swap Slack IDs, type theirs below - you both get +' + MATCH_BONUS + '.';
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
    const other = players.find(pl => pl.slack_id === typed);
    const verdict = validatePartner(me, other, players);
    if (!verdict.ok) { $('claim-status').textContent = verdict.reason; return; }
    await db.claimMatch(me.id, typed);
    me = { ...me, claimed_match: typed };
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
```

Design notes baked into that file (context for review, not extra work):
- `claim()` re-fetches players on every press, so a player can switch partner freely until a claim goes mutual.
- `enterBonus` is idempotent (`bonusEntered`), because both `onGameFinish` and `onState` can reach it.
- If `computePhase` says the shared clock is still in the heat when a phone finishes (clock skew), the phone grants itself the full `BONUS_ROUND_MS` - by design, per the accepted trade-offs.
- The empty-input and fetch-failed strings are the two non-owner-pinned copies; keep them exactly as written for consistency with `db.claimMatch`.

- [ ] **Step 5: Verify**

Run: `node --check js/player-app.js`
Expected: no output.

Run: `npm test`
Expected: PASS - 28 tests.

Run: `grep -n "onOwnRow\|match_slack_id\|match_round" js/player-app.js`
Expected: no matches (grep exits 1).

- [ ] **Step 6: Commit**

```bash
git add index.html dev.html css/style.css js/player-app.js
git commit -m "feat: player bonus round - @ fields, HUD name, self-serve pairing"
```

---

### Task 5: Admin auto-phases + db cleanup + facilitator script

**Files:**
- Modify: `admin.html` (delete one button, replace the match view)
- Modify: `css/style.css` (append two admin rules)
- Rewrite: `js/admin-app.js`
- Modify: `js/db.js` (delete two functions)
- Rewrite: `docs/facilitator-script.md`

**Interfaces:**
- Consumes: `computePhase` from `js/phase.js`; `buildLeaderboard`, `connectionStats` from `js/pairing.js`; existing db exports (`getGameState`, `setGameStatus`, `newSession`, `onPlayers`, `onGameState`).
- DELETES: `db.assignMatches` (currently `js/db.js` lines 71-82) and `db.onOwnRow` (currently lines 116-127). This also removes the last imports of `computePairs`, healing the intra-branch breakage from Task 3.
- Fixes a pre-existing bug on the way: the old `runTimer` anchored to `Date.now()` at page load, so refreshing the admin mid-heat restarted the 93 s display. The new ticker anchors to `started_at`.

- [ ] **Step 1: Update `admin.html`**

(a) DELETE line 40 (`<button id="start-match" ...>Start the match round</button>`) from `view-heat`. The host presses one button all game.

(b) Replace the whole `view-match` div (currently lines 43-50) with:

```html
<div id="view-match" class="admin-view">
  <div class="admin-head">
    <h1 id="match-title">Bonus round</h1>
    <span id="bonus-timer"></span>
    <span id="connected-count">0 of 0 connected</span>
    <button class="admin-btn ghost new-game">Start new game</button>
  </div>
  <p id="bonus-rule"></p>
  <table class="board"><tbody id="board-match"></tbody></table>
</div>
```

- [ ] **Step 2: Append the admin CSS**

At the end of the Admin section of `css/style.css`, add:

```css
body.admin #bonus-timer { font-size: 4rem; font-weight: 800; color: #ffd76a; }
body.admin #bonus-rule { color: #cfe3d6; font-size: 1.3rem; margin: .4rem 0 1rem; }
```

(Scoped under `body.admin` because the player page has its own `#bonus-timer`.)

- [ ] **Step 3: Rewrite `js/admin-app.js`**

Replace the entire file with:

```js
import { GAME_NAME, MATCH_BONUS } from './config.js';
import * as db from './db.js';
import { buildLeaderboard, connectionStats } from './pairing.js';
import { computePhase } from './phase.js';

const $ = id => document.getElementById(id);
let players = [];
let ticker = null;

init();

async function init() {
  document.title = GAME_NAME + ' - Control Room';
  $('admin-title').textContent = GAME_NAME + ' - Control Room';
  $('bonus-rule').textContent =
    'Find someone from a different Tech Family who travels the same way as you. '
    + 'Swap Slack IDs - you both type them in. +' + MATCH_BONUS + ' each.';

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
  for (const v of ['setup', 'heat', 'match']) {
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
```

(`render()` and `esc()` are behaviourally identical to the current file - only the handshake emoji is written as an escape for source-encoding safety; keep the literal emoji if you prefer, both render identically. `setPhase`, `runTimer`, and `startMatchRound` are gone; `applyState`/`showView`/`ensureTicker`/`stopTicker` replace them.)

- [ ] **Step 4: Delete the two dead functions from `js/db.js`**

DELETE `assignMatches` (currently lines 71-82, including its comment block) and `onOwnRow` (currently lines 116-127). Touch nothing else in the file.

- [ ] **Step 5: Rewrite `docs/facilitator-script.md`**

Replace the entire file with:

```markdown
# Facilitator run book - Grab Rush (10 minutes)

## Before the session (day before + 30 min before)
- [ ] Open `admin.html` on the projector laptop; confirm the QR renders
- [ ] Press **Start new game** (clears the room and board from rehearsals)
- [ ] Phone check: join from your own phone on mobile data; confirm your
      name appears in the waiting room; press **Start new game** again after
- [ ] Paste the player URL in the session Slack channel, pinned, for
      virtual attendees
- [ ] Charge the projector laptop; hotspot as wifi backup

## Script

You press ONE button all game: **Start the heat**. Everything after it -
the 90-second drive, the bonus round, the final board - runs on a shared
clock, automatically.

**0:00** - "Phones out, scan the QR - or grab the link pinned in Slack.
Slack ID, Tech Family, one question. You have two minutes."
(Watch the counter climb. Chase stragglers by name - it is on the screen.)

**2:00** - "Locking the doors. 3... 2... 1..." then press **Start the
heat**. Add: "Steer into the gold VIP circles - they pause your road for
a trivia question... but not the clock. Correct answers upgrade your
ride - GrabBike all the way up to Exec."
Latecomers: they are swept into whatever stage is running - do not restart.

**2:05-3:35** - The heat. Commentate the board as scores land. Call out
Tech Families, not just names. Everyone stops at the same moment - the
clock runs even during quiz questions.

**~3:35** - The big screen flips to the bonus round on its own. Read the
rule aloud: "Find someone from a DIFFERENT Tech Family who travels the
SAME way as you. Show them the big @name on your phone, swap IDs, you
BOTH type each other's in. Both of you get +35. Remote folks: DM someone
on the call. 90 seconds - go."
Commentate the connected counter as pairs land.

**~5:05** - The screen flips to the final board on its own; entries lock.
Crown the winner: "drove well AND got off their chair." Note the
connected counter: "X new cross-TF conversations in 90 seconds."

**5:30-10:00** - Top 3 stand up / wave on the call. One line each: name,
Tech Family. Segue into the session.

## If things break
- Player page will not load: mobile data, not office wifi; the URL is
  also pinned in Slack
- Waiting-room count stuck: refresh `admin.html` - state is in the
  database, nothing is lost, and the timers re-anchor to the shared clock
- A player's score did not land: their phone shows "Could not reach the
  leaderboard - show this screen to the host". Read it out, note it
  manually
- Someone's bonus claim will not go through: the phone says exactly why
  (wrong spelling, same Tech Family, different commute answer, already
  paired). Trust the phone.
- Supabase down entirely: players screenshot their results screens into
  the Slack channel; eyeball the top 3; pair people by pointing - "left
  half of the room, find someone on the right half from another TF"

## After
- Screenshot the final board for the follow-up post
- Round two some day? Just press **Start new game**. Run `docs/reset.sql`
  only to purge all data for good
```

- [ ] **Step 6: Verify**

Run: `node --check js/admin-app.js && node --check js/db.js`
Expected: no output.

Run: `npm test`
Expected: PASS - 28 tests.

Run: `grep -rn "assignMatches\|onOwnRow\|computePairs\|match_round" js/`
Expected: no matches (grep exits 1) - the intra-branch breakage is healed and assigned matching is fully gone.

- [ ] **Step 7: Commit**

```bash
git add admin.html css/style.css js/admin-app.js js/db.js docs/facilitator-script.md
git commit -m "feat: admin auto-phases on the shared clock; drop assigned matching"
```

---

## After the tasks

Final whole-branch review (superpowers:requesting-code-review) on the package from base b901cca, one fix wave if needed, then push to `origin/main` and verify GitHub Pages serves the new build (curl the live `js/game.js` for `drawVehicle` as the marker, ~50 s deploy). Deliverables to the owner: a fresh solo end-to-end test script covering the bonus flow, a plain-English diff summary, and a design critique table.
