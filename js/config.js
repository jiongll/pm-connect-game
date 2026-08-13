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
