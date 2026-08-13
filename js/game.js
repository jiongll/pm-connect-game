import { HEAT_DURATION_MS, TIER_BONUS, BASE_SPEED, COIN_EVERY, OBSTACLE_EVERY,
         BOOST_MULTIPLIER, BOOST_SECONDS, QUIZ_COUNT, QUIZ_SECONDS,
         QUIZ_FIRST_AT, QUIZ_LAST_AT } from './config.js';
import * as S from './scoring.js';

const TIER_COLORS = ['#00b14f', '#17b5a6', '#3d3f66', '#15151a'];

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

  // VIP pickup schedule: QUIZ_COUNT spawns spread evenly across the heat.
  const quizTimes = [];
  for (let i = 0; i < QUIZ_COUNT; i++) {
    quizTimes.push(QUIZ_COUNT === 1 ? QUIZ_FIRST_AT
      : QUIZ_FIRST_AT + i * (QUIZ_LAST_AT - QUIZ_FIRST_AT) / (QUIZ_COUNT - 1));
  }

  let elapsed = 0, last = null, raf = null, finished = false;
  let carLane = 1, tier = 0, score = 0;
  let coins = [], obstacles = [], vip = null, quiz = null;
  let dashOffset = 0, coinTimer = 0.4, obstacleTimer = 1.2;
  let nextQuiz = 0, qIndex = 0;
  let boostUntil = -1, invulnUntil = -1, feedback = null;

  function moveLeft() { carLane = Math.max(0, carLane - 1); }
  function moveRight() { carLane = Math.min(2, carLane + 1); }
  function onPointer(e) {
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

  function openQuiz(q) {
    hud.question.textContent = q.q;
    hud.options.textContent = '';
    const btns = q.options.map((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'q-opt';
      b.textContent = opt;
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
    tier = S.answerQuestion(tier, correct);
    if (correct && atMax) score += TIER_BONUS;   // Exec: quizzes stay worth taking
    if (correct) boostUntil = elapsed + BOOST_SECONDS;
    feedback = correct
      ? { text: atMax ? 'Exec bonus +' + TIER_BONUS + '!'
                      : 'Upgraded to ' + S.TIERS[tier] + '!',
          until: elapsed + 1.5, good: true }
      : { text: picked < 0 ? 'Time ran out - no change' : 'Not quite - no change',
          until: elapsed + 1.5, good: false };
    invulnUntil = elapsed + 0.8;                 // grace while the road restarts
    quiz = null;
  }

  function update(dt) {
    elapsed += dt;
    const dy = speed() * dt;
    dashOffset = (dashOffset + dy) % 48;

    coinTimer -= dt;
    if (coinTimer <= 0) {
      coins.push({ lane: Math.floor(Math.random() * 3), y: -30 });
      coinTimer = COIN_EVERY;
    }
    obstacleTimer -= dt;
    if (obstacleTimer <= 0) {
      obstacles.push({ lane: Math.floor(Math.random() * 3), y: -40 });
      obstacleTimer = OBSTACLE_EVERY;
    }
    if (!vip && nextQuiz < quizTimes.length && elapsed >= quizTimes[nextQuiz]) {
      vip = { lane: Math.floor(Math.random() * 3), y: -40 };
      nextQuiz++;
    }

    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (vip) vip.y += dy;

    coins = coins.filter(c => {
      const near = Math.abs(c.y - carY()) < 46;
      const laneOk = c.lane === carLane
        || (S.tierHasMagnet(tier) && Math.abs(c.lane - carLane) === 1);
      if (near && laneOk) { score = S.collectCoin(score); return false; }
      return c.y < H + 60;
    });

    obstacles = obstacles.filter(o => {
      if (Math.abs(o.y - carY()) < 50 && o.lane === carLane
          && elapsed > invulnUntil) {
        score = S.hitObstacle(score);
        invulnUntil = elapsed + 1.2;
        feedback = { text: 'Ouch!', until: elapsed + 0.8, good: false };
        return false;
      }
      return o.y < H + 60;
    });

    if (vip) {
      if (Math.abs(vip.y - carY()) < 50 && vip.lane === carLane) {
        const q = questions[qIndex % questions.length];
        qIndex++;
        vip = null;
        openQuiz(q);
      } else if (vip.y > H + 60) {
        vip = null;                              // missed - that quiz is gone
      }
    }

    hud.score.textContent = score;
    hud.tier.textContent = S.TIERS[tier];
    hud.time.textContent = Math.max(0, Math.ceil(HEAT_DURATION_MS / 1000 - elapsed));
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

  function drawCoin(x, y) {                    // stylised Grab Coin
    ctx.save();
    ctx.shadowColor = 'rgba(0, 177, 79, 0.7)'; ctx.shadowBlur = 9;
    ctx.fillStyle = '#00b14f';
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#d9fcde'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui';
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

  function drawVip(x, y) {                     // the VIP pickup - hit it for a quiz
    const pulse = 1 + 0.08 * Math.sin(elapsed * 6);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 27 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowColor = 'rgba(255, 215, 106, 0.9)'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#3a2c00';
    ctx.font = 'bold 10px system-ui';
    ctx.fillText('★', x, y - 6);
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('VIP', x, y + 6);
  }

  function drawCar(cx, cy) {                   // the car, tier-coloured
    const flash = elapsed < invulnUntil && Math.floor(elapsed * 10) % 2 === 0;
    ctx.globalAlpha = flash ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 42, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111116';
    roundRect(cx - 31, cy - 32, 9, 22, 4); ctx.fill();
    roundRect(cx + 22, cy - 32, 9, 22, 4); ctx.fill();
    roundRect(cx - 31, cy + 10, 9, 22, 4); ctx.fill();
    roundRect(cx + 22, cy + 10, 9, 22, 4); ctx.fill();
    ctx.fillStyle = TIER_COLORS[tier];
    roundRect(cx - 26, cy - 44, 52, 88, 14); ctx.fill();
    if (tier === 3) {                          // Exec gets the gold trim
      ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 3;
      roundRect(cx - 26, cy - 44, 52, 88, 14); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    roundRect(cx - 20, cy - 40, 18, 80, 9); ctx.fill();
    ctx.fillStyle = 'rgba(165, 220, 255, 0.9)';
    roundRect(cx - 18, cy - 32, 36, 20, 6); ctx.fill();
    ctx.fillStyle = 'rgba(165, 220, 255, 0.55)';
    roundRect(cx - 16, cy + 20, 32, 14, 5); ctx.fill();
    ctx.fillStyle = '#fff9d9';
    roundRect(cx - 20, cy - 42, 10, 5, 2); ctx.fill();
    roundRect(cx + 10, cy - 42, 10, 5, 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    const verge = ctx.createLinearGradient(0, 0, 0, H);   // grass verges
    verge.addColorStop(0, '#0f2e1d');
    verge.addColorStop(1, '#0a1f14');
    ctx.fillStyle = verge;
    ctx.fillRect(0, 0, W, H);

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

    for (const c of coins) drawCoin(laneCenter(c.lane), c.y);
    for (const o of obstacles) drawCone(laneCenter(o.lane), o.y);
    if (vip) drawVip(laneCenter(vip.lane), vip.y);
    drawCar(laneCenter(carLane), carY());

    if (feedback && elapsed < feedback.until) {
      ctx.font = 'bold 22px system-ui';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(4, 14, 9, 0.85)';
      ctx.strokeText(feedback.text, W / 2, H * 0.32);
      ctx.fillStyle = feedback.good ? '#7dffb0' : '#ffb0a8';
      ctx.fillText(feedback.text, W / 2, H * 0.32);
    }
  }

  function end() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    if (quiz) { clearInterval(quiz.interval); clearTimeout(quiz.timeout); }
    canvas.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    onFinish(S.finalScore(score, tier), tier);
  }

  function frame(ts) {
    if (last === null) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);  // clamp background-tab jumps
    last = ts;
    if (!quiz) {                               // world and heat clock freeze mid-quiz
      update(dt);
      draw();
    }
    if (elapsed * 1000 >= HEAT_DURATION_MS) { end(); return; }
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return { stop: end };
}
