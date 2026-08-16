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
