# Playtest Round 2 + Round 3 Implementation Plan (bonus round, wall clock, seven tiers, Grab look, sound)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the owner's second- and third-playtest feedback into the live game with zero database schema changes. Round 2 (Tasks 1-3, already landed): @-prefixed ID fields, a 90-second wall-clock hard stop, the player's name on screen, mutual-claim pairing rules, score popups, and the shared phase clock. Round 3 (Tasks 4-8): the pairing bucket rule flips to DIFFERENT commute buckets, the player bonus-round flow and admin control room land, the admin page gets a client-side password gate and the title `PM Connect - GrabRush!`, the vehicle ladder grows to seven tiers drawn in the real Grab app design language, the VIP pickup becomes a big gold question coin, and lightweight synthesised sounds arrive (no audio files).

**Architecture:** A pure module `js/phase.js` derives the game stage (heat, bonus, over) for every screen from one shared anchor, `game_state.started_at` - no new status writes, no per-screen timers. Pairing is mutual claims validated by rules (different Tech Family, DIFFERENT commute bucket) in `js/pairing.js`. In `js/game.js` the heat clock splits from game time: `wall` always advances (hard stop at 90 s), `elapsed` still freezes during quizzes (physics, popups, feedback). Sound is a new `js/sound.js` module: one lazy `AudioContext` unlocked on the first user gesture, pure Web Audio synthesis, safe no-ops before unlock.

**Tech Stack:** unchanged - vanilla ES modules, canvas, Supabase REST via the CDN `window.supabase` client, `node --test`, GitHub Pages.

## Global Constraints

These describe the FINAL target state after Task 8. Round 3 (Tasks 4-8) supersedes anything in the Task 1-3 text that contradicts this section - the Task 1-3 text is kept as history of what was built, not as current truth.

- Repo: `/Users/jionglin.low/Projects/pm-connect-game`. Work on `main` (established practice for this project). Never touch the live Supabase database - no REST calls, no SQL. All tests are pure Node.
- **Zero DB schema changes.** `game_state.status` is only ever `'waiting'` or `'started'`; never write `'match_round'`. `players.match_slack_id` stays in the schema but goes unused.
- `TIERS` exactly (7 entries): `['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', '6 Seater', 'Premium', 'Exec']`. `'6 Seater'` sits at index 4. `MAGNET_TIER` stays `2` (Standard). Reaching Exec takes six correct quiz answers.
- `TECH_FAMILIES` exactly (14 entries): ACE, BTP, COREX, Data Product, Ecomm, Geo & IoT, PSPO, FS, Integrity, Mobility, FF, SPA, GFB, Other.
- `BONUS_ROUND_MS = 90_000`. Phase boundaries from `started_at`: heat until +93 s (`COUNTDOWN_MS` 3_000 + `HEAT_DURATION_MS` 90_000), bonus until +183 s, then over. Unchanged in round 3.
- **Pairing rule (round 3, REVERSED from round 2):** partner must be a DIFFERENT `tech_family` AND a DIFFERENT `bucket` (they travel to the office a different way), and not yourself. A pair counts only when claims are mutual. One pair per person is automatic: each player has a single `claimed_match` column.
- **Canonical claim writes:** the player claim step resolves the typed partner ID (trim, strip a leading `@`, match case-insensitively against the session's player list) and writes the CANONICAL stored `slack_id` into `claimed_match` - never the raw input. `js/pairing.js` comparisons are strict `===`, so a cosmetic mismatch would silently kill the bonus. No match found = pairing's not-found error, nothing written.
- **Admin password gate:** admin.html shows a password screen first. Password `grabrocket`, checked client-side only (it is visible to anyone reading the public source - a deterrent, not security). Success sets `sessionStorage['grabrush_admin_ok'] = '1'` so a refresh does not re-ask.
- **Admin title:** browser title AND on-page h1 exactly `PM Connect - GrabRush!`. The player-facing `GAME_NAME` stays `'Grab Rush'` - do not touch it.
- All user-facing numbers come from config imports (`MATCH_BONUS`, `COIN_POINTS`, `COLLISION_PENALTY`, `TIER_BONUS`) - never hard-code them in UI strings or popups.
- Canvas drawings only. No Grab asset files (logos, fonts, images) may be added to the repo. Sound is synthesised with the Web Audio API - ZERO audio asset files.
- **Grab design language (visual only - collision boxes, lane logic and spawn behaviour unchanged):** vehicles are flat 2D side-view canvas shapes styled like the real Grab app fleet icons. Palette intent (exact hexes adaptable for canvas contrast): white/off-white bodies `#F2F4F5` with green-tinted windows (light green fill `#7DDFA8`, darker green edge `#00B14F`), dark charcoal wheels `#2A2E32` with light hubs. GrabBike = white scooter, green seat and small green front accent. GrabTukTuk = white body, GREEN canopy, open dark cabin, three wheels. Standard = plain white sedan. Plus = white sedan plus a small GOLD four-point sparkle badge `#F5A623` near the bonnet. 6 Seater = white MPV/van - longer, taller, boxy roofline, three side windows. Premium = dark charcoal/near-black sedan `#26292C`. Exec = BLACK MPV `#101214`, tall and boxy like the 6 Seater, GOLD trim line `#D4A94E` along the side, darker windows. Coins = outer gold ring `#F5A623`, lighter inner disc `#FFC94D`, bold dark-goldenrod `#8A5A00` `G` glyph; the mystery coin (replaces the VIP pickup visual) is ~1.8-2x the normal coin radius with a bold `?` instead of the `G`.
- **Pinned copy** - use EXACTLY (British English, no em dashes; `35` always interpolated from `MATCH_BONUS`):
  - Player bonus instruction: `Find someone from a different Tech Family who travels to the office a different way. Swap Slack IDs, type theirs below - you both get +35. Tip: you can also find someone on Slack.`
  - Self block: label `You are`, then the big `@<slack_id>`, then `Show this screen when you meet someone.`
  - Player countdown: `Bonus round: <n>s left`
  - Closed: `Bonus round closed - your score stands.`
  - Not found: `No player with that ID this round - check the spelling.`
  - Yourself: `That's you! Find someone else.`
  - Same TF: `Same Tech Family - find someone from a different one.`
  - Same bucket (round 3, replaces the old different-bucket error): `They travel the same way as you - find someone who doesn't.`
  - Taken: `They're already paired with someone else.`
  - Saved: `Saved. Now make sure they type YOUR ID too.`
  - Connected: `Connected! +35 points for you both.`
  - Empty input: `Type their Slack ID first.` (`db.claimMatch` already throws exactly this string - reuse it, do not reword)
  - Fetch failed: `Could not reach the game - try again.`
  - Admin rule line (wording adaptable, content pinned - must say all of): different Tech Family + travels to the office a different way + swap Slack IDs and both type them in + +35 each + you can also find people on Slack. Reference wording: `Find someone from a different Tech Family who travels to the office a different way. Swap Slack IDs - you both type them in. +35 each. You can also find people on Slack.`
  - Admin view titles: `Bonus round` during the window, `Final results` after.
  - Password screen: label `Admin password`, button `Enter`, error `Wrong password.`
  - In-game quiz banner: `Bonus question!` (replaces the old `VIP` copy; no user-facing `VIP` text remains anywhere).
- **Accepted trade-offs - do NOT "fix" these:** ~3 s start skew between phones; refresh mid-heat = a fresh 90 s run; device clock skew of a few seconds; a late joiner during the heat drives the full 90 s and gets whatever bonus window the shared clock leaves (possibly none); slow quiz answers eat driving time; collision boxes stay lane-based regardless of vehicle drawing; the anon key can update rows; reset is session-bump based; the admin password sits in the public page source (deterrent only, not security); sound stays silent until the first user gesture on mobile (browser autoplay policy).
- **Known intra-branch state:** Task 3 deleted `computePairs` while `js/admin-app.js` still imports it, so the admin page's module is dead in the working tree until Task 6 rewrites `admin-app.js`. Intentional - nothing deploys until after the final review. Tests never load `admin-app.js`, so `npm test` stays green throughout.
- Tests: `npm test` runs `node --test tests/*.test.js`. Suite is 28 at the round-3 base (c2fa44b), 29 after Task 4 (13 pairing), still 29 after Task 5 and Task 6 (no test changes), still 29 after Task 7 (scoring suite rewritten for seven tiers but stays 10 tests), still 29 after Task 8 (sound is browser-only, manual verification).

**Delight pass additions (Tasks 9-10). Everything above still stands except where a line below names an override; these are append-only amendments, made after Tasks 4-6 landed:**

- **Excluded by owner decision - do not build, do not "restore" from the design review:** R16 (cone tumble), R17 (near-miss whoosh), R39 (join milestone banners). The review file marks them; the owner cut them. Anyone implementing this plan who adds them is off-plan.
- **No new hazards or power-up types.** The delight pass changes feel, staging and copy - never the game economy. Coins, the mystery coin, tiers and the pairing bonus are the entire scoring surface before and after Tasks 9-10.
- **Sound ceiling:** every cue routes through the one `MASTER_GAIN` node in `js/sound.js`; it stays in the 0.12-0.15 band (Task 8 set 0.13). New cues (Tasks 9-10 add five) get no private louder path - a conference room with a PA does not need a hotter mix.
- **Delight-pass copy overrides** (these supersede the pinned lines above; each is also marked inline where it happens):
  - R1 (Task 9): the join button reads `Join the starting grid` and the waiting-room heading `You're on the grid, <name>` - replaces the copy installed by Task 5.
  - R29 (Task 9): the self block's third element becomes the badge rule `Pair with someone where both badges differ. Show them this screen.` (with the two commute/TF badges rendered above it) - replaces `Show this screen when you meet someone.` from the pinned self block.
  - R34 (Task 9): in the final 10 seconds of the bonus round, unpaired players' instruction line is swapped for `10 seconds - grab anyone with different badges!`. The pinned countdown format `Bonus round: <n>s left` stands throughout.
  - R35 (Task 9): the lock line for unpaired players becomes `No pair this time - your driving score stands. Go and say hello to someone anyway. No points required.` - replaces `Bonus round closed - your score stands.`
- Tests: still 29 after Task 9 and still 29 after Task 10 - both are DOM, canvas and Web Audio work with no pure-logic changes (the admin page stays untested by design). Any drop below 29 during Tasks 9-10 is a regression, not an expected renumber.

---

### Task 1: Six-tier config + real Tech Families (transcription tier)

> Status: complete (see .superpowers/sdd/progress.md). Superseded in part: the six-tier `TIERS` array this task installed is replaced by the seven-tier ladder in Task 7. `TECH_FAMILIES`, `BONUS_ROUND_MS` and the rest stand.

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

> Status: complete (see .superpowers/sdd/progress.md). Superseded in part: the six vehicle drawings, style tables, coin and VIP visuals this task installed are restyled and extended to seven tiers by Task 7. The wall-clock split, popups and quiz force-close stand.

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

> Status: complete (see .superpowers/sdd/progress.md). Superseded in part: the same-bucket pairing rule this task installed is REVERSED by Task 4 (round 3: partner must travel a DIFFERENT way). The mutual-claim model, phase clock and everything else stand.

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

### Task 4: Flip the pairing bucket rule (TDD)

Round 3 reverses round 2's rule: a valid partner now travels to the office a DIFFERENT way (different `bucket`), still from a different Tech Family. This task also pins the idempotent re-claim guard with a test - the guard exists in the code (a player re-validating a partner they are already mutually connected with gets `ok: true`, not "already paired") but nothing tested it.

**Files:**
- Modify: `js/pairing.js` (two small edits)
- Rewrite: `tests/pairing.test.js` (13 tests)

**Interfaces:**
- `validatePartner(me, other, allPlayers)`, `bonusAwarded(player, allPlayers)`, `buildLeaderboard(players, matchBonus)`, `connectionStats(players)` - signatures unchanged. Task 5's player flow and Task 6's admin views consume them as-is.
- Only the rule inside `rulesOk` and one error string change.

- [ ] **Step 1: Rewrite the pairing tests for the flipped rule (red)**

Replace the entire contents of `tests/pairing.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePartner, bonusAwarded, buildLeaderboard, connectionStats } from '../js/pairing.js';

// Minimal player rows - only the columns the pairing logic reads.
const P = (slack_id, tech_family, bucket, extra = {}) =>
  ({ slack_id, tech_family, bucket, ...extra });

test('accepts a different-TF, different-bucket partner', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'FS', 'Grab');
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
  const other = P('b', 'Mobility', 'Grab');
  const verdict = validatePartner(me, other, [me, other]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /Same Tech Family/);
});

test('rejects the same commute bucket', () => {
  const me = P('a', 'Mobility', 'Drive');
  const other = P('b', 'FS', 'Drive');
  const verdict = validatePartner(me, other, [me, other]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /travel the same way/);
});

test('rejects someone already mutually paired with a third player', () => {
  const me = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Grab', { claimed_match: 'c' });
  const c = P('c', 'GFB', 'Drive', { claimed_match: 'b' });
  const verdict = validatePartner(me, b, [me, b, c]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /already paired/);
});

test('accepts someone who has already claimed ME (completing the pair)', () => {
  const me = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  assert.deepEqual(validatePartner(me, b, [me, b]), { ok: true });
});

test('re-validating an already-connected partner stays ok (idempotent re-claim)', () => {
  const me = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  assert.deepEqual(validatePartner(me, b, [me, b]), { ok: true });
});

test('bonus needs mutual claims', () => {
  const a = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  const c = P('c', 'GFB', 'Train / Bus / Walk', { claimed_match: 'a' });   // one-sided
  const all = [a, b, c];
  assert.equal(bonusAwarded(a, all), true);
  assert.equal(bonusAwarded(b, all), true);
  assert.equal(bonusAwarded(c, all), false);
});

test('no bonus without a claim, or when the partner never reciprocates', () => {
  const a = P('a', 'Mobility', 'Drive');
  const b = P('b', 'FS', 'Grab', { claimed_match: 'a' });
  const all = [a, b];
  assert.equal(bonusAwarded(a, all), false);   // never claimed anyone
  assert.equal(bonusAwarded(b, all), false);   // claimed a, but a never reciprocated
});

test('mutual claims still fail the rules: same TF or same bucket', () => {
  const a = P('a', 'Mobility', 'Drive', { claimed_match: 'b' });
  const b = P('b', 'Mobility', 'Grab', { claimed_match: 'a' });   // same TF
  const c = P('c', 'FS', 'Drive', { claimed_match: 'd' });
  const d = P('d', 'GFB', 'Drive', { claimed_match: 'c' });       // same bucket
  const all = [a, b, c, d];
  assert.equal(bonusAwarded(a, all), false);
  assert.equal(bonusAwarded(b, all), false);
  assert.equal(bonusAwarded(c, all), false);
  assert.equal(bonusAwarded(d, all), false);
});

test('leaderboard adds bonus, sorts desc, excludes non-finishers', () => {
  const a = P('a', 'Mobility', 'Drive', { score: 100, claimed_match: 'b' });
  const b = P('b', 'FS', 'Grab', { score: 50, claimed_match: 'a' });
  const c = P('c', 'GFB', 'Drive', { score: 120 });
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
  const b = P('b', 'FS', 'Grab', { score: 20, claimed_match: 'a' });
  const e = P('e', 'GFB', 'Drive', { score: 0 });
  assert.deepEqual(connectionStats([a, b, e]), { connected: 2, total: 3 });
});
```

Run `npm test`. Expect FAILURES in `tests/pairing.test.js` (the code still enforces same-bucket): at least `accepts a different-TF, different-bucket partner`, `rejects the same commute bucket`, `re-validating an already-connected partner stays ok (idempotent re-claim)`, `bonus needs mutual claims` fail. `tests/scoring.test.js` (10) and `tests/phase.test.js` (6) stay green.

- [ ] **Step 2: Flip the rule in `js/pairing.js` (green)**

Two edits. First, in `rulesOk` (currently lines 10-14), change the bucket line:

```js
function rulesOk(a, b) {
  return a.slack_id !== b.slack_id          // not yourself
    && a.tech_family !== b.tech_family      // different Tech Family
    && a.bucket !== b.bucket;               // travels a different way
}
```

(The only changes on that line: `===` becomes `!==`, and the comment becomes `// travels a different way`.)

Second, in `validatePartner`, replace the bucket branch (currently lines 29-31):

```js
  if (other.bucket !== me.bucket) {
    return { ok: false, reason: "They don't travel the same way as you - find someone who does." };
  }
```

with:

```js
  if (other.bucket === me.bucket) {
    return { ok: false, reason: "They travel the same way as you - find someone who doesn't." };
  }
```

Nothing else in the file changes - `bonusAwarded`, `buildLeaderboard`, `connectionStats` and the idempotent re-claim guard (`if (bonusAwarded(other, allPlayers) && other.claimed_match !== me.slack_id)`) all stay exactly as they are.

- [ ] **Step 3: Run the full suite**

Run `npm test`. Expect exactly 29 passing, 0 failing (13 pairing + 10 scoring + 6 phase).

- [ ] **Step 4: Commit**

```bash
git add js/pairing.js tests/pairing.test.js
git commit -m "feat: flip pairing rule to different commute buckets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Player bonus flow - @ fields, HUD name, self-serve pairing

This is round 2's player-flow task carried forward with two round-3 amendments already folded in: (1) the bonus instruction copy teaches the FLIPPED rule and adds the Slack tip; (2) the claim step writes the CANONICAL stored `slack_id` into `claimed_match`, never the raw typed value. Everything else (phase-driven transition, 90 s countdown, big self ID, live connected feedback, legacy cleanup) is unchanged in intent.

**Files:**
- Modify: `index.html` (entry label, HUD, results section)
- Modify: `dev.html` (one word)
- Modify: `css/style.css` (three edits)
- Rewrite: `js/player-app.js`

**Interfaces:**
- Consumes: `validatePartner`, `bonusAwarded` from `js/pairing.js` (Task 4's flipped rule); `computePhase` from `js/phase.js`; `BONUS_ROUND_MS`, `MATCH_BONUS` from config; `db.normaliseSlackId`, `db.claimMatch`, `db.getPlayers`, `db.getGameState` (all already exported).
- Canonical claim contract: `db.claimMatch` re-normalises its input and `db.joinGame` stores normalised (lowercased) IDs, so stored `slack_id` values are always lowercase. The claim step still resolves case-insensitively and passes `other.slack_id` (the stored row's value) - never the raw input - so the write is canonical even if a legacy row carried unexpected casing.
- Produces: the player UI. Element ids Task 6 does NOT share (admin has its own): `bonus-timer` exists in BOTH pages, which is why the CSS below scopes the player one under `#screen-results` and Task 6 scopes the admin one under `body.admin`.
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
```

Design notes baked into that file (context for review, not extra work):
- `claim()` re-fetches players on every press, so a player can switch partner freely until a claim goes mutual.
- `enterBonus` is idempotent (`bonusEntered`), because both `onGameFinish` and `onState` can reach it.
- If `computePhase` says the shared clock is still in the heat when a phone finishes (clock skew), the phone grants itself the full `BONUS_ROUND_MS` - by design, per the accepted trade-offs.
- The empty-input and fetch-failed strings are the two non-owner-pinned copies; keep them exactly as written for consistency with `db.claimMatch`.
- `db.normaliseSlackId` lowercases, so `typed` is lowercase; the `.toLowerCase()` on the stored side is what makes resolution case-insensitive.

- [ ] **Step 5: Verify**

Run: `node --check js/player-app.js`
Expected: no output.

Run: `npm test`
Expected: PASS - 29 tests.

Run: `grep -n "onOwnRow\|match_slack_id\|match_round" js/player-app.js`
Expected: no matches (grep exits 1).

Run: `grep -n "claimMatch(me.id" js/player-app.js`
Expected: exactly one match, and it passes `other.slack_id`.

- [ ] **Step 6: Commit**

```bash
git add index.html dev.html css/style.css js/player-app.js
git commit -m "feat: player bonus round - @ fields, HUD name, self-serve pairing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin control room - password gate, retitle, auto-phases, db cleanup, facilitator script

This is round 2's admin task carried forward with three round-3 amendments folded in: (1) a client-side password gate is the first thing the page shows; (2) the page is retitled to exactly `PM Connect - GrabRush!` (browser title AND h1); (3) the bonus-round rule line teaches the FLIPPED rule and adds the Slack hint. Everything else is unchanged in intent: the host presses ONE button all game, the shared clock drives heat -> bonus -> final results, timers anchor to `started_at`, and system matching (`assignMatches`, `onOwnRow`, the dangling `computePairs` import) is deleted.

**Files:**
- Modify: `admin.html` (title, gate view, delete one button, replace the match view)
- Modify: `css/style.css` (append admin rules)
- Rewrite: `js/admin-app.js`
- Modify: `js/db.js` (delete two functions)
- Rewrite: `docs/facilitator-script.md`

**Interfaces:**
- Consumes: `computePhase` from `js/phase.js`; `buildLeaderboard`, `connectionStats` from `js/pairing.js`; existing db exports (`getGameState`, `setGameStatus`, `newSession`, `onPlayers`, `onGameState`); `MATCH_BONUS` from config. `GAME_NAME` is no longer imported here - the admin title is a static pinned string, and the player-facing `GAME_NAME` stays `'Grab Rush'` untouched.
- DELETES: `db.assignMatches` (currently `js/db.js` lines 71-82) and `db.onOwnRow` (currently lines 116-127). This also removes the last consumers of `computePairs`, healing the intra-branch breakage from Task 3.
- Password gate: `grabrocket`, client-side only (visible in the public source - deterrent, not security; accepted trade-off). Unlock persists for the tab via `sessionStorage['grabrush_admin_ok'] = '1'`, so a refresh mid-game does not re-ask.
- Fixes a pre-existing bug on the way: the old `runTimer` anchored to `Date.now()` at page load, so refreshing the admin mid-heat restarted the 93 s display. The new ticker anchors to `started_at`.
- Keep both existing CDN pins in `admin.html` (supabase `@2.112.3`, qrcodejs `@04f46c6a...`) exactly as they are.

- [ ] **Step 1: Update `admin.html`**

(a) Line 6: `<title>Grab Rush - Control Room</title>` becomes `<title>PM Connect - GrabRush!</title>`.

(b) Line 15: `<h1 id="admin-title">Grab Rush - Control Room</h1>` becomes `<h1 id="admin-title">PM Connect - GrabRush!</h1>`.

(c) Directly BEFORE the `view-setup` div (currently line 13), insert the gate view, and remove ` active` from `view-setup`'s class so the gate is what an unauthenticated load shows:

```html
<div id="view-gate" class="admin-view active">
  <div id="gate-box">
    <h1>PM Connect - GrabRush!</h1>
    <label>Admin password
      <input id="admin-pass" type="password" autocomplete="off">
    </label>
    <button id="gate-btn" class="admin-btn">Enter</button>
    <p id="gate-error"></p>
  </div>
</div>

<div id="view-setup" class="admin-view">
```

(The rest of `view-setup` is unchanged. Note `type="password"` - the input masks; the check is client-side only.)

(d) DELETE line 40 (`<button id="start-match" ...>Start the match round</button>`) from `view-heat`. The host presses one button all game.

(e) Replace the whole `view-match` div (currently lines 43-50) with:

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
body.admin #gate-box { max-width: 420px; margin: 18vh auto 0; display: flex; flex-direction: column; gap: 1rem; }
body.admin #gate-error { color: #ff7a7a; min-height: 1.2em; margin: 0; }
```

(`#bonus-timer` is scoped under `body.admin` because the player page has its own `#bonus-timer`.)

- [ ] **Step 3: Rewrite `js/admin-app.js`**

Replace the entire file with:

```js
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
```

(`render()` and `esc()` are behaviourally identical to the current file - only the handshake emoji is written as an escape for source-encoding safety; keep the literal emoji if you prefer, both render identically. `setPhase`, `runTimer`, and `startMatchRound` are gone; `init`/`boot`/`applyState`/`showView`/`ensureTicker`/`stopTicker` replace them. `boot()` shows the setup view immediately; if the game is already running, `applyState` flips to the right phase view within the first state read.)

- [ ] **Step 4: Delete the two dead functions from `js/db.js`**

DELETE `assignMatches` (currently lines 71-82, including its comment block) and `onOwnRow` (currently lines 116-127). Touch nothing else in the file.

- [ ] **Step 5: Rewrite `docs/facilitator-script.md`**

Replace the entire file with:

```markdown
# Facilitator run book - Grab Rush (10 minutes)

## Before the session (day before + 30 min before)
- [ ] Open `admin.html` on the projector laptop; type the admin password
      (`grabrocket`) and confirm the QR renders
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
heat**. Add: "Steer into the big gold ? coins - they pause your road for
a bonus question... but not the clock. Correct answers upgrade your
ride - GrabBike all the way up to Exec."
Latecomers: they are swept into whatever stage is running - do not restart.

**2:05-3:35** - The heat. Commentate the board as scores land. Call out
Tech Families, not just names. Everyone stops at the same moment - the
clock runs even during quiz questions.

**~3:35** - The big screen flips to the bonus round on its own. Read the
rule aloud: "Find someone from a DIFFERENT Tech Family who travels a
DIFFERENT way to the office. Show them the big @name on your phone, swap
IDs, you BOTH type each other's in. Both of you get +35. Can't find
anyone nearby? Ping someone on Slack. Remote folks: DM someone on the
call. 90 seconds - go."
Commentate the connected counter as pairs land.

**~5:05** - The screen flips to the final board on its own; entries lock.
Crown the winner: "drove well AND got off their chair." Note the
connected counter: "X new cross-TF conversations in 90 seconds."

**5:30-10:00** - Top 3 stand up / wave on the call. One line each: name,
Tech Family. Segue into the session.

## If things break
- Player page will not load: mobile data, not office wifi; the URL is
  also pinned in Slack
- Admin page asks for the password again: new tab or new browser - type
  `grabrocket`; a plain refresh remembers the unlock
- Waiting-room count stuck: refresh `admin.html` - state is in the
  database, nothing is lost, and the timers re-anchor to the shared clock
- A player's score did not land: their phone shows "Could not reach the
  leaderboard - show this screen to the host". Read it out, note it
  manually
- Someone's bonus claim will not go through: the phone says exactly why
  (wrong spelling, same Tech Family, same commute answer, already
  paired). Trust the phone.
- Supabase down entirely: players screenshot their results screens into
  the Slack channel; eyeball the top 3; pair people by pointing - "front
  half of the room, find someone in the back half from another TF who
  got here a different way"

## After
- Screenshot the final board for the follow-up post
- Round two some day? Just press **Start new game**. Run `docs/reset.sql`
  only to purge all data for good
```

- [ ] **Step 6: Verify**

Run: `node --check js/admin-app.js && node --check js/db.js`
Expected: no output.

Run: `npm test`
Expected: PASS - 29 tests.

Run: `grep -rn "assignMatches\|onOwnRow\|computePairs\|match_round" js/`
Expected: no matches (grep exits 1) - the intra-branch breakage is healed and assigned matching is fully gone.

Run: `grep -c "PM Connect - GrabRush!" admin.html js/admin-app.js`
Expected: `admin.html:3` (title, gate h1, setup h1) and `js/admin-app.js:1`.

Run: `grep -n "GAME_NAME" js/admin-app.js`
Expected: no matches (grep exits 1) - the admin title no longer derives from the player-facing name.

- [ ] **Step 7: Commit**

```bash
git add admin.html css/style.css js/admin-app.js js/db.js docs/facilitator-script.md
git commit -m "feat: admin password gate, PM Connect retitle, shared-clock control room

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Seven-tier Grab fleet, GrabCoin restyle, and the mystery question coin

> Supersedes: Task 1's six-tier `TIERS` array and scoring tests, and Task 2's vehicle, coin, and VIP drawings in `js/game.js`. Those tasks stay complete as history; this task replaces the code they installed. Quiz trigger mechanics, spawn schedule, collision windows, and lane logic are UNCHANGED - this is a visual and naming pass plus one new tier.

The fleet becomes the real Grab ladder - GrabBike, GrabTukTuk, Standard, Plus, 6 Seater, Premium, Exec - drawn in the Grab app's own visual language: white bodies, green glass, charcoal wheels, dark premium tiers. Coins become gold GrabCoins. The VIP pickup becomes a gold mystery '?' coin, and every user-facing 'VIP' disappears.

**Files:**
- `tests/scoring.test.js` - rewritten for seven tiers (still exactly 10 tests; the suite stays at 29)
- `js/scoring.js` - `TIERS` becomes seven entries
- `js/config.js` - comments only (ladder note + quiz section wording)
- `js/game.js` - palette constants, seven-entry `CAR_STYLE`, restyled drawings, `vip` renamed to `quizCoin`
- `index.html` - static "Bonus question!" heading inside the quiz banner
- `css/style.css` - one `.q-head` rule

**Interfaces:**
- Consumes: `MAGNET_TIER = 2` from `js/config.js` (unchanged - the magnet still unlocks at index 2, Standard); `answerQuestion` / `tierPoints` / `tierSpeedMultiplier` / `tierHasMagnet` from `js/scoring.js` (all length-generic - they adapt to seven entries untouched); `QUIZ_COUNT = 6` (unchanged - six coins per heat, and six correct answers now land on Exec exactly)
- Produces: `TIERS = ['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', '6 Seater', 'Premium', 'Exec']` (index 4 is `'6 Seater'` with a space; it reaches the HUD and the results line through `TIERS[tier]`, so `js/player-app.js` and `js/admin-app.js` need no changes); `drawQuizCoin` replacing `drawVip`; zero user-facing 'VIP' text anywhere in the repo

- [ ] **Step 1: Rewrite the scoring tests for seven tiers (red)**

Replace the whole of `tests/scoring.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, collectCoin, hitObstacle, answerQuestion,
  tierPoints, finalScore, tierSpeedMultiplier, tierHasMagnet,
} from '../js/scoring.js';

