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
Add: "Steer into the gold VIP circles - they pause your run for a trivia
question. Correct answers upgrade your car."
Latecomers: they can still join and play solo after the heat; their score
lands on the board late. Do not restart the heat.

**2:30-4:00** - Commentate the board as scores land. Call out Tech
Families, not just names. Quiz pauses stop each player's clock, so players
finish at slightly different moments - keep commentating until the last
scores land.

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
