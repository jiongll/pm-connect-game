-- FULL WIPE - run in the Supabase dashboard → SQL Editor after the event
-- (or to purge rehearsal data for good). Day-to-day resets do NOT need
-- this: the admin page's "Start new game" button starts a clean session
-- without deleting anything, and the public key stays non-destructive.
truncate table players;
update game_state set status = 'waiting', started_at = null, session = 1 where id = 1;
