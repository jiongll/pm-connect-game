// Six questions, one per question coin, in this exact order for every player.
// The coin schedule is driven by the wall clock, so coin 3 is question 3 whether
// or not the player caught coins 1 and 2 - see game.js, which indexes by coin
// number rather than by catches. That is what keeps the room in sync: everyone
// is asked the same thing at roughly the same moment, so the groans land together.
//
// Ordered easy -> hard -> laugh: nobody feels stupid on the first question, the
// surprising numbers sit in the middle, and the run ends on the one people will
// still be quoting at lunch. Correct answers are spread across all three
// positions so nobody can pattern-match their way through under a 10s clock.
//
// `correct` is the index of the right option.
export const QUESTIONS = [
  { q: 'How far ahead can you make an Advance Booking?',
    options: ['30 days', '60 days', '90 days'], correct: 2 },
  { q: 'MTT stands for…',
    // "Multi Taxi Type", unhyphenated - that is how the Confluence flow guide
    // and the backend RFC both write it. Internal usage is inconsistent (the
    // data dictionary hyphenates, one techdocs page says "Multi-Transport-Type"),
    // so the house spelling is the one to put on a screen in front of the room.
    options: ['Metered Taxi Type', 'Multi Taxi Type', 'Marketplace Transport Tier'], correct: 1 },
  { q: 'How many completed rides are cashless?',
    options: ['~30%', '~50%', '~85%'], correct: 1 },
  { q: 'How many completed rides are surged?',
    options: ['~20%', '~30%', '~40%'], correct: 0 },
  { q: 'Which ride-hailing player is NOT yet integrated with Grab?',
    options: ['BlueBird', 'Didi', 'Careem'], correct: 2 },
  { q: '"Redbull" at Grab is a…',
    options: ['Mobility mascot', 'Mobility project codename', "A Mobility PM's nickname"], correct: 1 },
];