test('seven tiers in order, GrabBike to Exec', () => {
  assert.deepEqual(TIERS,
    ['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', '6 Seater', 'Premium', 'Exec']);
});

test('coin adds points', () => assert.equal(collectCoin(10), 12));

test('obstacle subtracts but never below zero', () => {
  assert.equal(hitObstacle(10), 5);
  assert.equal(hitObstacle(3), 0);
});

test('correct answer upgrades one tier, capped at Exec', () => {
  assert.equal(answerQuestion(0, true), 1);
  assert.equal(answerQuestion(6, true), 6);
});

test('six correct answers climb GrabBike to Exec', () => {
  let tier = 0;
  for (let i = 0; i < 6; i++) tier = answerQuestion(tier, true);
  assert.equal(TIERS[tier], 'Exec');
});

test('wrong answer changes nothing - no gain, no penalty', () => {
  assert.equal(answerQuestion(2, false), 2);
  assert.equal(answerQuestion(0, false), 0);
});

test('tier points are 10 per tier', () => {
  assert.equal(tierPoints(0), 0);
  assert.equal(tierPoints(6), 60);
});

test('final score adds tier points to run score', () => {
  assert.equal(finalScore(80, 2), 100);
});

test('speed rises with tier', () => {
  assert.ok(tierSpeedMultiplier(6) > tierSpeedMultiplier(0));
  assert.equal(tierSpeedMultiplier(0), 1);
});

