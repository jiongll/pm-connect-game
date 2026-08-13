import { HEAT_DURATION_MS, TIER_BONUS } from './config.js';
import * as S from './scoring.js';

const TIER_COLORS = ['#00b45e', '#0e8f8f', '#3d3f66', '#15151a'];
const GATE_TIMES = [12, 26, 40, 54, 68, 82];

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

  let elapsed = 0, last = null, raf = null, finished = false;
  let carLane = 1, tier = 0, score = 0;
  let coins = [], obstacles = [], gate = null;
  let dashOffset = 0, coinTimer = 0.4, obstacleTimer = 1.2;
  let nextGate = 0, qIndex = 0;
  let boostUntil = -1, invulnUntil = -1, feedback = null;

  function moveLeft() { carLane = Math.max(0, carLane - 1); }
  function moveRight() { carLane = Math.min(2, carLane + 1); }
  function onPointer(e) {
    const x = (e.touches ? e.touches[0].clientX : e.clientX)
      - canvas.getBoundingClientRect().left;
    if (x < W / 2) moveLeft(); else moveRight();
    e.preventDefault();
  }
  function onKey(e) {
    if (e.key === 'ArrowLeft') moveLeft();
    if (e.key === 'ArrowRight') moveRight();
  }
  canvas.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);

  function speed() {
    let s = 340 * S.tierSpeedMultiplier(tier);
    if (gate) s *= 0.45;                      // reading time
    if (elapsed < boostUntil) s *= 1.4;       // correct-answer boost
    return s;
  }

  function update(dt) {
    elapsed += dt;
    const dy = speed() * dt;
    dashOffset = (dashOffset + dy) % 48;

    coinTimer -= dt;
    if (coinTimer <= 0) {
      coins.push({ lane: Math.floor(Math.random() * 3), y: -30 });
      coinTimer = 0.65;
    }
    obstacleTimer -= dt;
    if (obstacleTimer <= 0 && !gate) {        // fair: no cones while reading
      obstacles.push({ lane: Math.floor(Math.random() * 3), y: -40 });
      obstacleTimer = 1.6;
    }
    if (nextGate < GATE_TIMES.length && elapsed >= GATE_TIMES[nextGate]) {
      gate = { y: -60, q: questions[qIndex % questions.length] };
      qIndex++; nextGate++;
      hud.question.textContent = gate.q.q;
      hud.options.textContent = gate.q.options
        .map((o, i) => 'ABC'[i] + ': ' + o).join('   ');
      hud.banner.classList.add('visible');
    }

    for (const c of coins) c.y += dy;
    for (const o of obstacles) o.y += dy;
    if (gate) gate.y += dy;

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

    if (gate && gate.y >= carY()) {
      const correct = carLane === gate.q.correct;
      const atMax = tier === S.TIERS.length - 1;   // already Exec
      tier = S.answerQuestion(tier, correct);
      if (correct && atMax) score += TIER_BONUS;   // Exec: late gates stay worth playing
      feedback = correct
        ? { text: atMax ? 'Exec bonus +' + TIER_BONUS + '!'
                        : 'Upgraded to ' + S.TIERS[tier] + '!',
            until: elapsed + 1.5, good: true }
        : { text: 'Not quite - no change', until: elapsed + 1.5, good: false };
      if (correct) boostUntil = elapsed + 2;
      gate = null;
      hud.banner.classList.remove('visible');
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

  function draw() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0d3321';                 // verges
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#26262e';                 // road
    ctx.fillRect(roadLeft(), 0, roadWidth(), H);

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 22]);
    ctx.lineDashOffset = -dashOffset;
    for (let i = 1; i < 3; i++) {
      const x = roadLeft() + laneWidth() * i;
      ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, H + 30); ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const c of coins) {                   // stylised Grab Coin
      const x = laneCenter(c.lane);
      ctx.fillStyle = '#00c853';
      ctx.beginPath(); ctx.arc(x, c.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a5ffce'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui';
      ctx.fillText('G', x, c.y + 1);
    }

    for (const o of obstacles) {               // traffic cones
      const x = laneCenter(o.lane);
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(x, o.y - 22); ctx.lineTo(x - 18, o.y + 18);
      ctx.lineTo(x + 18, o.y + 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 12, o.y + 2, 24, 6);
    }

    if (gate) {                                // answer gates A / B / C
      for (let i = 0; i < 3; i++) {
        const x = laneCenter(i), w = laneWidth() - 14;
        ctx.fillStyle = 'rgba(0, 177, 79, 0.25)';
        ctx.fillRect(x - w / 2, gate.y - 34, w, 68);
        ctx.strokeStyle = '#00b14f'; ctx.lineWidth = 3;
        ctx.strokeRect(x - w / 2, gate.y - 34, w, 68);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 30px system-ui';
        ctx.fillText('ABC'[i], x, gate.y);
      }
    }

    const cx = laneCenter(carLane), cy = carY();   // the car, tier-coloured
    const flash = elapsed < invulnUntil && Math.floor(elapsed * 10) % 2 === 0;
    ctx.globalAlpha = flash ? 0.4 : 1;
    ctx.fillStyle = TIER_COLORS[tier];
    roundRect(cx - 26, cy - 44, 52, 88, 12); ctx.fill();
    if (tier === 3) {                          // Exec gets the gold trim
      ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 3;
      roundRect(cx - 26, cy - 44, 52, 88, 12); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(160, 220, 255, 0.85)';   // windscreen
    roundRect(cx - 18, cy - 30, 36, 22, 6); ctx.fill();
    ctx.globalAlpha = 1;

    if (feedback && elapsed < feedback.until) {
      ctx.fillStyle = feedback.good ? '#7dffb0' : '#ffb0a8';
      ctx.font = 'bold 22px system-ui';
      ctx.fillText(feedback.text, W / 2, H * 0.32);
    }
  }

  function end() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    onFinish(S.finalScore(score, tier), tier);
  }

  function frame(ts) {
    if (last === null) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);  // clamp background-tab jumps
    last = ts;
    update(dt);
    draw();
    if (elapsed * 1000 >= HEAT_DURATION_MS) { end(); return; }
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return { stop: end };
}
