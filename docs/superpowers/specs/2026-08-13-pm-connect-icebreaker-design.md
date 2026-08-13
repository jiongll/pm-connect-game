# PM Connect Ice Breaker - Design

**Date:** 2026-08-13
**Owner:** Jiong Lin Low
**Event:** Grab Mobility PM Org hosts PM Connect, all Tech Families
**Slot:** 10 minutes, ice breaker

---

## Purpose

Get PMs from different Tech Families to actually talk to each other, using a game as the pretext.

Two success criteria, in order:

1. Most of the room has a real one-to-one conversation with a PM from another Tech Family
2. The room has fun and the session opens with energy

The game is the hook. The cross-Tech-Family pairing is the deliverable.

---

## Constraints

| Constraint | Consequence |
|---|---|
| 10 minutes total | One mechanic, learned in 20 seconds. No multi-round play |
| Builder is not an engineer | Build steps must be click-by-click guided; no git knowledge assumed |
| Little build time | Small scope, placeholder content first, real content later |
| Audience is ~80% non-Mobility PMs | Trivia cannot require Mobility knowledge to be fair |
| Hybrid: multiple physical sites plus virtual attendees | Every mechanic must work for someone sitting alone at home |
| No company server or database | Static hosting plus a free third-party backend |
| Personal free repo, not company repo | Real Grab palette is fine (owner approved - it's a Grab event); no proprietary Grab asset files (logos, fonts, images) in the public repo |

---

## Shape

Two web pages, one shared backend.

**Player page** - phone-first, portrait. Reached by QR code on the projector, or link pasted in Slack for virtual attendees.

**Admin page** - separate URL, opened only by the facilitator, shown on the projector. Waiting room, start control, live leaderboard.

**Backend** - Supabase free tier. Holds players, scores, and pairings. Provides realtime updates so the admin page fills live and the start signal reaches all players at once.

---

## Run of show

| Time | What happens |
|---|---|
| 0:00-2:00 | QR on screen. Players join, fill three fields, land in waiting room. Admin page shows the count climbing |
| 2:00-2:30 | Facilitator counts down and presses Start. All clients begin together |
| 2:30-4:00 | The 90-second heat. Leaderboard fills live on the projector |
| 4:00-6:00 | Leaderboard reveal. Top 3 named |
| 6:00-9:00 | Match round. Each player's screen shows their assigned match. Find them, exchange Slack IDs, enter it. Leaderboard re-ranks live |
| 9:00-10:00 | Final reveal. Winner drove well *and* got off their chair |

Latecomers who miss the start are a facilitation matter, not a code one. The facilitator needs a line in their script for it.

---

## Entry gate

Three fields. One typed, two tapped.

1. **Slack ID** - this is the player's name. Appears on the leaderboard, and is how virtual attendees are reachable
2. **Tech Family** - dropdown. Used for the cross-TF pairing rule and shown on the leaderboard, where it is the source of most of the comedy
3. **Bucket answer** - dropdown. Determines who the player is paired with, and gives the pair something to talk about

**Working bucket question (placeholder, may be replaced before the event):**

> How do you commute to work?

- Grab
- Train / Bus / Walk
- Drive
- Get dropped off

Four options, chosen so buckets stay populous at ~60 players. Each answer gives a pair something concrete to open with, and "Grab" as its own bucket is apt at a Grab event.

---

## The game

Portrait endless road, three lanes. Player vehicle sits at the bottom. Tap or swipe to change lanes. One-thumb playable - no keyboard, no tilt.

**Collectibles:** Grab Coins, rendered as a stylised approximation of the Grab coin. Each coin adds to score.

**Obstacles:** Cost points on collision. Do not end the run. Everyone drives the full 90 seconds.

**Trivia gates:** A question appears at the top of the screen while the gate is still distant. The road slows so the player gets 4-5 seconds to read. Three lanes correspond to three answers. Drive through the chosen lane to answer.

Reading time is the reason the road slows. Inline trivia at full speed is a reflex lottery, not a fair test.

**Car tier progression:** This is how trivia is scored, made visual.

Correct answers upgrade the vehicle through Grab Taxi Type tiers - standard, Plus, Premium, Exec. Higher tiers carry a gameplay benefit (faster, wider coin pickup). The tier a player finishes at *is* their trivia score, and they can see themselves climbing the ladder as they play.

Once a player reaches Exec, a correct answer pays +10 run points instead. Without this, the last few gates would be worthless to anyone already at the top tier, and the sharpest players would stop reading the trivia - the opposite of the point.

**A wrong answer means no gain, but no penalty.** No tier downgrade, no points lost. The room is ~80% non-Mobility PMs; punishing them twice for not knowing a Mobility question would sour an ice breaker whose whole job is to make people feel good. The upside stays motivating without the downside stinging.

**Trivia pool:** Mixed, roughly 40% Mobility and 60% Grab-wide playful. The room is mostly not Mobility PMs. Deep AB or HQF questions would make 80% of the audience lose, which defeats the purpose.

Placeholder questions first, structured as a single editable list so real content can be swapped in without touching game code.

**Driving score** = coins collected + trivia tier reached - collisions. Every player drives the same 90 seconds, so scores are directly comparable.

---

## Matching and the bonus

**Pairing is reciprocal and strictly one-to-one.** Each player has exactly one match, and that match has them. Nobody hunts someone who is already taken. Nobody can farm connections.

**Pairing rule:** same bucket, different Tech Family. Cross-TF by construction, which is the entire premise of a PM Connect. The shared bucket answer is why the pair is a sensible match and what they open the conversation with.

**Verification is mutual.** Both players enter each other's Slack ID. When both have done so, both bonuses land. Self-verifying - a connection cannot be claimed unless it happened.

**Bonus size:** 30-40 points, against a typical driving score of around 100.

That sizing is deliberate. Enough to jump 10-15 ranks, not enough to beat a genuinely good run. The resulting order is: a strong driver who mingles wins; a weak driver who mingles beats a strong driver who did not. That is the correct ordering for an ice breaker.

**Room counter:** The projector shows a room-wide "X of Y connected" figure alongside the leaderboard. Individual bonus gives a personal reason to move; the collective number applies ambient pressure to the stragglers. No hard gate - the final reveal is never blocked on a threshold, because a room that stalls at 70% would break the run of show.

**Unmatched players:** Fine. They keep their driving score and stay on the leaderboard, they just do not get the bump. No fallback pairing logic, no three-way groups.

**Virtual attendees:** DM their match in Slack and exchange IDs there. This is a better interaction than a nod across a crowded room.

---

## Reset and sessions

The admin page has a **Start new game** button. Pressing it bumps a session counter in the backend; every phone snaps back to the join screen, and the waiting room and leaderboard read as empty. Old data is kept but invisible - nothing is ever deleted from the app, so the public key stays non-destructive.

This is the day-to-day reset: between rehearsals, after the phone check on event morning, or for a surprise round two. A full wipe (`docs/reset.sql`, run in the Supabase dashboard) exists only for purging all data after the event.

---

## Build order

The riskiest thing in this design is the live external backend in front of a full room. Build order exists to de-risk it first.

1. **Dummy backend, proven live.** A Supabase table and a bare page that writes one row and reads it back, deployed to the real GitHub Pages URL and tested on a phone. If this does not work, we discover it on day one and fall back to a Google Form leaderboard. No game code exists yet at this stage
2. **Admin page and waiting room.** Join, see the count climb, press Start, all clients receive it
3. **The game.** Road, lanes, coins, obstacles, trivia gates, car tiers
4. **Match round.** Pairing assignment, ID entry, mutual verification, bonus, room counter
5. **Polish.** Visual treatment, QR code, facilitator script

---

## Failure handling

**Local scoring never depends on the network.** The game runs entirely client-side. A player with a flaky connection still sees their score and their match.

**Leaderboard writes are best-effort.** A failed write costs that player their leaderboard entry, not their game.

**Fallback if the backend fails on the day:** Players screenshot their score card and post it to the Slack channel. The facilitator eyeballs the ranking. The pairing can be read out from a pre-generated list. Degraded, but the session still works.

---

## Deliberately not built

| Cut | Why |
|---|---|
| Mid-game "guess whose fun fact" challenge | The bucket pairing already creates the interaction, at lower build cost |
| Free-text fun facts | Blank-page paralysis, non-comparable answers, no matching rule. Replaced by the bucket dropdown |
| Multi-round or survival play | Does not fit a 10-minute slot. Survival is a better game but a worse event - players finish at different times |
| Uncapped or multi-person matching | Lets one extrovert run away with it. Strict one-to-one is also self-verifying |
| Proprietary Grab asset files (logos, fonts, images) | Public repo. Real palette plus look-alike shapes read clearly enough |
| Hard participation gate on the final reveal | A stalled room would break the run of show |

---

## Open decisions

1. **Trivia content** - 15 or so real questions, 40/60 Mobility to Grab-wide. Content work, not code. Placeholders until then
2. **Bucket question** - "How do you commute to work?" is the working placeholder and may be swapped before the event
3. **Game name** - "Grab Rush" as a placeholder

## Settled

- **Wrong trivia answer:** no gain, no penalty
- **Reset:** admin "Start new game" button, session-based - old data hidden, never deleted (owner request, 2026-08-13)
- **Brand:** real Grab palette (Duxton tokens where available) plus look-alike shapes; no proprietary asset files in the public repo (owner approved, 2026-08-13)
- **Exec-tier gates:** a correct answer at max tier pays +10 run points so late gates stay worth playing (design review, 2026-08-13)
- **Paid tiers:** not needed. Free Supabase and GitHub Pages comfortably handle ~60 players. Paying buys headroom that is not the constraint; the real risks are venue network, a wrong key, or a phone browser quirk, none of which money fixes. A custom domain (~$10-15/year) is the only spend worth revisiting late, purely so the QR points somewhere tidier than a `github.io` path

---

## Accounts needed

Both free tier. Manual steps for the owner, everything else is handled from the command line.

| Account | What the owner does |
|---|---|
| GitHub | Create account. Enable GitHub Pages in one settings screen |
| Supabase | Create account. Create a table via the UI. Copy two strings (project URL and public key) and hand them over |

**Known trade-off:** The Supabase public key will be visible in the public repo. This is the normal pattern for this kind of app - Supabase provides a key type intended to be public - and the table will be configured so that key can only insert and read scores, nothing destructive. For a 10-minute internal ice breaker holding Slack handles and a commute preference, this is an acceptable exposure. Recorded here so it is a decision, not a discovery.

---

## Design change log

### 2026-08-13 - Quiz v2, from the owner's first playtest

The lane-gate quiz (drive through lane A/B/C to answer) is replaced:

- A gold **VIP pickup** appears on the road on an even schedule. Steering into it is the skill element - miss it and that quiz is skipped.
- On pickup the game **pauses** (the world and the 90 s heat clock both freeze) and a full-screen quiz appears: question, three tappable answer buttons, countdown.
- Answer or run out of time: the correct answer is revealed briefly, then the run resumes with a short collision grace. Correct = tier upgrade (already Exec: +10 points). Wrong or timeout = no gain, no penalty (unchanged rule).
- Config knobs (owner request): `QUIZ_COUNT`, `QUIZ_SECONDS`, plus `QUIZ_FIRST_AT` / `QUIZ_LAST_AT` for the spawn window. The remaining game-feel constants (base speed, spawn rates, boost) also move to `js/config.js` so playtest tuning is a one-line change.
- Accepted trade-off: a heat's wall-clock length now varies per player (90 s of driving plus time spent on quizzes), so players finish at slightly different moments and the admin countdown is approximate. Scores land as each player finishes - unchanged behaviour.
- Visuals stay placeholder; the proper visual pass remains in Task 9 (owner: "work on that later once we have gotten the mechanics sorted").