test('coin magnet from Standard up', () => {
  assert.equal(tierHasMagnet(0), false);
  assert.equal(tierHasMagnet(1), false);
  assert.equal(tierHasMagnet(2), true);
  assert.equal(tierHasMagnet(6), true);
});
```

Run: `npm test`
Expected: FAIL - exactly 2 of the 10 scoring tests fail against the six-tier code (the seven-tier order test, and the Exec cap test where `answerQuestion(6, true)` returns 5). Pairing and phase suites still pass. Note the climb test passes by coincidence on the old array (`TIERS[5]` is also `'Exec'`) - that is fine; red only needs the suite to fail.

- [ ] **Step 2: Seven tiers in `js/scoring.js` (green)**

In `js/scoring.js`, replace:

```js
export const TIERS = ['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', 'Premium', 'Exec'];
```

with:

```js
export const TIERS = ['GrabBike', 'GrabTukTuk', 'Standard', 'Plus', '6 Seater', 'Premium', 'Exec'];
```

Nothing else in the file changes - every function is length-generic.

Run: `npm test`
Expected: PASS - 29 tests. (The canvas code still indexes a six-entry `CAR_STYLE` at this point; that runtime gap is closed in Step 4, before anything is committed.)

- [ ] **Step 3: Comment touch-ups in `js/config.js`**

Comments only - no values change. Replace:

```js
export const MAGNET_TIER = 2;                    // tier index that unlocks the coin magnet (2 = Standard on the six-tier ladder)
```

with:

```js
export const MAGNET_TIER = 2;                    // tier index that unlocks the coin magnet (2 = Standard on the seven-tier ladder)
```

Replace:

```js
// Quiz (VIP pickup) tuning
export const QUIZ_COUNT = 6;          // VIP pickups per heat
export const QUIZ_SECONDS = 10;       // countdown to answer once the game pauses
export const QUIZ_FIRST_AT = 8;       // seconds into the heat the first VIP appears
export const QUIZ_LAST_AT = 75;       // seconds mark of the last VIP
```

with:

```js
// Quiz (question coin) tuning
export const QUIZ_COUNT = 6;          // question coins per heat
export const QUIZ_SECONDS = 10;       // countdown to answer once the game pauses
export const QUIZ_FIRST_AT = 8;       // seconds into the heat the first question coin appears
export const QUIZ_LAST_AT = 75;       // seconds mark of the last question coin
```

- [ ] **Step 4: Grab design language in `js/game.js`**

Five edits, all inside `js/game.js`.

**4a - palette and the seven-entry style table.** Replace:

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

with:

```js
// Grab app visual language: white fleet, green glass, charcoal wheels,
// dark premium tiers. One palette, used by every drawing below.
const GRAB_GREEN = '#00B14F';
const BODY_WHITE = '#F2F4F5';
const WHEEL_DARK = '#2A2E32';
const WHEEL_HUB = '#C9CED2';
const WIN_FILL = '#7DDFA8';
const WIN_EDGE = '#00B14F';
const GOLD = '#F5A623';
const POPUP_LIFE = 0.9;                          // seconds a score popup lives

// Car liveries, Standard to Exec. Indices 0-1 (GrabBike, GrabTukTuk)
// have their own drawing functions.
const CAR_STYLE = [null, null,
  { body: BODY_WHITE, stretch: 0,  van: false, sparkle: false, trim: null,      winAlpha: 1 },   // Standard
  { body: BODY_WHITE, stretch: 0,  van: false, sparkle: true,  trim: null,      winAlpha: 1 },   // Plus
  { body: BODY_WHITE, stretch: 10, van: true,  sparkle: false, trim: null,      winAlpha: 1 },   // 6 Seater
  { body: '#26292C',  stretch: 4,  van: false, sparkle: false, trim: null,      winAlpha: .55 }, // Premium
  { body: '#101214',  stretch: 12, van: true,  sparkle: false, trim: '#D4A94E', winAlpha: .4 },  // Exec
];
```

**4b - rename `vip` to `quizCoin` (mechanics identical).** Four small replacements:

Replace:

```js
  // VIP pickup schedule: QUIZ_COUNT spawns spread evenly across the heat.
```

with:

```js
  // Question-coin schedule: QUIZ_COUNT spawns spread evenly across the heat.
```

Replace:

```js
  let coins = [], obstacles = [], vip = null, quiz = null, popups = [];
```

with:

```js
  let coins = [], obstacles = [], quizCoin = null, quiz = null, popups = [];
```

Replace:

```js
    if (!vip && nextQuiz < quizTimes.length && wall >= quizTimes[nextQuiz]) {
      vip = { lane: Math.floor(Math.random() * 3), y: -40 };
      nextQuiz++;
    }

    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (vip) vip.y += dy;
```

with:

```js
    if (!quizCoin && nextQuiz < quizTimes.length && wall >= quizTimes[nextQuiz]) {
      quizCoin = { lane: Math.floor(Math.random() * 3), y: -40 };
      nextQuiz++;
    }

    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (quizCoin) quizCoin.y += dy;
```

Replace:

```js
    if (vip) {
      if (Math.abs(vip.y - carY()) < 50 && vip.lane === carLane) {
        const q = questions[qIndex % questions.length];
        qIndex++;
        vip = null;
        openQuiz(q);
      } else if (vip.y > H + 60) {
        vip = null;                              // missed - that quiz is gone
      }
    }
```

with:

```js
    if (quizCoin) {
      if (Math.abs(quizCoin.y - carY()) < 50 && quizCoin.lane === carLane) {
        const q = questions[qIndex % questions.length];
        qIndex++;
        quizCoin = null;
        openQuiz(q);
      } else if (quizCoin.y > H + 60) {
        quizCoin = null;                         // missed - that quiz is gone
      }
    }
```

**4c - GrabCoin and the mystery coin.** Replace the whole of `drawCoin` and `drawVip`:

```js
  function drawCoin(x, y) {                    // stylised Grab Coin
    ctx.save();
    ctx.shadowColor = 'rgba(0, 177, 79, 0.7)'; ctx.shadowBlur = 9;
    ctx.fillStyle = '#00b14f';
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#d9fcde'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui';
    ctx.fillText('G', x, y + 1);
  }
```

becomes:

```js
  function drawCoin(x, y) {                    // GrabCoin: gold ring, warm disc, bold G
    ctx.save();
    ctx.shadowColor = 'rgba(245, 166, 35, 0.7)'; ctx.shadowBlur = 9;
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFC94D';
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8A5A00'; ctx.font = 'bold 15px system-ui';
    ctx.fillText('G', x, y + 1);
  }
```

and:

```js
  function drawVip(x, y) {                     // the VIP pickup - hit it for a quiz
    const pulse = 1 + 0.08 * Math.sin(elapsed * 6);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 27 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowColor = 'rgba(255, 215, 106, 0.9)'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#3a2c00';
    ctx.font = 'bold 10px system-ui';
    ctx.fillText('★', x, y - 6);
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('VIP', x, y + 6);
  }
```

becomes:

```js
  function drawQuizCoin(x, y) {                // mystery coin - drive into it for a question
    const pulse = 1 + 0.08 * Math.sin(elapsed * 6);
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 166, 35, 0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 38 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowColor = 'rgba(245, 166, 35, 0.9)'; ctx.shadowBlur = 14;
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFC94D';
    ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8A5A00';
    ctx.font = 'bold 30px system-ui';
    ctx.fillText('?', x, y + 1);
  }
```

(The mystery coin is the GrabCoin's big sibling: same ring-disc-glyph build, 30px outer radius against the coin's 16 - just under 2x - with the pulse ring at 38. Spawn, fall speed, and the 50px collision window are untouched.)

**4d - restyled fleet drawings.** Replace the whole of `drawBike`, `drawTukTuk`, and `drawCarBody` (three functions, currently backed by `TIER_COLORS`) with these four functions plus three helpers:

```js
  function drawWheel(x, y) {                   // charcoal tyre, light hub
    ctx.fillStyle = WHEEL_DARK;
    roundRect(x, y, 9, 22, 4); ctx.fill();
    ctx.fillStyle = WHEEL_HUB;
    roundRect(x + 2.5, y + 8, 4, 6, 2); ctx.fill();
  }

  function drawWindow(x, y, w, h, r, alpha) {  // green glass with a Grab-green edge
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = WIN_FILL;
    roundRect(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = WIN_EDGE; ctx.lineWidth = 2;
    roundRect(x, y, w, h, r); ctx.stroke();
    ctx.restore();
  }

  function drawSparkle(cx, cy, r) {            // Plus: four-point gold star
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.25, cy - r * 0.25, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.25, cy + r * 0.25, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.25, cy + r * 0.25, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.25, cy - r * 0.25, cx, cy - r);
    ctx.closePath(); ctx.fill();
  }

  function drawBike(cx, cy) {                  // GrabBike: white scooter, green accents
    ctx.fillStyle = WHEEL_DARK;                // wheels
    ctx.beginPath(); ctx.arc(cx, cy - 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WHEEL_HUB;                 // hubs
    ctx.beginPath(); ctx.arc(cx, cy - 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BODY_WHITE;                // white deck
    roundRect(cx - 8, cy - 22, 16, 44, 7); ctx.fill();
    ctx.fillStyle = GRAB_GREEN;                // green front accent
    roundRect(cx - 8, cy - 22, 16, 9, 4); ctx.fill();
    ctx.strokeStyle = WHEEL_DARK;              // handlebar
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy - 16); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = GRAB_GREEN;                // green seat under the rider
    ctx.beginPath(); ctx.ellipse(cx, cy + 10, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BODY_WHITE;                // rider helmet, Grab white
    ctx.beginPath(); ctx.arc(cx, cy + 4, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GRAB_GREEN; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy + 4, 9, 0, Math.PI * 2); ctx.stroke();
  }

  function drawTukTuk(cx, cy) {                // GrabTukTuk: white body, green canopy, three wheels
    ctx.fillStyle = WHEEL_DARK;                // rear wheels + front wheel
    roundRect(cx - 28, cy + 12, 9, 20, 4); ctx.fill();
    roundRect(cx + 19, cy + 12, 9, 20, 4); ctx.fill();
    roundRect(cx - 4, cy - 40, 8, 16, 4); ctx.fill();
    ctx.fillStyle = BODY_WHITE;                // white body, narrower at the nose
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 38);
    ctx.quadraticCurveTo(cx - 24, cy - 20, cx - 24, cy + 4);
    ctx.lineTo(cx - 24, cy + 30); ctx.lineTo(cx + 24, cy + 30);
    ctx.lineTo(cx + 24, cy + 4);
    ctx.quadraticCurveTo(cx + 24, cy - 20, cx + 10, cy - 38);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = GRAB_GREEN;                // green canopy over the cab
    roundRect(cx - 20, cy - 8, 40, 34, 8); ctx.fill();
    ctx.fillStyle = '#1B1F22';                 // open dark cabin under the canopy
    roundRect(cx - 14, cy - 2, 28, 22, 6); ctx.fill();
    drawWindow(cx - 12, cy - 26, 24, 12, 4, 1);// windscreen
    ctx.fillStyle = '#fff9d9';                 // single headlamp
    ctx.beginPath(); ctx.arc(cx, cy - 36, 4, 0, Math.PI * 2); ctx.fill();
  }

  function drawCarBody(cx, cy) {
    const v = CAR_STYLE[tier];
    const halfW = v.van ? 29 : 26;             // vans sit wider and boxier
    const top = cy - 44 - v.stretch, h = 88 + v.stretch * 2;
    const corner = v.van ? 9 : 14;
    drawWheel(cx - halfW - 5, top + 12);
    drawWheel(cx + halfW - 4, top + 12);
    drawWheel(cx - halfW - 5, top + h - 34);
    drawWheel(cx + halfW - 4, top + h - 34);
    ctx.fillStyle = v.body;                    // body
    roundRect(cx - halfW, top, halfW * 2, h, corner); ctx.fill();
    ctx.strokeStyle = v.trim || 'rgba(0, 0, 0, 0.22)';  // Exec gold, others a soft edge
    ctx.lineWidth = v.trim ? 3 : 1.5;
    roundRect(cx - halfW, top, halfW * 2, h, corner); ctx.stroke();
    if (v.van) {                               // MPV: windscreen + three side-window rows
      drawWindow(cx - 18, top + 10, 36, 16, 5, v.winAlpha);
      for (let i = 0; i < 3; i++) {
        const wy = top + 34 + i * ((h - 56) / 3);
        drawWindow(cx - halfW + 5, wy, 8, 15, 3, v.winAlpha);
        drawWindow(cx + halfW - 13, wy, 8, 15, 3, v.winAlpha);
      }
    } else {                                   // sedan: windscreen + rear window
      drawWindow(cx - 18, top + 12, 36, 20, 6, v.winAlpha);
      drawWindow(cx - 16, top + h - 24, 32, 14, 5, v.winAlpha);
    }
    ctx.fillStyle = '#fff9d9';                 // headlamps
    roundRect(cx - 20, top + 2, 10, 5, 2); ctx.fill();
    roundRect(cx + 10, top + 2, 10, 5, 2); ctx.fill();
    if (v.sparkle) drawSparkle(cx, top + 7, 6);// Plus: gold sparkle on the bonnet
  }
```

`drawVehicle` itself does not change - it still dispatches tier 0 to `drawBike`, tier 1 to `drawTukTuk`, everything else to `drawCarBody`, and the old `tier === S.TIERS.length - 1` gold-trim special case is gone (trim now comes from the style table, so only Exec carries `#D4A94E`).

**4e - the draw call.** Replace:

```js
    if (vip) drawVip(laneCenter(vip.lane), vip.y);
```

with:

```js
    if (quizCoin) drawQuizCoin(laneCenter(quizCoin.lane), quizCoin.y);
```

- [ ] **Step 5: "Bonus question!" banner heading**

In `index.html`, replace:

```html
    <div id="question-banner"><p id="q-text"></p><div id="q-options"></div></div>
```

with:

```html
    <div id="question-banner"><p class="q-head">Bonus question!</p><p id="q-text"></p><div id="q-options"></div></div>
```

(Task 5 never touches this div, and `js/game.js` only writes into `#q-text` and `#q-options`, so the static heading survives every quiz open/close.)

In `css/style.css`, insert directly after the `.q-timer { ... }` block:

```css
.q-head {
  color: #F5A623; font-weight: 800; font-size: 1rem;
  letter-spacing: .04em; text-transform: uppercase; margin-bottom: .3rem;
}
```

(`.q-timer` keeps `order: -1`, so the overlay reads: countdown, then "BONUS QUESTION!", then the question and options.)

- [ ] **Step 6: Verify**

Run: `node --check js/game.js && node --check js/scoring.js && node --check js/config.js`
Expected: no output.

Run: `npm test`
Expected: PASS - 29 tests (13 pairing + 10 scoring + 6 phase).

Run: `grep -rni "vip" js/ index.html admin.html dev.html css/`
Expected: no matches (grep exits 1) - no user-facing or internal VIP naming remains.

Run: `grep -c "6 Seater" js/scoring.js && grep -n "Bonus question!" index.html`
Expected: `1`, then the `question-banner` line in `index.html`.

Then open `index.html?solo=1` in a browser: the run starts on a white GrabBike with green accents; coins are gold with a brown G; the big gold '?' coin appears about 8 s in and opens a quiz headed "Bonus question!"; each correct answer visibly changes the vehicle (white sedan, sparkle sedan, white MPV, charcoal sedan, black gold-trimmed MPV).

- [ ] **Step 7: Commit**

```bash
git add js/scoring.js js/config.js js/game.js tests/scoring.test.js index.html css/style.css
git commit -m "feat: seven-tier Grab fleet, GrabCoin restyle, mystery question coin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Synthesised game sounds (Web Audio, no files)

Small, quiet, synthesised beeps - countdown ticks, a GO, coin chirps, a crash thud, a level-up arpeggio, a finish fanfare. Everything is generated with oscillators and one noise buffer; there are no audio files and no network fetches. Browsers block autoplay, so the AudioContext is created lazily and unlocked by the first user gesture; before that every play function is a silent no-op. The iOS hardware mute switch silences Web Audio entirely - accepted, the game plays fine silent.

**Files:**
- `js/sound.js` - NEW: the whole audio module
- `js/player-app.js` - unlock on the join tap; ticks + GO in the countdown
- `js/game.js` - unlock on the first canvas tap (covers solo runs and restored sessions, which never press Join); coin, crash, level-up, and finish hooks

**Interfaces:**
- Consumes: nothing from the rest of the app - `js/sound.js` is dependency-free
- Produces: `unlockAudio()`, `playTick()`, `playGo()`, `playCoin(pitch = 1)`, `playCrash()`, `playLevelUp()`, `playFinish()`. One master GainNode at 0.13 caps overall volume. `playCoin`'s `pitch` multiplier is the streak-pitch hook Task 9 uses (R12) - defined here so Task 9 stays additive. No unit tests - this module is all Web Audio and timing; verification is manual.

- [ ] **Step 1: Create `js/sound.js`**

Complete file:

```js
// All game audio, synthesised with the Web Audio API - no files, no network.
// The AudioContext is created lazily and unlocked by the first user gesture
// (browsers block autoplay); every play function is a safe no-op before then.

const MASTER_GAIN = 0.13;   // quiet by design - a room full of phones, not a disco

let ctx = null;
let master = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                       // ancient browser: the game runs silent
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const ready = () => ctx && ctx.state === 'running';

// One enveloped oscillator note.
function tone(freq, dur, { type = 'sine', at = 0, peak = 1, slideTo = null } = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain); gain.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// A short burst of white noise (the crash).
function noise(dur, { at = 0, peak = 1 } = {}) {
  const t0 = ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, t0);
  src.connect(gain); gain.connect(master);
  src.start(t0);
}

