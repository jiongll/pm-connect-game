// ── Backend (from Task 0) ────────────────────────────────────────────
export const SUPABASE_URL = 'https://leqmwchwdwivahnrkrlr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_UNLOsWOIzPPldtToO5fhJA_Y8ZEN9vW';

// ── Event tunables ───────────────────────────────────────────────────
export const GAME_NAME = 'Grab Rush';            // PLACEHOLDER name
export const HEAT_DURATION_MS = 90_000;
export const MATCH_BONUS = 35;
export const COIN_POINTS = 2;
export const COLLISION_PENALTY = 5;
export const TIER_BONUS = 10;                    // points per tier at game end
export const TIER_SPEED_STEP = 0.06;             // extra speed per tier (game feel)
export const MAGNET_TIER = 2;                    // tier index that unlocks the coin magnet (2 = Premium)

// Game feel - safe to tune between playtests
export const BASE_SPEED = 340;        // road speed in px/s before tier multiplier
export const COIN_EVERY = 0.65;       // seconds between coin spawns
export const OBSTACLE_EVERY = 1.6;    // seconds between cone spawns
export const BOOST_MULTIPLIER = 1.4;  // speed boost after a correct answer
export const BOOST_SECONDS = 2;       // seconds the boost lasts

// Quiz (VIP pickup) tuning
export const QUIZ_COUNT = 6;          // VIP pickups per heat
export const QUIZ_SECONDS = 10;       // countdown to answer once the game pauses
export const QUIZ_FIRST_AT = 8;       // seconds into the heat the first VIP appears
export const QUIZ_LAST_AT = 75;       // seconds mark of the last VIP

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
