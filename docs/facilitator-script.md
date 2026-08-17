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

You press TWO buttons all game: **Start the match**, and once entries
lock, **Reveal the podium**. Everything between them - the 90-second
drive, the bonus round - runs on a shared clock, automatically.

**0:00** - "Phones out, scan the QR - or grab the link pinned in Slack.
Slack ID, Tech Family, one question. You have two minutes."
(Watch the counter climb. Chase stragglers by name - it is on the screen.)

**2:00** - "Locking the doors. 3... 2... 1..." then press **Start the
match**. Add: "Steer into the big gold ? coins - they pause your road for
a question... but not the clock. Get it right and you upgrade your ride -
GrabBike all the way up to Exec - plus a few seconds of coin magnet."
Latecomers: they are swept into whatever stage is running - do not restart.

**2:05-3:35** - The match. Commentate the board as scores land. Call out
Tech Families, not just names. Everyone stops at the same moment - the
clock runs even during quiz questions.

**~3:35** - The big screen flips to the bonus round on its own. Read the
rule aloud: "Find someone from a DIFFERENT Tech Family who travels a
DIFFERENT way to the office. Show them the big @name on your phone, swap
IDs, you BOTH type each other's in. Both of you get +35. Can't find
anyone nearby? Ping someone on Slack. Remote folks: drop your @id in
the session Slack thread - anyone, anywhere can pair with you. 90
seconds - go."
Commentate the connected counter as pairs land.

**~5:05** - Entries lock and the big screen goes quiet: a **Reveal the
podium** button appears. Give it a beat (the last scores land within
seconds), then press it - or tap spacebar. First press: the chasing pack
(places 4-10) - "none of you made the podium... yet". Then one press per
place: 3rd... 2nd... 1st. Milk each one. A final press brings up the
full board and three award lines: read the Scenic Route Award with love, the Fastest fleet
line as a challenge, and the room total as the closer ("X points, Y new
cross-TF connections in 90 seconds"). Crown the winner: "drove well AND
got off their chair." In a rush? Double-press reveals everything at once.

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
