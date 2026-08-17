// ── Backend (from Task 0) ────────────────────────────────────────────
export const SUPABASE_URL = 'https://leqmwchwdwivahnrkrlr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_UNLOsWOIzPPldtToO5fhJA_Y8ZEN9vW';

// ── Event tunables ───────────────────────────────────────────────────
export const GAME_NAME = 'Grab Rush';            // PLACEHOLDER name
export const HEAT_DURATION_MS = 90_000;
export const BONUS_ROUND_MS = 90_000;             // pairing window after the heat ends
export const LIVE_PUSH_MS = 5_000;                // cosmetic mid-heat score push so the big screen climbs
export const MATCH_BONUS = 35;
// The quiz is Mobility product trivia, so everyone outside Mobility starts a
// step behind. Each correct answer is worth ~23 pts once the tier speed-up and
// the magnet knock-on are counted, so 25 is about one answer: enough to
// acknowledge the gap, too small to hand anyone the win on its own.
export const ROOKIE_BONUS = 25;
export const HOME_FAMILY = 'Mobility';           // the family the trivia favours
export const COIN_POINTS = 2;
export const COLLISION_PENALTY = 5;
export const TIER_BONUS = 10;                    // points per tier at game end
export const TIER_SPEED_STEP = 0.06;             // extra speed per tier (game feel)

// Game feel - safe to tune between playtests
export const BASE_SPEED = 340;        // road speed in px/s before tier multiplier
export const COIN_EVERY = 0.65;       // seconds between coin spawns
export const OBSTACLE_EVERY = 1.6;    // seconds between cone spawns
export const BOOST_MULTIPLIER = 1.4;  // speed boost after a correct answer
export const BOOST_SECONDS = 2;       // seconds the boost lasts
// The magnet is a reward for answering, not a permanent upgrade: a tier-based
// magnet switched lane-changing off for the rest of the run, which removed the
// only decision the player makes. Longer than the boost so it is worth having.
export const MAGNET_SECONDS = 5;      // seconds the coin magnet lasts after a correct answer

// Quiz (question coin) tuning
export const QUIZ_COUNT = 6;          // question coins per heat
export const QUIZ_SECONDS = 10;       // countdown to answer once the game pauses
export const QUIZ_FIRST_AT = 8;       // seconds into the heat the first question coin appears
export const QUIZ_LAST_AT = 75;       // seconds mark of the last question coin

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

// Options finalised from playtest feedback.
export const BUCKET_QUESTION = 'How do you commute to work?';
export const BUCKET_OPTIONS = [
  'Grab',
  'Drive a car',
  'Ride a motorbike',
  'Ride a bicycle',
  'Walk',
  'Take the train/bus',
  'Get a lift',
];