export function playTick() {                 // countdown: short dry blip
  if (!ready()) return;
  tone(880, 0.08, { type: 'square', peak: 0.5 });
}

export function playGo() {                   // GO: bright rising fifth
  if (!ready()) return;
  tone(660, 0.12, { type: 'square', peak: 0.7 });
  tone(990, 0.25, { type: 'square', at: 0.1, peak: 0.7 });
}

export function playCoin(pitch = 1) {        // coin: two-note chirp; pitch scales on streaks
  if (!ready()) return;
  tone(1046 * pitch, 0.06, { type: 'triangle', peak: 0.8 });
  tone(1568 * pitch, 0.09, { type: 'triangle', at: 0.05, peak: 0.8 });
}

export function playCrash() {                // cone hit: noise thud + falling growl
  if (!ready()) return;
  noise(0.18, { peak: 0.5 });
  tone(180, 0.22, { type: 'sawtooth', peak: 0.6, slideTo: 70 });
}

export function playLevelUp() {              // tier upgrade: quick major arpeggio
  if (!ready()) return;
  tone(523, 0.09, { type: 'triangle', peak: 0.8 });
  tone(659, 0.09, { type: 'triangle', at: 0.08, peak: 0.8 });
  tone(784, 0.16, { type: 'triangle', at: 0.16, peak: 0.8 });
}

