import { HEAT_DURATION_MS, TIER_BONUS, COIN_POINTS, COLLISION_PENALTY,
         BASE_SPEED, COIN_EVERY, OBSTACLE_EVERY,
         BOOST_MULTIPLIER, BOOST_SECONDS, QUIZ_COUNT, QUIZ_SECONDS,
         QUIZ_FIRST_AT, QUIZ_LAST_AT } from './config.js';
import * as S from './scoring.js';
import { unlockAudio, playCoin, playCrash, playLevelUp, playFinish, playSoftTick } from './sound.js';

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

export function startGame(canvas, hud, questions, onFinish) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const roadLeft = () => W * 0.08;
  const roadWidth = () => W * 0.84;
  const laneWidth = () => roadWidth() / 3;
  const laneCenter = i => roadLeft() + laneWidth() * (i + 0.5);
  const carY = () => H - 130;

  // Question-coin schedule: QUIZ_COUNT spawns spread evenly across the heat.
  const quizTimes = [];
  for (let i = 0; i < QUIZ_COUNT; i++) {
    quizTimes.push(QUIZ_COUNT === 1 ? QUIZ_FIRST_AT
      : QUIZ_FIRST_AT + i * (QUIZ_LAST_AT - QUIZ_FIRST_AT) / (QUIZ_COUNT - 1));
  }

  let elapsed = 0, wall = 0, last = null, raf = null, finished = false;
  let carLane = 1, tier = 0, score = 0;
  let coins = [], obstacles = [], quizCoin = null, quiz = null, popups = [];
  let dashOffset = 0, coinTimer = 0.4, obstacleTimer = 1.2;
  let nextQuiz = 0, qIndex = 0;
  let boostUntil = -1, invulnUntil = -1, feedback = null;
  let streak = 0, lastCoinAt = -9;             // R12: chained pickups raise the blip's pitch
  let particles = [];                          // R13/R18: coin sparkles + upgrade confetti
  let shakeUntil = -1;                         // R14: screen shake on crash
  let whiteUntil = -1, ringStart = -1;         // R18: upgrade flash + expanding ring
  let speedLines = null;                       // R19: streaks while boosted
  let labelDone = false;                       // R21: only the first '?' carries a label

  function moveLeft() { carLane = Math.max(0, carLane - 1); }
  function moveRight() { carLane = Math.min(2, carLane + 1); }
  function onPointer(e) {
    unlockAudio();                             // solo runs and restored sessions never press Join
    if (quiz) return;                          // frozen while answering
    const x = (e.touches ? e.touches[0].clientX : e.clientX)
      - canvas.getBoundingClientRect().left;
    if (x < W / 2) moveLeft(); else moveRight();
    e.preventDefault();
  }
  function onKey(e) {
    if (quiz) return;
    if (e.key === 'ArrowLeft') moveLeft();
    if (e.key === 'ArrowRight') moveRight();
  }
  canvas.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);

  function speed() {
    let s = BASE_SPEED * S.tierSpeedMultiplier(tier);
    if (elapsed < boostUntil) s *= BOOST_MULTIPLIER;   // correct-answer boost
    return s;
  }

  function popScore(text, x, y, good) {          // floating +N / -N at the action
    popups.push({ text, x, y, born: elapsed, good });
  }

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

  function openQuiz(q) {
    hud.question.textContent = q.q;
    hud.options.textContent = '';
    const btns = q.options.map((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'q-opt';
      b.textContent = opt;
      b.style.animationDelay = (i * 40) + 'ms';   // R22: answers stagger in, reading order
      b.addEventListener('click', () => settle(i));
      hud.options.appendChild(b);
      return b;
    });
    let timerEl = hud.banner.querySelector('.q-timer');
    if (!timerEl) {
      timerEl = document.createElement('p');
      timerEl.className = 'q-timer';
      hud.banner.appendChild(timerEl);
    }
    let secondsLeft = QUIZ_SECONDS;
    timerEl.textContent = secondsLeft + 's to answer';
    quiz = {
      q, btns, timerEl, settled: false,
      interval: setInterval(() => {
        secondsLeft -= 1;
        timerEl.textContent = Math.max(0, secondsLeft) + 's to answer';
      }, 1000),
      timeout: setTimeout(() => settle(-1), QUIZ_SECONDS * 1000),
    };
    hud.banner.classList.add('visible');
    if (hud.qbar) {                            // R23: the gold bar drains over QUIZ_SECONDS
      hud.qbar.style.transition = 'none';
      hud.qbar.style.width = '100%';
      void hud.qbar.offsetWidth;
      hud.qbar.style.transition = 'width ' + QUIZ_SECONDS + 's linear';
      hud.qbar.style.width = '0%';
    }
  }

  function settle(picked) {                    // picked -1 = time ran out
    if (!quiz || quiz.settled) return;
    quiz.settled = true;
    clearInterval(quiz.interval); clearTimeout(quiz.timeout);
    quiz.timerEl.textContent = '';
    for (const b of quiz.btns) b.disabled = true;
    const correct = picked === quiz.q.correct;
    quiz.btns[quiz.q.correct].classList.add('right');
    if (!correct && picked >= 0) quiz.btns[picked].classList.add('wrong');
    setTimeout(() => resume(correct, picked), 900);  // beat to read the reveal
  }

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
                  ? 'Magnet on! Coins beside you count too'   // R20
                  : 'Upgraded to ' + S.TIERS[tier] + '!',
          until: elapsed + 1.5, good: true }
      : { text: picked < 0 ? 'Time ran out - no change' : 'Nope',
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

  function update(dt) {
    elapsed += dt;
    const dy = speed() * dt;
    dashOffset = (dashOffset + dy) % 48;

    coinTimer -= dt;
    if (coinTimer <= 0) {
      coins.push({ lane: Math.floor(Math.random() * 3), y: -30 });
      coinTimer = HEAT_DURATION_MS / 1000 - wall <= 10
        ? COIN_EVERY / 2 : COIN_EVERY;         // R25: a coin shower to finish on
    }
    obstacleTimer -= dt;
    if (obstacleTimer <= 0) {
      obstacles.push({ lane: Math.floor(Math.random() * 3), y: -40 });
      obstacleTimer = OBSTACLE_EVERY;
    }
    if (!quizCoin && nextQuiz < quizTimes.length && wall >= quizTimes[nextQuiz]) {
      quizCoin = { lane: Math.floor(Math.random() * 3), y: -40, labelled: !labelDone };
      labelDone = true;                        // R21: the label runs exactly once
      nextQuiz++;
    }

    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (quizCoin) quizCoin.y += dy;
    if (speedLines) {
      for (const l of speedLines) {            // R19: streaks fall at 2x road speed
        l.y += dy * 2;
        if (l.y > H) { l.y = -l.len; l.x = roadLeft() + Math.random() * roadWidth(); }
      }
    }

    coins = coins.filter(c => {
      const near = Math.abs(c.y - carY()) < 46;
      const laneOk = c.lane === carLane
        || (S.tierHasMagnet(tier) && Math.abs(c.lane - carLane) === 1);
      if (near && laneOk) {
        score = S.collectCoin(score);
        streak = elapsed - lastCoinAt < 1.2 ? Math.min(streak + 1, 12) : 0;
        lastCoinAt = elapsed;
        playCoin(Math.pow(1.0595, streak));    // R12: one semitone per streak step
        spawnBurst(laneCenter(c.lane), c.y, 5, GOLD, 0.3);   // R13
        popScore('+' + COIN_POINTS, laneCenter(c.lane), c.y, true);
        return false;
      }
      return c.y < H + 60;
    });

    obstacles = obstacles.filter(o => {
      if (Math.abs(o.y - carY()) < 50 && o.lane === carLane
          && elapsed > invulnUntil) {
        score = S.hitObstacle(score);
        playCrash();
        streak = 0;                            // a crash kills the coin streak
        shakeUntil = elapsed + 0.25;           // R14
        flashCrash();                          // R15
        invulnUntil = elapsed + 1.2;
        popScore('-' + COLLISION_PENALTY, laneCenter(o.lane), o.y, false);
        return false;
      }
      return o.y < H + 60;
    });

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

    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter(p => elapsed - p.born < p.life);
    popups = popups.filter(p => elapsed - p.born < POPUP_LIFE);
    if (String(score) !== hud.score.textContent) {
      hud.score.textContent = score;
      bump(hud.score);                         // R27: pulse on delta, never per frame
    }
    hud.tier.textContent = S.TIERS[tier];
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

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

  function drawCone(x, y) {                    // traffic cone
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 18, 19, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(x, y - 22); ctx.lineTo(x - 16, y + 14);
    ctx.lineTo(x + 16, y + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 8, y - 8, 16, 5);
    ctx.fillRect(x - 12, y + 2, 24, 5);
    ctx.fillStyle = '#e8650f';
    ctx.fillRect(x - 19, y + 14, 38, 5);
  }

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

  function drawBike(cx, cy) {                  // GrabBike: shared sprite
    drawBikeSprite(ctx, cx, cy);
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

  function draw() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const shake = Math.max(0, shakeUntil - elapsed);     // R14: decaying jolt, max ±7 px
    if (shake > 0) {
      ctx.save();
      const amp = (shake / 0.25) * 7;
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }

    const verge = ctx.createLinearGradient(0, 0, 0, H);   // grass verges
    verge.addColorStop(0, '#0f2e1d');
    verge.addColorStop(1, '#0a1f14');
    ctx.fillStyle = verge;
    ctx.fillRect(-12, -12, W + 24, H + 24);    // oversized so the shake never bares an edge

    const road = ctx.createLinearGradient(0, 0, 0, H);    // asphalt
    road.addColorStop(0, '#23232b');
    road.addColorStop(1, '#2c2c35');
    ctx.fillStyle = road;
    ctx.fillRect(roadLeft(), 0, roadWidth(), H);

    const kerbH = 24;                                     // scrolling kerb strips
    for (let y = -kerbH * 2 + (dashOffset % (kerbH * 2)); y < H + kerbH; y += kerbH * 2) {
      ctx.fillStyle = '#e8edea';
      ctx.fillRect(roadLeft() - 6, y, 6, kerbH);
      ctx.fillRect(roadLeft() + roadWidth(), y, 6, kerbH);
      ctx.fillStyle = '#00804a';
      ctx.fillRect(roadLeft() - 6, y + kerbH, 6, kerbH);
      ctx.fillRect(roadLeft() + roadWidth(), y + kerbH, 6, kerbH);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 22]);
    ctx.lineDashOffset = -dashOffset;
    for (let i = 1; i < 3; i++) {
      const x = roadLeft() + laneWidth() * i;
      ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, H + 30); ctx.stroke();
    }
    ctx.setLineDash([]);

    if (elapsed < boostUntil && speedLines) {  // R19: the boost is a secret no more
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = 3;
      for (const l of speedLines) {
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + l.len); ctx.stroke();
      }
    }

    for (const c of coins) drawCoin(laneCenter(c.lane), c.y);
    for (const o of obstacles) drawCone(laneCenter(o.lane), o.y);
    if (quizCoin) {
      drawQuizCoin(laneCenter(quizCoin.lane), quizCoin.y);
      if (quizCoin.labelled) {                 // R21: kills the "is that a hazard?" pause
        ctx.font = 'bold 13px system-ui';
        ctx.fillStyle = '#ffd76a';
        ctx.fillText('Drive into it - trivia time', laneCenter(quizCoin.lane), quizCoin.y - 52);
      }
    }
    drawVehicle(laneCenter(carLane), carY());

    for (const p of particles) {               // R13/R18: sparkles and confetti
      const t = (elapsed - p.born) / p.life;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }

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

  raf = requestAnimationFrame(frame);
  return { stop: () => end(true) };            // external stops skip the ceremony
}