export function playFinish() {               // buzzer: rising three-note fanfare
  if (!ready()) return;
  tone(392, 0.15, { type: 'square', peak: 0.6 });
  tone(523, 0.15, { type: 'square', at: 0.14, peak: 0.6 });
  tone(784, 0.35, { type: 'square', at: 0.28, peak: 0.6 });
}
```

- [ ] **Step 2: Countdown ticks and unlock in `js/player-app.js`**

Add to the imports at the top of the file:

```js
import { unlockAudio, playTick, playGo } from './sound.js';
```

Replace:

```js
async function join() {
  $('entry-error').textContent = '';
```

with:

```js
async function join() {
  unlockAudio();                              // first user gesture unlocks sound
  $('entry-error').textContent = '';
```

Replace:

```js
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
```

with:

```js
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
```

- [ ] **Step 3: Game hooks in `js/game.js`**

Add to the imports at the top of the file:

```js
import { unlockAudio, playCoin, playCrash, playLevelUp, playFinish } from './sound.js';
```

Replace:

```js
  function onPointer(e) {
    if (quiz) return;                          // frozen while answering
```

with:

```js
  function onPointer(e) {
    unlockAudio();                             // solo runs and restored sessions never press Join
    if (quiz) return;                          // frozen while answering
```

In the coin filter inside `update`, replace:

```js
      if (near && laneOk) {
        score = S.collectCoin(score);
        popScore('+' + COIN_POINTS, laneCenter(c.lane), c.y, true);
        return false;
      }
```

with:

```js
      if (near && laneOk) {
        score = S.collectCoin(score);
        playCoin();
        popScore('+' + COIN_POINTS, laneCenter(c.lane), c.y, true);
        return false;
      }
```

In the obstacle filter, replace:

```js
        score = S.hitObstacle(score);
        invulnUntil = elapsed + 1.2;
        popScore('-' + COLLISION_PENALTY, laneCenter(o.lane), o.y, false);
```

with:

```js
        score = S.hitObstacle(score);
        playCrash();
        invulnUntil = elapsed + 1.2;
        popScore('-' + COLLISION_PENALTY, laneCenter(o.lane), o.y, false);
```

In `resume`, replace:

```js
    if (correct) popScore('+' + TIER_BONUS, laneCenter(carLane), carY() - 70, true);
```

with:

```js
    if (correct) playLevelUp();
    if (correct) popScore('+' + TIER_BONUS, laneCenter(carLane), carY() - 70, true);
```

In `end`, replace:

```js
    onFinish(S.finalScore(score, tier), tier);
```

with:

```js
    playFinish();
    onFinish(S.finalScore(score, tier), tier);
```

- [ ] **Step 4: Verify (manual - there are no audio unit tests)**

Run: `node --check js/sound.js && node --check js/player-app.js && node --check js/game.js`
Expected: no output.

Run: `npm test`
Expected: PASS - still 29 tests.

Run: `grep -c "sound.js" js/player-app.js js/game.js`
Expected: `js/player-app.js:1` and `js/game.js:1`.

Then, with volume up, open `index.html?solo=1`: silence until the first canvas tap (that tap unlocks audio), then coin chirps as you collect, a thud on cones, the arpeggio on a correct quiz answer, the fanfare at the buzzer. Reload and go through the real join flow (backend reachable): the join tap unlocks audio, so the 3-2-1 ticks and GO are audible before the run starts. On an iPhone, flip the mute switch and confirm the game still plays normally, just silent.

- [ ] **Step 5: Commit**

```bash
git add js/sound.js js/player-app.js js/game.js
git commit -m "feat: synthesised Web Audio - countdown, coins, crashes, upgrades, finish

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: Delight pass on the phone - waiting room life, drive juice, bonus staging

> Implements the phone-side items of `.superpowers/sdd/game-design-review.md`: R1-R10 (R8 folded into R7), R12-R15, R18-R28, R29-R36, R50. R16 (cone tumble) and R17 (near-miss whoosh) are EXCLUDED by owner decision - do not build them. R11 and R37-R49 are Task 10's turf. R2 is the mandatory fairness fix. Every quote of existing code below is the post-Task-7/8 text - run Tasks 7 and 8 first.

Three pinned-copy overrides happen here, each marked inline: R29's badge rule replaces `Show this screen when you meet someone.`, R35's kind lock copy replaces `Bonus round closed - your score stands.`, and R34 swaps the instruction line during the final 10 seconds. Everything else in the pinned-copy list stands.

**Files:**
- `js/sound.js` - three new cues appended (soft tick, bonus sting, connection chime)
- `js/game.js` - streak pitch, sparkles, shake, red flash, upgrade ceremony, boost streaks, magnet announcement, first-'?' label, quiz entrance bar, final-10 crescendo, gold rush, HUD bumps, chequered finish, plus a shared `drawBikeSprite` export
- `js/player-app.js` - dropdown placeholders + join validation, waiting-room life (count, tips, warm-up), countdown staging, bonus staging (slam, badges, copy, celebration, openers, urgency, rank)
- `index.html` - waiting/game/results markup, two full-screen overlays
- `css/style.css` - all new rules appended at the end of the file in labelled blocks

**Interfaces:**
- Consumes: post-Task-7/8 `js/game.js` (`quizCoin` naming, module-scope palette constants, `playCoin(pitch)`); `db.onPlayers(session, cb)` which returns an unsubscribe function; `bonusAwarded`, `validatePartner`, `connectionStats`, `buildLeaderboard` from `js/pairing.js`; `BUCKET_OPTIONS` strings from `js/config.js` - the opener-card keys in Step 13 MUST match them character for character
- Produces: `playSoftTick()`, `playBonusSting()`, `playChime()` in `js/sound.js` (Task 10 appends two more cues after these); `drawBikeSprite(ctx, cx, cy)` exported from `js/game.js`; new DOM ids `grid-count`, `tip-line`, `warmup-canvas`, `go-flash`, `crash-flash`, `q-bar`, `bonus-interstitial`, `self-badges`, `opener-card`, `pair-count`, `remote-line`, `rank-line`, `celebrate` - all phone-only, `admin.html` is untouched here
- No test changes: everything in this task is DOM, canvas, or Web Audio. The suite stays at 29.

- [ ] **Step 1: Three new sound cues in `js/sound.js`**

Append at the end of the file (after `playFinish`):

```js
export function playSoftTick() {              // final-10 heartbeat - well under the coin blip
  if (!ready()) return;
  tone(740, 0.05, { type: 'sine', peak: 0.25 });
}

export function playBonusSting() {            // bonus-round slam: two rising notes
  if (!ready()) return;
  tone(523, 0.14, { type: 'square', peak: 0.6 });
  tone(880, 0.3, { type: 'square', at: 0.13, peak: 0.6 });
}

export function playChime() {                 // connection made: soft two-note rise
  if (!ready()) return;
  tone(784, 0.12, { type: 'triangle', peak: 0.7 });
  tone(1175, 0.28, { type: 'triangle', at: 0.1, peak: 0.7 });
}
```

R12 (streak pitch) needs no new cue - Task 8 built the `pitch` parameter into `playCoin` for exactly this.

- [ ] **Step 2: Entry screen - racing copy, forced dropdowns, road strip (R1, R2, R3)**

In `index.html`, replace:

```html
    <h1 id="game-title">Grab Rush</h1>
    <p class="tagline">One heat. 90 seconds. Bragging rights.</p>
```

with:

```html
    <h1 id="game-title">Grab Rush</h1>
    <p class="tagline">One heat. 90 seconds. Bragging rights.</p>
    <div class="road-strip" aria-hidden="true"></div>
```

and replace:

```html
    <button id="join-btn" class="primary">Join the waiting room</button>
```

with:

```html
    <button id="join-btn" class="primary">Join the starting grid</button>
```

(R1: "grid" says game, "waiting room" says dentist. This replaces the original pre-round-3 button copy - it was never in the pinned list.)

Append at the end of `css/style.css`:

```css
/* ── Delight pass: entry (R1, R3) ───────────────────────────────── */
.road-strip {
  height: 6px; border-radius: 3px; margin: .2rem 0 1rem;
  background: repeating-linear-gradient(90deg,
    #2c2c35 0 34px, #f2f5f3 34px 52px);
  animation: roadScroll 2s linear infinite;
}
@keyframes roadScroll {
  from { background-position: 0 0; }
  to { background-position: -104px 0; }
}
```

In `js/player-app.js`, insert directly after the `show(name)` function:

```js
// R2: both dropdowns force a real choice - the bonus round's fairness
// rests on tech_family and bucket being true, not defaulted.
function addPlaceholder(sel, text) {
  const o = new Option(text, '');
  o.disabled = true; o.selected = true;
  sel.add(o);
}
```

then in `init`, replace:

```js
  for (const tf of TECH_FAMILIES) $('tech-family').add(new Option(tf, tf));
  $('bucket-label').textContent = BUCKET_QUESTION;
  for (const b of BUCKET_OPTIONS) $('bucket').add(new Option(b, b));
```

with:

```js
  addPlaceholder($('tech-family'), 'Pick your family...');
  for (const tf of TECH_FAMILIES) $('tech-family').add(new Option(tf, tf));
  $('bucket-label').textContent = BUCKET_QUESTION;
  addPlaceholder($('bucket'), 'Pick one...');
  for (const b of BUCKET_OPTIONS) $('bucket').add(new Option(b, b));
```

and in `join`, replace:

```js
async function join() {
  unlockAudio();                              // first user gesture unlocks sound
  $('entry-error').textContent = '';
  $('join-btn').disabled = true;
```

with:

```js
async function join() {
  unlockAudio();                              // first user gesture unlocks sound
  $('entry-error').textContent = '';
  if (!$('tech-family').value || !$('bucket').value) {
    $('entry-error').textContent = 'Pick your Tech Family and how you commute - the bonus round needs both.';
    return;
  }
  $('join-btn').disabled = true;
```

- [ ] **Step 3: One shared screen transition (R4)**

Append at the end of `css/style.css`:

```css
/* ── Delight pass: screen transitions (R4) ──────────────────────── */
.screen.active { animation: screenIn 250ms ease-out; }
@keyframes screenIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
```

Transform/opacity only; it runs once per activation, so the canvas and overlays inside `#screen-game` are unaffected after the first 250 ms.

- [ ] **Step 4: Waiting room life - grid heading, live count, rotating tips (R1, R5, R6)**

In `index.html`, replace:

```html
  <section id="screen-waiting" class="screen">
    <h2>You're in, <span id="waiting-name"></span></h2>
    <p>Eyes on the big screen. The heat starts when the host says go.</p>
    <div class="pulse"></div>
  </section>
```

with:

```html
  <section id="screen-waiting" class="screen">
    <h2>You're on the grid, <span id="waiting-name"></span></h2>
    <p>Eyes on the big screen. The heat starts when the host says go.</p>
    <p id="grid-count"></p>
    <div class="pulse"></div>
    <p id="tip-line"></p>
  </section>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: waiting room (R5, R6) ────────────────────────── */
#screen-waiting #grid-count { color: #f2f5f3; font-weight: 700; }
#tip-line { min-height: 2.6em; margin-top: 2rem; transition: opacity 250ms; }
```

In `js/player-app.js`, replace:

```js
let me = null;
let appState = 'entry';   // entry | waiting | countdown | playing | results
```

with:

```js
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
```

and replace:

```js
function enterWaiting() {
  appState = 'waiting';
  $('waiting-name').textContent = '@' + me.slack_id;
  show('waiting');
  db.onGameState(onState);
}
```

with:

```js
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
  db.onGameState(onState);
}
```

`leaveWaiting()` is wired into the countdown in Step 6; `db.onPlayers` returns its unsubscribe function, so the extra channel dies the moment the countdown starts. Solo mode jumps straight to the countdown and never runs any of this.

- [ ] **Step 5: The warm-up garage with the ladder preview (R7 + R8, folded)**

First, share the GrabBike art. In `js/game.js`, insert directly above `export function startGame(canvas, hud, questions, onFinish) {`:

```js
// The GrabBike sprite, shared by the in-game drawing and the waiting-room
// warm-up garage (R7/R8). Pure canvas - no game state, no closure.
export function drawBikeSprite(ctx, cx, cy) {
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  ctx.fillStyle = WHEEL_DARK;                // wheels
  ctx.beginPath(); ctx.arc(cx, cy - 30, 11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + 30, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WHEEL_HUB;                 // hubs
  ctx.beginPath(); ctx.arc(cx, cy - 30, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + 30, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BODY_WHITE;                // white deck
  rr(cx - 8, cy - 22, 16, 44, 7); ctx.fill();
  ctx.fillStyle = GRAB_GREEN;                // green front accent
  rr(cx - 8, cy - 22, 16, 9, 4); ctx.fill();
  ctx.strokeStyle = WHEEL_DARK;              // handlebar
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy - 16); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = GRAB_GREEN;                // green seat under the rider
  ctx.beginPath(); ctx.ellipse(cx, cy + 10, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BODY_WHITE;                // rider helmet, Grab white
  ctx.beginPath(); ctx.arc(cx, cy + 4, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GRAB_GREEN; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy + 4, 9, 0, Math.PI * 2); ctx.stroke();
}
```

then replace the whole of Task 7's in-closure `drawBike`:

```js
  function drawBike(cx, cy) {                  // GrabBike: white scooter, green accents
    ctx.fillStyle = WHEEL_DARK;                // wheels
    ctx.beginPath(); ctx.arc(cx, cy - 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WHEEL_HUB;                 // hubs
    ctx.beginPath(); ctx.arc(cx, cy - 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BODY_WHITE;                // white deck
    roundRect(cx - 8, cy - 22, 16, 44, 7); ctx.fill();
    ctx.fillStyle = GRAB_GREEN;                // green front accent
    roundRect(cx - 8, cy - 22, 16, 9, 4); ctx.fill();
    ctx.strokeStyle = WHEEL_DARK;              // handlebar
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy - 16); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = GRAB_GREEN;                // green seat under the rider
    ctx.beginPath(); ctx.ellipse(cx, cy + 10, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BODY_WHITE;                // rider helmet, Grab white
    ctx.beginPath(); ctx.arc(cx, cy + 4, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GRAB_GREEN; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy + 4, 9, 0, Math.PI * 2); ctx.stroke();
  }
```

with the one-line delegate:

```js
  function drawBike(cx, cy) {                  // GrabBike: shared sprite
    drawBikeSprite(ctx, cx, cy);
  }
```

In `index.html`, replace:

```html
    <p id="tip-line"></p>
  </section>
```

with:

```html
    <p id="tip-line"></p>
    <div id="warmup">
      <canvas id="warmup-canvas"></canvas>
      <p class="warmup-hint">Warm up - tap left / right.</p>
      <p id="ladder-line"></p>
      <div id="rung-dots" aria-hidden="true"><i class="lit"></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>
  </section>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: warm-up garage (R7, R8) ──────────────────────── */
#warmup { margin-top: 1.6rem; }
#warmup-canvas {
  width: 100%; height: 140px; display: block;
  border-radius: 12px; touch-action: none;
}
.warmup-hint { font-size: .85rem; }
#ladder-line { font-size: .85rem; margin-top: .4rem; }
#rung-dots { display: flex; justify-content: center; gap: .45rem; margin-top: .5rem; }
#rung-dots i { width: 8px; height: 8px; border-radius: 50%; background: #2c3a31; }
#rung-dots i.lit { background: #00b14f; }
```

In `js/player-app.js`, change the game import:

```js
import { startGame } from './game.js';
```

to:

```js
import { startGame, drawBikeSprite } from './game.js';
```

insert directly after the `leaveWaiting` function:

```js
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
```

and wire it into `enterWaiting` by replacing:

```js
  }, 4000);
  db.onGameState(onState);
}
```

with:

```js
  }, 4000);
  startWarmup();
  db.onGameState(onState);
}
```

- [ ] **Step 6: Countdown pop, GO! slam, haptics (R9, R10)**

In `index.html`, replace:

```html
    <div id="canvas-wrap"><canvas id="game-canvas"></canvas></div>
```

with:

```html
    <div id="canvas-wrap"><canvas id="game-canvas"></canvas><div id="go-flash"></div></div>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: countdown (R9) ───────────────────────────────── */
#count-num.pop { animation: digitPop 300ms ease-out; }
@keyframes digitPop {
  from { transform: scale(1.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
#count-num.c3 { color: #00b14f; }
#count-num.c2 { color: #ffb54d; }
#count-num.c1 { color: #ffd76a; }
#go-flash {
  position: absolute; inset: 0; z-index: 6; pointer-events: none;
  display: none; align-items: center; justify-content: center;
  font-size: 5.5rem; font-weight: 800; color: #00b14f;
  text-shadow: 0 4px 24px rgba(0, 177, 79, .45);
}
#go-flash.show { display: flex; animation: goSlam 400ms ease-out; }
@keyframes goSlam {
  from { transform: scale(.8); opacity: .4; }
  to { transform: scale(1.2); opacity: 1; }
}
```

In `js/player-app.js`, replace Task 8's `beginCountdown`:

```js
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
```

with:

```js
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
```

The GO! overlay lives inside `#canvas-wrap`, so it sits above the road while the game is already running behind it - anticipation, release, no dead frame. `playGo()` fires on the same tick, as the review asks.

- [ ] **Step 7: Drive juice - streak pitch, coin sparkles, crash shake and red flash (R12-R15)**

In `index.html`, replace:

```html
    <div id="canvas-wrap"><canvas id="game-canvas"></canvas><div id="go-flash"></div></div>
```

with:

```html
    <div id="canvas-wrap"><canvas id="game-canvas"></canvas><div id="go-flash"></div><div id="crash-flash"></div></div>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: crash feedback (R15) ─────────────────────────── */
#crash-flash {
  position: absolute; inset: 0; z-index: 4; pointer-events: none;
  box-shadow: inset 0 0 60px 18px rgba(255, 60, 40, .9);
  opacity: 0; transition: opacity 200ms;
}
```

In `js/player-app.js` `play()`, replace the hud object:

```js
    { score: $('hud-score'), tier: $('hud-tier'), time: $('hud-time'),
      banner: $('question-banner'), question: $('q-text'), options: $('q-options') },
```

with:

```js
    { score: $('hud-score'), tier: $('hud-tier'), time: $('hud-time'),
      banner: $('question-banner'), question: $('q-text'), options: $('q-options'),
      flash: $('crash-flash'), qbar: $('q-bar') },
```

(`q-bar` arrives in Step 9; `js/game.js` guards both, so the order never breaks solo runs.)

In `js/game.js`, five edits:

**7a - state.** Replace:

```js
  let dashOffset = 0, coinTimer = 0.4, obstacleTimer = 1.2;
  let nextQuiz = 0, qIndex = 0;
  let boostUntil = -1, invulnUntil = -1, feedback = null;
```

with:

```js
  let dashOffset = 0, coinTimer = 0.4, obstacleTimer = 1.2;
  let nextQuiz = 0, qIndex = 0;
  let boostUntil = -1, invulnUntil = -1, feedback = null;
  let streak = 0, lastCoinAt = -9;             // R12: chained pickups raise the blip's pitch
  let particles = [];                          // R13/R18: coin sparkles + upgrade confetti
  let shakeUntil = -1;                         // R14: screen shake on crash
  let whiteUntil = -1, ringStart = -1;         // R18: upgrade flash + expanding ring
  let speedLines = null;                       // R19: streaks while boosted
  let labelDone = false;                       // R21: only the first '?' carries a label
```

(R18-R21 state lands now so the var block is edited once; their behaviour follows in Step 8.)

**7b - helpers.** Insert directly after the `popScore` function:

```js
  function spawnBurst(x, y, count, color, life) {   // R13/R18: tiny squares radiating out
    for (let i = 0; i < count && particles.length < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 30;      // travels 40-70 px over its life
      particles.push({ x, y, vx: Math.cos(a) * sp / life, vy: Math.sin(a) * sp / life,
                       born: elapsed, life, color, size: 2 + Math.random() });
    }
  }

  function flashCrash() {                      // R15: red vignette, 0.35 -> 0 over 200 ms
    if (!hud.flash) return;
    hud.flash.style.transition = 'none';
    hud.flash.style.opacity = '0.35';
    void hud.flash.offsetWidth;
    hud.flash.style.transition = '';
    hud.flash.style.opacity = '0';
  }

  function bump(el) {                          // R18/R27: re-trigger a HUD pulse
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
```

**7c - the coin pickup sings and bursts.** Replace:

```js
      if (near && laneOk) {
        score = S.collectCoin(score);
        playCoin();
        popScore('+' + COIN_POINTS, laneCenter(c.lane), c.y, true);
        return false;
      }
```

with:

```js
      if (near && laneOk) {
        score = S.collectCoin(score);
        streak = elapsed - lastCoinAt < 1.2 ? Math.min(streak + 1, 12) : 0;
        lastCoinAt = elapsed;
        playCoin(Math.pow(1.0595, streak));    // R12: one semitone per streak step
        spawnBurst(laneCenter(c.lane), c.y, 5, GOLD, 0.3);   // R13
        popScore('+' + COIN_POINTS, laneCenter(c.lane), c.y, true);
        return false;
      }
```

**7d - the crash finally feels physical.** Replace:

```js
        score = S.hitObstacle(score);
        playCrash();
        invulnUntil = elapsed + 1.2;
        popScore('-' + COLLISION_PENALTY, laneCenter(o.lane), o.y, false);
```

with:

```js
        score = S.hitObstacle(score);
        playCrash();
        streak = 0;                            // a crash kills the coin streak
        shakeUntil = elapsed + 0.25;           // R14
        flashCrash();                          // R15
        invulnUntil = elapsed + 1.2;
        popScore('-' + COLLISION_PENALTY, laneCenter(o.lane), o.y, false);
```

**7e - particles live in the world.** In `update`, replace:

```js
    popups = popups.filter(p => elapsed - p.born < POPUP_LIFE);
```

with:

```js
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter(p => elapsed - p.born < p.life);
    popups = popups.filter(p => elapsed - p.born < POPUP_LIFE);
```

In `draw`, replace:

```js
  function draw() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
```

with:

```js
  function draw() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const shake = Math.max(0, shakeUntil - elapsed);     // R14: decaying jolt, max ±7 px
    if (shake > 0) {
      ctx.save();
      const amp = (shake / 0.25) * 7;
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }
```

then replace:

```js
    ctx.fillStyle = verge;
    ctx.fillRect(0, 0, W, H);
```

with:

```js
    ctx.fillStyle = verge;
    ctx.fillRect(-12, -12, W + 24, H + 24);    // oversized so the shake never bares an edge
```

then replace:

```js
    for (const c of coins) drawCoin(laneCenter(c.lane), c.y);
    for (const o of obstacles) drawCone(laneCenter(o.lane), o.y);
    if (quizCoin) drawQuizCoin(laneCenter(quizCoin.lane), quizCoin.y);
    drawVehicle(laneCenter(carLane), carY());
```

with:

```js
    for (const c of coins) drawCoin(laneCenter(c.lane), c.y);
    for (const o of obstacles) drawCone(laneCenter(o.lane), o.y);
    if (quizCoin) drawQuizCoin(laneCenter(quizCoin.lane), quizCoin.y);
    drawVehicle(laneCenter(carLane), carY());

    for (const p of particles) {               // R13/R18: sparkles and confetti
      const t = (elapsed - p.born) / p.life;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
```

and finally replace:

```js
    if (feedback && elapsed < feedback.until) {
      ctx.font = 'bold 22px system-ui';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(4, 14, 9, 0.85)';
      ctx.strokeText(feedback.text, W / 2, H * 0.32);
      ctx.fillStyle = feedback.good ? '#7dffb0' : '#ffb0a8';
      ctx.fillText(feedback.text, W / 2, H * 0.32);
    }
  }
```

with:

```js
    if (feedback && elapsed < feedback.until) {
      ctx.font = 'bold 22px system-ui';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(4, 14, 9, 0.85)';
      ctx.strokeText(feedback.text, W / 2, H * 0.32);
      ctx.fillStyle = feedback.good ? '#7dffb0' : '#ffb0a8';
      ctx.fillText(feedback.text, W / 2, H * 0.32);
    }

    if (shake > 0) ctx.restore();              // undo the crash jolt
  }
```

Append at the end of `css/style.css` (used by `bump` here and Step 10):

```css
/* ── Delight pass: HUD pulses (R18, R27) ────────────────────────── */
#hud .bump { display: inline-block; animation: hudBump 150ms ease-out; }
@keyframes hudBump {
  0% { transform: scale(1); }
  50% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
```

- [ ] **Step 8: Upgrade ceremony, boost streaks, magnet announcement, first-'?' label (R18-R21)**

All in `js/game.js`.

**8a - the promotion party.** Replace the whole post-Task-8 `resume`:

```js
  function resume(correct, picked) {
    if (finished) return;
    hud.banner.classList.remove('visible');
    const atMax = tier === S.TIERS.length - 1;   // already Exec
    tier = S.answerQuestion(tier, correct);
    if (correct && atMax) score += TIER_BONUS;   // Exec: quizzes stay worth taking
    if (correct) playLevelUp();
    if (correct) popScore('+' + TIER_BONUS, laneCenter(carLane), carY() - 70, true);
    if (correct) boostUntil = elapsed + BOOST_SECONDS;
    feedback = correct
      ? { text: atMax ? 'Exec bonus +' + TIER_BONUS + '!'
                      : 'Upgraded to ' + S.TIERS[tier] + '!',
          until: elapsed + 1.5, good: true }
      : { text: picked < 0 ? 'Time ran out - no change' : 'Not quite - no change',
          until: elapsed + 1.5, good: false };
    invulnUntil = elapsed + 0.8;                 // grace while the road restarts
    quiz = null;
  }
```

with:

```js
  function resume(correct, picked) {
    if (finished) return;
    hud.banner.classList.remove('visible');
    const atMax = tier === S.TIERS.length - 1;   // already Exec
    const before = tier;
    tier = S.answerQuestion(tier, correct);
    if (correct && atMax) score += TIER_BONUS;   // Exec: quizzes stay worth taking
    if (correct) playLevelUp();
    if (correct) popScore('+' + TIER_BONUS, laneCenter(carLane), carY() - 70, true);
    if (correct) { boostUntil = elapsed + BOOST_SECONDS; seedSpeedLines(); }
    if (tier > before) {                         // R18: the upgrade ceremony (~500 ms)
      whiteUntil = elapsed + 0.2;                //   silhouette flashes white
      ringStart = elapsed;                       //   green ring expands 20 -> 90 px
      spawnBurst(laneCenter(carLane), carY(), 4, GRAB_GREEN, 0.5);   // confetti
      spawnBurst(laneCenter(carLane), carY(), 4, GOLD, 0.5);
      bump(hud.tier);                            //   HUD tier chip pulses
    }
    feedback = correct
      ? { text: atMax ? 'Exec bonus +' + TIER_BONUS + '!'
                : !S.tierHasMagnet(before) && S.tierHasMagnet(tier)
                  ? 'Coin magnet on - side-lane coins now count'   // R20
                  : 'Upgraded to ' + S.TIERS[tier] + '!',
          until: elapsed + 1.5, good: true }
      : { text: picked < 0 ? 'Time ran out - no change' : 'Not quite - no change',
          until: elapsed + 1.5, good: false };
    invulnUntil = elapsed + 0.8;                 // grace while the road restarts
    quiz = null;
  }

  function seedSpeedLines() {                    // R19: six faint streaks, re-rolled per boost
    speedLines = [];
    for (let i = 0; i < 6; i++) {
      speedLines.push({ x: roadLeft() + Math.random() * roadWidth(),
                        y: Math.random() * H, len: 40 + Math.random() * 50 });
    }
  }
```

The ceremony fits inside the existing 0.8 s post-quiz grace window, so it never obscures a live cone. R20 rides the feedback line: crossing the magnet tier names the superpower instead of the plain upgrade text (the magnet unlock is read through `S.tierHasMagnet`, so `MAGNET_TIER` stays config-owned).

**8b - the ceremony drawn.** Replace the whole `drawVehicle`:

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
```

with:

```js
  function drawVehicle(cx, cy) {               // the player, one drawing per tier
    const flash = elapsed < invulnUntil && Math.floor(elapsed * 10) % 2 === 0;
    ctx.globalAlpha = flash ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';      // shared ground shadow
    ctx.beginPath(); ctx.ellipse(cx, cy + 42, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    if (tier === 0) drawBike(cx, cy);
    else if (tier === 1) drawTukTuk(cx, cy);
    else drawCarBody(cx, cy);
    if (elapsed < whiteUntil) {                // R18: promotion flash over the silhouette
      ctx.globalAlpha = ((whiteUntil - elapsed) / 0.2) * 0.8;
      ctx.fillStyle = '#ffffff';
      roundRect(cx - 30, cy - 58, 60, 116, 14); ctx.fill();
    }
    const ringT = elapsed - ringStart;         // R18: expanding green ring, 400 ms
    if (ringStart >= 0 && ringT <= 0.4) {
      ctx.globalAlpha = 0.6 * (1 - ringT / 0.4);
      ctx.strokeStyle = GRAB_GREEN; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, 20 + 175 * ringT, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
```

**8c - boost streaks move and show.** In `update`, replace:

```js
    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (quizCoin) quizCoin.y += dy;
```

with:

```js
    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (quizCoin) quizCoin.y += dy;
    if (speedLines) {
      for (const l of speedLines) {            // R19: streaks fall at 2x road speed
        l.y += dy * 2;
        if (l.y > H) { l.y = -l.len; l.x = roadLeft() + Math.random() * roadWidth(); }
      }
    }
```

In `draw`, replace:

```js
    ctx.setLineDash([]);

    for (const c of coins) drawCoin(laneCenter(c.lane), c.y);
```

with:

```js
    ctx.setLineDash([]);

    if (elapsed < boostUntil && speedLines) {  // R19: the boost is a secret no more
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = 3;
      for (const l of speedLines) {
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + l.len); ctx.stroke();
      }
    }

    for (const c of coins) drawCoin(laneCenter(c.lane), c.y);
```

**8d - label the first '?' (R21).** Replace:

```js
    if (!quizCoin && nextQuiz < quizTimes.length && wall >= quizTimes[nextQuiz]) {
      quizCoin = { lane: Math.floor(Math.random() * 3), y: -40 };
      nextQuiz++;
    }
```

with:

```js
    if (!quizCoin && nextQuiz < quizTimes.length && wall >= quizTimes[nextQuiz]) {
      quizCoin = { lane: Math.floor(Math.random() * 3), y: -40, labelled: !labelDone };
      labelDone = true;                        // R21: the label runs exactly once
      nextQuiz++;
    }
```

and in `draw`, replace the line installed by Step 7e:

```js
    if (quizCoin) drawQuizCoin(laneCenter(quizCoin.lane), quizCoin.y);
```

with:

```js
    if (quizCoin) {
      drawQuizCoin(laneCenter(quizCoin.lane), quizCoin.y);
      if (quizCoin.labelled) {                 // R21: kills the "is that a hazard?" pause
        ctx.font = 'bold 13px system-ui';
        ctx.fillStyle = '#ffd76a';
        ctx.fillText('Drive into it - trivia time', laneCenter(quizCoin.lane), quizCoin.y - 52);
      }
    }
```

- [ ] **Step 9: Quiz overlay entrance and timer bar (R22, R23)**

In `index.html`, replace Task 7's banner line:

```html
    <div id="question-banner"><p class="q-head">Bonus question!</p><p id="q-text"></p><div id="q-options"></div></div>
```

with:

```html
    <div id="question-banner"><p class="q-head">Bonus question!</p><p id="q-text"></p><div id="q-bar"></div><div id="q-options"></div></div>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: quiz overlay (R22, R23) ──────────────────────── */
#question-banner.visible { animation: quizIn 150ms ease-out; }
@keyframes quizIn {
  from { opacity: 0; transform: scale(.94); }
  to { opacity: 1; transform: none; }
}
.q-opt { animation: optIn 200ms ease-out backwards; }
@keyframes optIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
#q-bar { height: 4px; margin-top: .8rem; border-radius: 2px; background: #ffd76a; width: 100%; }
```

In `js/game.js` `openQuiz`, replace:

```js
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'q-opt';
      b.textContent = opt;
      b.addEventListener('click', () => settle(i));
```

with:

```js
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'q-opt';
      b.textContent = opt;
      b.style.animationDelay = (i * 40) + 'ms';   // R22: answers stagger in, reading order
      b.addEventListener('click', () => settle(i));
```

and replace:

```js
    hud.banner.classList.add('visible');
  }
```

with:

```js
    hud.banner.classList.add('visible');
    if (hud.qbar) {                            // R23: the gold bar drains over QUIZ_SECONDS
      hud.qbar.style.transition = 'none';
      hud.qbar.style.width = '100%';
      void hud.qbar.offsetWidth;
      hud.qbar.style.transition = 'width ' + QUIZ_SECONDS + 's linear';
      hud.qbar.style.width = '0%';
    }
  }
```

- [ ] **Step 10: Final-10 crescendo, gold rush, HUD score bump, chequered finish (R24-R27)**

In `js/game.js`, change Task 8's sound import:

```js
import { unlockAudio, playCoin, playCrash, playLevelUp, playFinish } from './sound.js';
```

to:

```js
import { unlockAudio, playCoin, playCrash, playLevelUp, playFinish, playSoftTick } from './sound.js';
```

**10a - gold rush (R25).** Replace:

```js
    coinTimer -= dt;
    if (coinTimer <= 0) {
      coins.push({ lane: Math.floor(Math.random() * 3), y: -30 });
      coinTimer = COIN_EVERY;
    }
```

with:

```js
    coinTimer -= dt;
    if (coinTimer <= 0) {
      coins.push({ lane: Math.floor(Math.random() * 3), y: -30 });
      coinTimer = HEAT_DURATION_MS / 1000 - wall <= 10
        ? COIN_EVERY / 2 : COIN_EVERY;         // R25: a coin shower to finish on
    }
```

**10b - HUD score pulses on change only (R27).** Replace:

```js
    hud.score.textContent = score;
    hud.tier.textContent = S.TIERS[tier];
```

with:

```js
    if (String(score) !== hud.score.textContent) {
      hud.score.textContent = score;
      bump(hud.score);                         // R27: pulse on delta, never per frame
    }
    hud.tier.textContent = S.TIERS[tier];
```

**10c - the ending announces itself (R24).** Replace the whole `frame`:

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

with:

```js
  let lastShownSecond = null, final10 = false;

  function frame(ts) {
    if (last === null) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);  // clamp background-tab jumps
    last = ts;
    wall += dt;                                // the 90 s heat clock never pauses
    if (!quiz) {                               // the world still freezes mid-quiz
      update(dt);
      draw();
    }
    const secondsLeft = Math.max(0, Math.ceil(HEAT_DURATION_MS / 1000 - wall));
    if (secondsLeft !== lastShownSecond) {     // once per displayed second
      lastShownSecond = secondsLeft;
      hud.time.textContent = secondsLeft;
      if (secondsLeft <= 10 && secondsLeft > 0) {   // R24: the last stretch is a sprint
        playSoftTick();
        hud.time.classList.add('final10');
        if (!final10) {
          final10 = true;
          popScore('FINAL 10!', W / 2, H * 0.45, true);
        }
      }
    }
    if (wall * 1000 >= HEAT_DURATION_MS) { end(); return; }
    raf = requestAnimationFrame(frame);
  }
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: final ten seconds (R24) ──────────────────────── */
#hud b.final10 {
  color: #ffb54d; display: inline-block;
  animation: timePulse 1s ease-in-out infinite;
}
@keyframes timePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}
```

**10d - the chequered flag (R26).** Replace the whole post-Task-8 `end` and the return line:

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
    playFinish();
    onFinish(S.finalScore(score, tier), tier);
  }
```

with:

```js
  function end(skipFlourish) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    if (quiz) { clearInterval(quiz.interval); clearTimeout(quiz.timeout); }
    hud.banner.classList.remove('visible');    // a quiz may be open at the buzzer
    quiz = null;                               // unanswered = no gain, no penalty
    canvas.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    const handoff = () => onFinish(S.finalScore(score, tier), tier);
    if (skipFlourish) { handoff(); return; }   // external stop: no ceremony
    playFinish();
    runFlourish(handoff);                      // R26: the run ends - it doesn't stop
  }

  // R26: chequered sweep (300 ms), then FINISH! held (800 ms), then results.
  // Wall time keeps running underneath and phase.js owns the bonus clock, so
  // the ~1.1 s ceremony only trims this player's own bonus window slightly.
  function runFlourish(done) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const t0 = performance.now();
    const sq = 40;
    let shown = false;
    const step = now => {
      const t = (now - t0) / 1000;
      if (t < 0.3) {
        const sweepY = -sq * 2 + (H + sq * 2) * (t / 0.3);
        for (let row = 0; row < 2; row++) {
          for (let x = 0, i = 0; x < W; x += sq, i++) {
            ctx.fillStyle = (i + row) % 2 === 0 ? '#111114' : '#f2f5f3';
            ctx.fillRect(x, sweepY + row * sq, sq, sq);
          }
        }
      } else if (!shown) {
        shown = true;                          // draw the card once - no compounding alpha
        ctx.fillStyle = 'rgba(4, 14, 9, 0.55)';
        ctx.fillRect(0, H * 0.3, W, H * 0.28);
        ctx.font = 'bold 44px system-ui';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(4, 14, 9, 0.9)';
        ctx.strokeText('FINISH!', W / 2, H * 0.44);
        ctx.fillStyle = '#ffd76a';
        ctx.fillText('FINISH!', W / 2, H * 0.44);
      }
      if (t < 1.1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  }
```

and replace:

```js
  return { stop: end };
```

with:

```js
  return { stop: () => end(true) };            // external stops skip the ceremony
```

The natural buzzer is the only path into the flourish. Phones that restore after the heat never call `startGame` at all (they take `showResultsShell`), so the review's "skip if resuming late" case cannot arise.

- [ ] **Step 11: Bonus intro slam (R28)**

In `index.html`, replace:

```html
  </section>

</main>
```

with:

```html
  </section>

  <div id="bonus-interstitial" aria-hidden="true">
    <p class="bi-title">BONUS ROUND</p>
    <p class="bi-sub" id="bi-sub"></p>
  </div>

</main>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: bonus interstitial (R28) ─────────────────────── */
#bonus-interstitial {
  position: fixed; inset: 0; z-index: 20;
  display: none; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(4, 14, 9, .96); text-align: center; padding: 1.4rem;
}
#bonus-interstitial.show { display: flex; }
.bi-title { font-size: 3rem; font-weight: 800; color: #ffd76a; animation: biIn 200ms ease-out; }
.bi-sub { margin-top: .8rem; font-size: 1.2rem; color: #f2f5f3; }
@keyframes biIn {
  from { transform: scale(.7); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
```

In `js/player-app.js`, replace Task 8's sound import:

```js
import { unlockAudio, playTick, playGo } from './sound.js';
```

with:

```js
import { unlockAudio, playTick, playGo, playBonusSting, playChime } from './sound.js';
```

(`playChime` is consumed in Step 13.)

In `enterBonus`, replace:

```js
  bonusEntered = true;
  deadline = Date.now() + remainingMs;
  $('self-id').textContent = '@' + me.slack_id;
```

with:

```js
  bonusEntered = true;
  deadline = Date.now() + remainingMs;
  if (remainingMs > 5000) {                     // R28: permission to stand up and move
    $('bi-sub').textContent = '+' + MATCH_BONUS + '. Stand up. Find a partner.';
    $('bonus-interstitial').classList.add('show');
    playBonusSting();
    setTimeout(() => $('bonus-interstitial').classList.remove('show'), 2000);
  }
  $('self-id').textContent = '@' + me.slack_id;
```

The 5-second guard means a phone restored with a nearly-dead bonus round is not told to stand up for a round that is over. Solo mode never calls `enterBonus`, so the slam never fires there.

- [ ] **Step 12: The name-tag screen - badges, tap-to-copy, remote line (R29, R30, R36)**

In `index.html`, replace:

```html
      <p class="self-label">You are</p>
      <p class="self-id" id="self-id"></p>
      <p class="self-label">Show this screen when you meet someone.</p>
      <p id="match-instructions"></p>
```

with:

```html
      <p class="self-label">You are</p>
      <p class="self-id" id="self-id" title="Tap to copy"></p>
      <p id="copy-toast"></p>
      <div id="self-badges"><span class="badge" id="badge-tf"></span><span class="badge" id="badge-bucket"></span></div>
      <p id="badge-rule">Pair with someone where <b>both</b> badges differ. Show them this screen.</p>
      <p id="match-instructions"></p>
```

> **Pinned-copy override (R29):** the badge rule line `Pair with someone where both badges differ. Show them this screen.` replaces the string `Show this screen when you meet someone.` installed by Task 5 and pinned in Global Constraints. The closing "After the tasks" section records this override; the rest of the self block (`You are` + big `@id`) stands.

Then replace:

```html
      <p id="claim-status"></p>
    </div>
```

with:

```html
      <p id="claim-status"></p>
      <p id="pair-count"></p>
      <p id="remote-line"><b>Joining remotely?</b> Drop your @id in the session Slack thread - anyone, anywhere can pair with you.</p>
    </div>
```

(R36's phone half. Task 10 mirrors the same line on the projector's bonus view and in the facilitator script.)

Append at the end of `css/style.css`:

```css
/* ── Delight pass: name-tag bonus screen (R29, R30, R32, R36) ───── */
.self-id { cursor: pointer; }
#copy-toast { color: #9db3a6; font-size: .85rem; min-height: 1.2em; margin: 0 0 .3rem; }
#self-badges { display: flex; gap: .5rem; margin: .3rem 0 .4rem; }
.badge {
  padding: .45rem .9rem; border-radius: 999px;
  font-size: 1.05rem; font-weight: 800;
  background: #13241b; border: 2px solid #00b14f; color: #d9fcde;
}
#badge-rule { color: #cfe3d6; margin-bottom: .5rem; }
#pair-count { color: #ffd76a; font-weight: 700; min-height: 1.2em; margin-top: .5rem; }
#remote-line { color: #9db3a6; font-size: .9rem; margin-top: .6rem; }
```

In `js/player-app.js` `enterBonus`, replace:

```js
  $('self-id').textContent = '@' + me.slack_id;
  $('match-instructions').textContent =
```

with:

```js
  $('self-id').textContent = '@' + me.slack_id;
  $('badge-tf').textContent = me.tech_family;   // R29: the phone is a wearable name tag
  $('badge-bucket').textContent = me.bucket;
  $('self-id').addEventListener('click', copyId);
  $('match-instructions').textContent =
```

and insert directly after the `enterBonus` function:

```js
// R30: remote players paste into Slack; in the room it's a harmless flourish.
async function copyId() {
  try {
    await navigator.clipboard.writeText('@' + me.slack_id);
    $('copy-toast').textContent = 'Copied - paste it in Slack';
    setTimeout(() => { $('copy-toast').textContent = ''; }, 2000);
  } catch { /* clipboard blocked - nothing to clean up */ }
}
```

- [ ] **Step 13: Pair counter, connection celebration, conversation cards (R31, R32, R33)**

In `index.html`, replace:

```html
      <p id="remote-line"><b>Joining remotely?</b> Drop your @id in the session Slack thread - anyone, anywhere can pair with you.</p>
    </div>
```

with:

```html
      <p id="remote-line"><b>Joining remotely?</b> Drop your @id in the session Slack thread - anyone, anywhere can pair with you.</p>
      <div id="opener-card">
        <p class="opener-head" id="opener-head"></p>
        <p id="opener-prompt"></p>
        <p id="opener-generic">What's your Tech Family actually building?</p>
      </div>
    </div>
```

and replace:

```html
  <div id="bonus-interstitial" aria-hidden="true">
    <p class="bi-title">BONUS ROUND</p>
    <p class="bi-sub" id="bi-sub"></p>
  </div>

</main>
```

with:

```html
  <div id="bonus-interstitial" aria-hidden="true">
    <p class="bi-title">BONUS ROUND</p>
    <p class="bi-sub" id="bi-sub"></p>
  </div>

  <div id="celebrate" aria-hidden="true"></div>

</main>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: celebration + openers (R31, R33) ─────────────── */
#opener-card {
  display: none; margin-top: .8rem; padding: .9rem 1rem;
  border-radius: 12px; background: #0e1f16; border: 1px solid #1e4a33;
}
#opener-card .opener-head { font-weight: 800; color: #00b14f; }
#opener-card p { margin: .25rem 0; }
#opener-generic { color: #9db3a6; font-size: .9rem; }
#celebrate {
  position: fixed; inset: 0; z-index: 30; display: none;
  align-items: center; justify-content: center; pointer-events: none;
}
#celebrate.show { display: flex; animation: celebrateFade 900ms ease-out forwards; }
@keyframes celebrateFade {
  0% { background: rgba(0, 177, 79, .45); }
  20% { background: rgba(0, 177, 79, .12); }
  100% { background: rgba(0, 177, 79, 0); }
}
#celebrate-emoji { font-size: 5rem; animation: emojiIn 500ms cubic-bezier(.2, 1.6, .4, 1); }
@keyframes emojiIn {
  from { transform: scale(.2); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
#celebrate i {
  position: absolute; top: -12px; width: 8px; height: 12px;
  animation: confettiFall 800ms linear forwards;
}
@keyframes confettiFall {
  to { transform: translateY(105vh) rotate(340deg); opacity: .1; }
}
```

In `js/player-app.js`, extend the pairing import:

```js
import { bonusAwarded, validatePartner } from './pairing.js';
```

becomes:

```js
import { bonusAwarded, validatePartner, connectionStats, buildLeaderboard } from './pairing.js';
```

(`buildLeaderboard` is consumed by Step 14's rank line.)

Replace the whole `checkConnected`:

```js
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

with:

```js
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
```

(Deliberate change: the poll no longer stops at connection - paired players keep a live pair count to watch. The lock's existing 5-second grace in `bonusTick` still clears `pollIv`.)

Insert directly after `checkConnected`:

```js
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
```

- [ ] **Step 14: Endgame urgency, kind lock copy, your rank (R34, R35, R50)**

In `index.html`, replace:

```html
    <p id="submit-status"></p>
```

with:

```html
    <p id="submit-status"></p>
    <p id="rank-line"></p>
```

Append at the end of `css/style.css`:

```css
/* ── Delight pass: bonus endgame + rank (R34, R50) ──────────────── */
#screen-results #bonus-timer.urgent {
  color: #ff8f81;
  animation: urgentPulse 1s ease-in-out infinite;
}
@keyframes urgentPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
#rank-line { color: #ffd76a; font-weight: 800; font-size: 1.1rem; min-height: 1.2em; }
```

In `js/player-app.js`, replace the whole `bonusTick`:

```js
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
```

with:

```js
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
```

> **Pinned-copy overrides (R34, R35):** the countdown format `Bonus round: <n>s left` stands, but in the final 10 seconds the instruction line installed by Task 5 is swapped for `10 seconds - grab anyone with different badges!` (unpaired players only), and the lock line `Bonus round closed - your score stands.` is replaced by `No pair this time - your driving score stands. Go and say hello to someone anyway. No points required.` Both are recorded in the closing "After the tasks" section. If a partner's claim lands during the 5-second grace, `checkConnected` still overwrites the lock line with the pinned `Connected! +35 points for you both.` - existing behaviour, kept.

Insert directly after `bonusTick`:

```js
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
```

- [ ] **Step 15: Verify**

Run: `node --check js/sound.js && node --check js/game.js && node --check js/player-app.js`
Expected: no output.

Run: `npm test`
Expected: PASS - still 29 tests (this task adds no logic modules).

Run: `grep -c "^export function" js/sound.js`
Expected: `10` (7 from Task 8 + 3 new cues).

Run: `grep -n "Join the starting grid" index.html && grep -n "drawBikeSprite" js/game.js js/player-app.js | head -4`
Expected: the button line, then the export + delegate in `game.js` and the import + call in `player-app.js`.

Run: `grep -rn "different badges" js/player-app.js index.html | wc -l`
Expected: `2` (R34's line swap in JS, R29's rule line in HTML).

Run: `grep -rni "vip" js/ index.html admin.html dev.html css/`
Expected: no matches - Task 7's rename survived this task.

Solo run (`index.html?solo=1`, no backend touched): countdown digits pop in green/amber/gold and GO! slams over the moving road; chained coins rise in pitch and burst gold sparkles; a crash shakes the canvas and flashes the red vignette; a correct answer plays the ceremony (white flash, green ring, confetti, HUD chip pulse) and shows the boost streaks; the first '?' carries "Drive into it - trivia time"; the quiz slides in with staggered answers and a draining gold bar; at 10 s the timer turns amber and pulses with soft ticks, "FINAL 10!" pops, coins shower; the buzzer sweeps the chequered flag and holds FINISH! before results. Solo results still show "Solo mode - score not submitted." with no bonus block.

Real-flow spot checks (two phones + the host laptop): the entry form refuses to join until both dropdowns are picked; the waiting room shows "You + N others are on the grid", rotating tips, and a steerable warm-up bike that dies at the countdown; the bonus round opens with the BONUS ROUND slam, shows both badges and the remote line, taps copy the @id; a mutual claim fires the green flash + handshake + confetti + chime on both phones within a poll tick and reveals the opener card; the pair counter ticks; the final 10 seconds pulse red and swap the instruction line; at lock the unpaired see the kind no-pair copy and everyone gets "You finished Nth of M."

- [ ] **Step 16: Commit**

```bash
git add js/sound.js js/game.js js/player-app.js index.html css/style.css
git commit -m "feat: delight pass on the phone - waiting room life, drive juice, bonus staging

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: Delight pass on the projector - countdown mirror, live billboards, the podium reveal

> Implements the projector/admin items of `.superpowers/sdd/game-design-review.md`: R11, R37, R38, R40-R49. R39 (join milestone banners) is EXCLUDED by owner decision - do not build it. R50 was phone-side and landed in Task 9. Every quote of existing code below is the current `main` text of `admin.html`, `js/admin-app.js`, and `docs/facilitator-script.md` - Tasks 7-9 leave all three untouched, so the quotes hold whether or not those tasks ran first. The `js/sound.js` and `css/style.css` steps append after Task 9's additions, so run Tasks 7-9 before this one.

The projector stops being a spreadsheet and becomes the stage: the 3-2-1 mirrored full-screen at the start, a live billboard during each round instead of a wall of alphabetical zeros, a pair ticker with a ding as connections land, and - the payoff - a facilitator-paced podium reveal with medals and three award lines. Native `confirm()`/`alert()` dialogs (grey system chrome at the most-watched moments) are replaced by an in-page modal.

Two staging decisions, made here and recorded so nobody "fixes" them later:
- **R42 rule text**: the review suggests a short rule line for the billboard; we keep the FULL pinned admin rule line installed by Task 6 (Global Constraints line: `Find someone from a different Tech Family who travels to the office a different way. Swap Slack IDs - you both type them in. +35 each. You can also find people on Slack.`) - it is pinned content, and a loud room needs the whole rule, not a summary.
- **R44 "the board dims"**: the review says the board dims when the bonus locks. Under this design the board has already been hidden all through the bonus round (the billboard is the show), so there is nothing visible to dim - the board stays hidden until the final reveal press, which is the same intent, stronger.

**Files:**
- `js/sound.js` - two new cues appended after Task 9's three (pair ding, podium sting)
- `admin.html` - rewritten: countdown overlay, how-to strip, heat billboard, bonus billboard + pair ticker, reveal bar, podium, awards, in-page modal
- `css/style.css` - all new admin rules appended at the end of the file in labelled blocks
- `js/admin-app.js` - rewritten: phase-aware rendering, join pulse, empty state, countdown mirror, billboards, ticker + ding queue, staged reveal, medals, awards, modal replacing all four native dialog call sites
- `docs/facilitator-script.md` - two-button intro, remote Slack-thread line, the reveal + awards beat

**Interfaces:**
- Consumes: `computePhase` from `js/phase.js` (its `heatRemainingMs` includes the 3 s countdown, which is exactly what the R11 mirror needs); `HEAT_DURATION_MS` and `MATCH_BONUS` from `js/config.js`; `buildLeaderboard`, `connectionStats`, and now also `bonusAwarded` from `js/pairing.js` (a connected player's `claimed_match` names the partner - that is the whole ticker data model); `unlockAudio`, `playPairDing`, `playRevealSting` from `js/sound.js`; Task 9's `.road-strip` CSS (R41 is R3 scaled up, as the review specifies)
- Produces: `playPairDing()` and `playRevealSting(step)` in `js/sound.js` (final export count 12); new DOM ids in `admin.html`: `admin-countdown`, `admin-count-num`, `how-to-strip`, `join-label`, `heat-billboard`, `racing-line`, `bonus-billboard`, `pair-counter`, `pair-ticker`, `admin-remote-line` (distinct from the phone's `remote-line` so Task 9's phone-sized CSS never applies), `reveal-bar`, `reveal-btn`, `reveal-hint`, `podium`, `awards`, `modal-backdrop`, `modal-box`, `modal-title`, `modal-line`, `modal-actions`, `modal-confirm`, `modal-cancel`. `#heat-timer` and `#bonus-timer` keep their ids but move from the header row into their billboards.
- No test changes: the admin page is DOM + Web Audio by design. The suite stays at 29.

- [ ] **Step 1: Two new sound cues in `js/sound.js`**

Append at the end of the file (after Task 9's `playChime`):

```js
export function playPairDing() {              // projector: a pair just landed (R43)
  if (!ready()) return;
  tone(1318, 0.08, { type: 'triangle', peak: 0.45 });
  tone(1760, 0.2, { type: 'triangle', at: 0.06, peak: 0.45 });
}

export function playRevealSting(step = 0) {   // podium: 0 third, 1 second, 2 first - each higher (R44)
  if (!ready()) return;
  const base = [392, 494, 587][Math.min(step, 2)];   // G4, B4, D5 - a rising triad across the presses
  tone(base, 0.12, { type: 'square', peak: 0.55 });
  tone(base * 1.5, step === 2 ? 0.45 : 0.22, { type: 'square', at: 0.11, peak: 0.55 });
}
```

Both route through Task 8's master gain (0.13), so the volume ceiling in the Global Constraints holds.

- [ ] **Step 2: `admin.html` - the new stage**

Replace the whole file with:

```html
<!doctype html>
<html lang="en" class="admin">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PM Connect - GrabRush!</title>
<link rel="stylesheet" href="css/style.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>
<script src="https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@04f46c6a0708418cb7b96fc563eacae0fbf77674/qrcode.min.js"></script>
</head>
<body class="admin">

<div id="view-gate" class="admin-view active">
  <div id="gate-box">
    <h1>PM Connect - GrabRush!</h1>
    <label>Admin password
      <input id="admin-pass" type="password" autocomplete="off">
    </label>
    <button id="gate-btn" class="admin-btn">Enter</button>
    <p id="gate-error"></p>
  </div>
</div>

<div id="view-setup" class="admin-view">
  <div class="admin-head">
    <h1 id="admin-title">PM Connect - GrabRush!</h1>
    <button class="admin-btn ghost new-game">Start new game</button>
  </div>
  <p id="admin-error" class="error"></p>
  <div id="setup-grid">
    <div>
      <div id="qr"></div>
      <span id="player-url"></span>
      <p id="how-to-strip"></p>
    </div>
    <div>
      <p class="count-big"><span id="join-count">0</span><span id="join-label"> in the waiting room</span></p>
      <div id="join-list"></div>
      <button id="start-heat" class="admin-btn" style="margin-top:1.6rem">Start the heat</button>
    </div>
  </div>
</div>

<div id="view-heat" class="admin-view">
  <div class="admin-head">
    <h1>Heat in progress</h1>
    <span><span id="finished-count">0</span> on the board</span>
    <button class="admin-btn ghost new-game">Start new game</button>
  </div>
  <div id="heat-billboard">
    <div id="heat-timer">93</div>
    <p id="racing-line"></p>
    <div class="road-strip big" aria-hidden="true"></div>
  </div>
  <table class="board"><tbody id="board-heat"></tbody></table>
</div>

<div id="view-match" class="admin-view">
  <div class="admin-head">
    <h1 id="match-title">Bonus round</h1>
    <span id="connected-count">0 of 0 connected</span>
    <button class="admin-btn ghost new-game">Start new game</button>
  </div>
  <div id="bonus-billboard">
    <div id="bonus-timer"></div>
    <p id="bonus-rule"></p>
    <p id="pair-counter">0 pairs</p>
    <ul id="pair-ticker"></ul>
    <p id="admin-remote-line"><b>Joining remotely?</b> Drop your @id in the session Slack thread - anyone, anywhere can pair with you.</p>
  </div>
  <div id="reveal-bar">
    <button id="reveal-btn" class="admin-btn">Reveal the podium</button>
    <span id="reveal-hint">or press space &middot; double-press shows everything</span>
  </div>
  <ol id="podium"></ol>
  <div id="awards"></div>
  <table class="board"><tbody id="board-match"></tbody></table>
</div>

<div id="admin-countdown" aria-hidden="true"><span id="admin-count-num">3</span></div>

<div id="modal-backdrop">
  <div id="modal-box" role="dialog" aria-modal="true">
    <h2 id="modal-title"></h2>
    <p id="modal-line"></p>
    <div id="modal-actions">
      <button id="modal-cancel" class="admin-btn ghost">Cancel</button>
      <button id="modal-confirm" class="admin-btn">Confirm</button>
    </div>
  </div>
</div>

<script type="module" src="js/admin-app.js"></script>
</body>
</html>
```

What changed against the file installed by Task 6: `#heat-timer` moved from the heat header into `#heat-billboard` (R41); the header's `#bonus-timer` span moved into `#bonus-billboard` as the huge countdown, and `#bonus-rule` moved inside the billboard with it (R42 - the JS still fills it with the pinned rule line, unchanged); `#how-to-strip` added under the QR (R40); `#join-label` wraps the waiting-room label so R38 can swap it; the reveal bar, podium, awards, countdown overlay, and modal are new. `PM Connect - GrabRush!` still appears exactly 3 times (title tag, gate h1, setup h1) - Task 6's verify count survives.

- [ ] **Step 3: Admin delight CSS**

Append at the end of `css/style.css` (after every Task 9 block):

```css
/* ── Delight pass: admin countdown mirror (R11) ─────────────────── */
#admin-countdown {
  display: none; position: fixed; inset: 0; z-index: 40;
  background: rgba(6, 12, 9, .94);
  align-items: center; justify-content: center;
}
#admin-countdown.visible { display: flex; }
#admin-count-num {
  font-size: 16rem; font-weight: 800; line-height: 1;
  animation: adminPop 300ms ease-out;
}
#admin-count-num.c3 { color: #00b14f; }
#admin-count-num.c2 { color: #ffb84d; }
#admin-count-num.c1 { color: #ffd76a; }
#admin-count-num.go { color: #00b14f; }
@keyframes adminPop {
  from { transform: scale(1.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* ── Delight pass: setup stage (R37, R38, R40) ──────────────────── */
#how-to-strip { color: #9db3a6; margin-top: .8rem; font-size: 1.05rem; max-width: 340px; }
#join-count { display: inline-block; }        /* a transform needs a box */
.bump { animation: bumpPulse 200ms ease-out; }
@keyframes bumpPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.25); }
  100% { transform: scale(1); }
}

/* ── Delight pass: heat billboard (R41) ─────────────────────────── */
#heat-billboard { text-align: center; padding: 4rem 0 2rem; }
#heat-billboard #heat-timer { font-size: 11rem; line-height: 1; display: block; }
#racing-line { font-size: 2rem; color: #cde7d8; font-weight: 700; margin: 1rem 0 2rem; }
.road-strip.big {
  height: 14px; border-radius: 7px; max-width: 720px; margin: 0 auto;
  background: repeating-linear-gradient(90deg,
    #2c2c35 0 68px, #f2f5f3 68px 104px);
  animation: roadScrollBig 2s linear infinite;
}
@keyframes roadScrollBig {
  from { background-position: 0 0; }
  to { background-position: -208px 0; }
}

/* ── Delight pass: bonus billboard + pair ticker (R42, R43) ─────── */
#bonus-billboard { text-align: center; padding: 1rem 0; }
#bonus-billboard #bonus-timer { font-size: 9rem; line-height: 1; }
body.admin #bonus-billboard #bonus-rule {
  color: #cfe3d6; font-size: 1.6rem; max-width: 60rem; margin: .6rem auto 1rem;
}
#pair-counter {
  font-size: 3rem; font-weight: 800; color: #00b14f;
  display: inline-block; margin: .4rem 0 1rem;
}
#pair-ticker { list-style: none; max-width: 46rem; margin: 0 auto; padding: 0; font-size: 1.5rem; }
#pair-ticker li { padding: .35rem 0; color: #cde7d8; animation: tickerIn 300ms ease-out; }
@keyframes tickerIn {
  from { transform: translateY(-8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
#admin-remote-line { color: #9db3a6; margin-top: 1.2rem; font-size: 1.15rem; }
#admin-remote-line b { color: #cde7d8; }

/* ── Delight pass: podium reveal + awards (R44-R48) ─────────────── */
#reveal-bar { text-align: center; padding: 3rem 0 1rem; }
#reveal-hint { display: block; margin-top: .8rem; color: #9db3a6; font-size: .95rem; }
#podium {
  list-style: none; max-width: 46rem; margin: 1rem auto; padding: 0;
  font-size: 2.2rem; text-align: center;
}
#podium li {
  padding: .7rem 0; font-weight: 800; color: #cde7d8;
  border-radius: 12px;
  animation: podiumIn 450ms ease-out;
}
#podium li small { color: #8fae9c; font-size: 1.4rem; font-weight: 700; margin: 0 .4rem; }
#podium li b { color: #ffd76a; }
#podium li.p1 {
  color: #ffd76a; font-size: 2.8rem;
  animation: podiumIn 450ms ease-out, goldFlash 900ms ease-out;
}
@keyframes podiumIn {
  from { transform: translateY(18px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes goldFlash {
  0% { background: rgba(255, 215, 106, 0); }
  25% { background: rgba(255, 215, 106, .35); }
  100% { background: rgba(255, 215, 106, 0); }
}
#awards { max-width: 46rem; margin: 1.2rem auto 0; text-align: center; }
.award { font-size: 1.35rem; color: #cde7d8; margin: .5rem 0; animation: tickerIn 300ms ease-out; }
#view-match .board { animation: boardIn 500ms ease-out; }
@keyframes boardIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ── Delight pass: in-page modal (R49) ──────────────────────────── */
#modal-backdrop {
  display: none; position: fixed; inset: 0; z-index: 50;
  background: rgba(4, 8, 6, .72);
  align-items: center; justify-content: center;
}
#modal-backdrop.visible { display: flex; }
#modal-box {
  background: #131a16; border: 1px solid #2c3a31; border-radius: 16px;
  padding: 1.6rem 1.8rem; max-width: 30rem; width: calc(100% - 4rem);
}
#modal-box h2 { color: #f2f5f3; margin-bottom: .5rem; }
#modal-line { color: #9db3a6; }
#modal-actions { display: flex; gap: .8rem; justify-content: flex-end; margin-top: 1.4rem; }
#modal-actions .ghost { margin-left: 0; }
```

`#heat-billboard #heat-timer` (two ids) out-ranks the existing `#heat-timer` 4 rem rule, and `#bonus-billboard #bonus-timer` out-ranks `body.admin #bonus-timer` - both grow without touching the old lines. The phone's `#screen-results #bonus-timer` lives in a different document and is unaffected.

- [ ] **Step 4: `js/admin-app.js` - the phase-aware control room**

Replace the whole file with:

```js
import { HEAT_DURATION_MS, MATCH_BONUS } from './config.js';
import * as db from './db.js';
import { bonusAwarded, buildLeaderboard, connectionStats } from './pairing.js';
import { computePhase } from './phase.js';
import { unlockAudio, playPairDing, playRevealSting } from './sound.js';

const $ = id => document.getElementById(id);
const ADMIN_TITLE = 'PM Connect - GrabRush!';
const ADMIN_PASS = 'grabrocket';        // client-side deterrent only - this file is public
const UNLOCK_KEY = 'grabrush_admin_ok';

let players = [];
let ticker = null;
let phase = 'setup';          // 'setup' | 'heat' | 'bonus' | 'over' - render() adapts per phase
let lastJoinCount = 0;        // R37: pulse the big number when it grows
let seenPairs = new Set();    // R42: canonical "a|b" keys already on the ticker
let pairsPrimed = false;      // first paint fills the ticker silently (mid-game refresh)
let nextDingAt = 0;           // R43: stacked pairs ding 300 ms apart, not at once
let revealStep = 0;           // R44: 0 hidden, 1 third, 2 second, 3 first, 4 everything
let podiumShown = 0;          // podium lines already inserted (append-only, so each animates once)
let lastRevealPress = 0;

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
  $('how-to-strip').textContent =       // R40: the projector teaches while the room queues
    'Swipe lanes · Coins score · Gold ? = trivia · '
    + 'Trivia upgrades your ride · After the heat: pair up for +' + MATCH_BONUS;

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
  if (p !== 'over') { revealStep = 0; podiumShown = 0; $('podium').innerHTML = ''; }
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
  const ok = await modalConfirm('Start the heat', 'Start the heat for ' + players.length + ' players?');
  if (!ok) return;
  try { await db.setGameStatus('started'); }
  catch (err) { await modalAlert('Could not start the heat', err.message); }
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
// is finally something to reveal. Each press (or space): 3rd, 2nd, 1st,
// then the full board and the awards. A quick double-press skips to everything.
function revealPress() {
  if (phase !== 'over') return;
  unlockAudio();
  const now = Date.now();
  if (now - lastRevealPress < 350) revealStep = 4;
  else revealStep = Math.min(revealStep + 1, 4);
  lastRevealPress = now;
  if (revealStep >= 1 && revealStep <= 3) playRevealSting(revealStep - 1);
  render();
}

function render() {
  renderJoinLine();
  $('join-list').innerHTML = players.map(p =>
    '<span class="chip">@' + esc(p.slack_id) +
    ' <small>' + esc(p.tech_family) + '</small></span>').join('');

  const rows = buildLeaderboard(players, MATCH_BONUS);
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

function rowHtml(r, i) {
  return '<tr class="' + (r.connected ? 'connected' : '') + '">' +
    '<td>' + medal(i) + (i + 1) + '</td><td>@' + esc(r.slack_id) + '</td>' +
    '<td>' + esc(r.tech_family) + '</td>' +
    '<td>' + r.display_score + (r.connected ? ' \u{1F91D}' : '') + '</td></tr>';
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
  $('reveal-bar').style.display = (over && revealStep < 4) ? '' : 'none';
  $('podium').style.display = (over && revealStep >= 1 && revealStep < 4) ? '' : 'none';
  $('awards').style.display = (over && revealStep >= 4) ? '' : 'none';
  $('board-match').parentElement.style.display = (over && revealStep >= 4) ? '' : 'none';
  if (!over) return;

  const podium = rows.slice(0, 3);
  const places = [                      // press order: 3rd, then 2nd, then 1st
    { idx: 2, cls: 'p3', label: '\u{1F949} 3rd' },
    { idx: 1, cls: 'p2', label: '\u{1F948} 2nd' },
    { idx: 0, cls: 'p1', label: '\u{1F451} 1st' },
  ];
  const want = Math.min(revealStep, 3);
  while (podiumShown < want) {
    const place = places[podiumShown];
    podiumShown += 1;
    const r = podium[place.idx];
    if (!r) continue;                   // fewer than three drivers: skip the gap
    const li = document.createElement('li');
    li.className = place.cls;
    li.innerHTML = place.label + ' - @' + esc(r.slack_id)
      + '<small>' + esc(r.tech_family) + '</small><b>' + r.display_score + '</b>';
    $('podium').appendChild(li);
  }
  if (revealStep >= 4) $('awards').innerHTML = awardsHtml(rows);
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
```

Everything Task 6 installed survives verbatim where it is not the point of an R-item: the gate, the pinned bonus-rule string, the QR fallback, the server-error copy, the session-reset reload, `esc()`, the leaderboard row shape (medal prefix aside), and the `Start the heat for N players?` / `Everyone goes back to the join screen and the board clears.` wording - the last two now delivered by the modal instead of `confirm()` (replaces the call sites installed by Task 6; all four native dialogs go).

- [ ] **Step 5: Facilitator script - two buttons, the remote line, the reveal beat**

In `docs/facilitator-script.md`, replace:

```
You press ONE button all game: **Start the heat**. Everything after it -
the 90-second drive, the bonus round, the final board - runs on a shared
clock, automatically.
```

with:

```
You press TWO buttons all game: **Start the heat**, and once entries
lock, **Reveal the podium**. Everything between them - the 90-second
drive, the bonus round - runs on a shared clock, automatically.
```

Replace (R36 - the same line the phones and the projector now carry; replaces text installed by Task 6):

```
IDs, you BOTH type each other's in. Both of you get +35. Can't find
anyone nearby? Ping someone on Slack. Remote folks: DM someone on the
call. 90 seconds - go."
```

with:

```
IDs, you BOTH type each other's in. Both of you get +35. Can't find
anyone nearby? Ping someone on Slack. Remote folks: drop your @id in
the session Slack thread - anyone, anywhere can pair with you. 90
seconds - go."
```

Replace (R44's run-book line plus the award beats; replaces text installed by Task 6):

```
**~5:05** - The screen flips to the final board on its own; entries lock.
Crown the winner: "drove well AND got off their chair." Note the
connected counter: "X new cross-TF conversations in 90 seconds."
```

with:

```
**~5:05** - Entries lock and the big screen goes quiet: a **Reveal the
podium** button appears. Give it a beat (the last scores land within
seconds), then press it - or tap spacebar - once per place: 3rd... 2nd...
1st. Milk each one. A final press brings up the full board and three
award lines: read the Scenic Route Award with love, the Fastest fleet
line as a challenge, and the room total as the closer ("X points, Y new
cross-TF connections in 90 seconds"). Crown the winner: "drove well AND
got off their chair." In a rush? Double-press reveals everything at once.
```

- [ ] **Step 6: Verify**

Run: `node --check js/sound.js && node --check js/admin-app.js`
Expected: no output.

Run: `npm test`
Expected: PASS - still 29 tests (this task is all DOM and Web Audio).

Run: `grep -c "^export function" js/sound.js`
Expected: `12` (7 from Task 8 + 3 from Task 9 + 2 new cues).

Run: `grep -c "PM Connect - GrabRush!" admin.html js/admin-app.js`
Expected: `admin.html:3` and `js/admin-app.js:1` - Task 6's verify still holds.

Run: `grep -n "confirm(\|alert(" js/admin-app.js`
Expected: no matches (grep exits 1) - only `modalConfirm`/`modalAlert` remain (capital letters dodge the pattern by design).

Run: `grep -rn "Joining remotely" index.html admin.html | wc -l`
Expected: `2` - the R36 line lives on the phone (Task 9) and the projector.

Run: `grep -n "Reveal the podium" admin.html docs/facilitator-script.md | wc -l`
Expected: `2` - the button exists and the run book knows it exists.

Run: `grep -n "Waiting for the first driver" js/admin-app.js && grep -n "TWO buttons" docs/facilitator-script.md`
Expected: one hit each (R38's empty state; the corrected intro).

Manual pass on the host laptop (two phones joined, real backend):
- The gate click arms audio; setup shows the how-to strip under the QR and "Waiting for the first driver..." until the first join, then "2 in the waiting room" with the number pulsing on each join.
- Start the heat: an in-page modal (no grey system chrome), then the full-screen 3-2-1-GO mirror, then the heat billboard - giant timer, "2 drivers racing", the big road strip, and NO zero-score board.
- At the buzzer the bonus billboard appears: huge countdown, the full pinned rule line, "0 pairs", the remote line. A mutual claim adds "@a 🤝 @b - Mobility × Ecomm" to the ticker with a soft ding, and the counter pulses to "1 pair".
- At the lock: "Final results", a quiet screen, the Reveal the podium button. Three presses stage 3rd, 2nd, 1st (rising stings, gold flash on 1st); a fourth fades in the full board with 👑 🥈 🥉 and the three award lines (Scenic Route only if 3+ scored; Fastest fleet only if some TF has 3+). Double-press skips to everything. Spacebar works. Refreshing mid-reveal restarts the reveal cleanly (board hidden again) with the ticker refilled silently.
- Start new game: modal, then every phone back to join.

- [ ] **Step 7: Commit**

```bash
git add js/sound.js js/admin-app.js admin.html css/style.css docs/facilitator-script.md
git commit -m "feat: delight pass on the projector - countdown mirror, billboards, podium reveal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After the tasks: review, ship, verify

> Run once Tasks 4-10 are all committed. Nothing before the final push changes the live site - GitHub Pages serves `main` on the remote, and every task above is local commits only.

- [ ] **Step 1: Whole-branch review**

Review the complete unpushed run of work, not per-task slices: `git diff b901cca..HEAD`. `b901cca` is what GitHub Pages serves today; `c2fa44b` (pinned as branch `safety/round2-done`) marks where round 2 ended and round 3 began.

On top of the usual review (bugs, dead code, unused imports, broken promises between files), check the Global Constraints as amended by the delight-pass addendum:
- Pinned copy exact, including the four overrides (R1, R29, R34, R35 - strings in the addendum above).
- Seven tiers; zero DB schema changes; no `'match_round'` write; zero asset files; no user-facing `VIP` text.
- Excluded items ABSENT: no cone tumble (R16), no near-miss whoosh (R17), no join milestone banners (R39).
- Cross-file drift: every id the JS touches exists in the HTML; `js/sound.js` has exactly 12 exports; `grep -c "PM Connect - GrabRush!" admin.html js/admin-app.js` still returns 3 and 1; no native `confirm(`/`alert(` left in `js/admin-app.js`.

Collect EVERY finding first, then dispatch ONE fix subagent with the complete list (not one subagent per finding). After fixes: `npm test` (29) and re-run each task's grep verifies.

- [ ] **Step 2: Copy-override record (promised by Task 9)**

Task 9's inline notes say the pinned-copy overrides are recorded here. They are, in the Global Constraints delight-pass addendum: R1 (`Join the starting grid` / `You're on the grid, <name>`), R29 (`Pair with someone where both badges differ. Show them this screen.`), R34 (`10 seconds - grab anyone with different badges!`), R35 (`No pair this time - your driving score stands. Go and say hello to someone anyway. No points required.`). Any future copy audit checks against the addendum, not the original pinned list alone.

- [ ] **Step 3: Fresh solo E2E script**

Write a fresh numbered manual walkthrough at `docs/e2e-solo-script.md` (replacing any earlier version) against `index.html?solo=1` - solo mode never touches the backend, so it is safe to run any time, anywhere. It must walk a human through: the join form and R1 copy, the waiting-room life, the countdown and GO, all seven tiers via quiz answers (six correct = Exec), the mystery ? coin, each sound cue firing after the first gesture, the full bonus flow (badges, claim errors, the R34 urgency swap, the R35 lock line), and the delight beats. Add a short admin section: the password gate (`grabrocket`, wrong-password error, refresh remembers), the modal replacing native dialogs, and the reveal flow - noting which admin checks need the real backend and are therefore run only on the host laptop.

- [ ] **Step 4: Diff summary + design critique**

- Produce `git diff --stat b901cca..HEAD` plus a one-line plain-English "what changed and why it's safe" (the reviewer is a non-engineer).
- Produce a design critique of the player and admin screens as a table - rows: hierarchy, typography, spacing, colour, accessibility; columns: observation and verdict. Critique only, NO auto-fixes: anything worth changing becomes a listed follow-up for the owner to approve.

- [ ] **Step 5: Ship and prove it**

```bash
git push origin main
until curl -sf https://jiongll.github.io/pm-connect-game/js/sound.js | grep -q playRevealSting; do sleep 10; done; echo LIVE
```

`playRevealSting` only exists in round 3's `js/sound.js`, so the loop exits when the new build is actually served, not when the push is merely accepted. Pages deploys take ~50 s; give it two minutes before suspecting trouble. Then a real phone check: load the live player URL, join, confirm the R1 button copy - cached HTML can lag one hard-refresh behind.

- [ ] **Step 6: Reversibility note (for the run book, and for calm)**

- `safety/round2-done` is pinned at `c2fa44b` - `git checkout safety/round2-done` is the round-2 game, whole and untouched.
- Round 3 landed as per-task commits on `main`, so any single task can be inspected or reverted surgically (`git revert <sha>`).
- The live site only changes at Step 5's push. Rolling back the event site is one command: `git push origin c2fa44b:main --force-with-lease` (or revert commits and push normally if history must stay append-only).
- The database was never migrated - schema untouched, so old and new builds both run against it. `docs/reset.sql` remains the only destructive artefact and no step here runs it.

---
