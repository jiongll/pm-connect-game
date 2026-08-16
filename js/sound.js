// All game audio, synthesised with the Web Audio API - no files, no network.
// The AudioContext is created lazily and unlocked by the first user gesture
// (browsers block autoplay); every play function is a safe no-op before then.

const MASTER_GAIN = 0.13;   // quiet by design - a room full of phones, not a disco

let ctx = null;
let master = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                       // ancient browser: the game runs silent
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const ready = () => ctx && ctx.state === 'running';

// One enveloped oscillator note.
function tone(freq, dur, { type = 'sine', at = 0, peak = 1, slideTo = null } = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain); gain.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// A short burst of white noise (the crash).
function noise(dur, { at = 0, peak = 1 } = {}) {
  const t0 = ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, t0);
  src.connect(gain); gain.connect(master);
  src.start(t0);
}

export function playTick() {                 // countdown: short dry blip
  if (!ready()) return;
  tone(880, 0.08, { type: 'square', peak: 0.5 });
}

export function playGo() {                   // GO: bright rising fifth
  if (!ready()) return;
  tone(660, 0.12, { type: 'square', peak: 0.7 });
  tone(990, 0.25, { type: 'square', at: 0.1, peak: 0.7 });
}

export function playCoin(pitch = 1) {        // coin: two-note chirp; pitch scales on streaks
  if (!ready()) return;
  tone(1046 * pitch, 0.06, { type: 'triangle', peak: 0.8 });
  tone(1568 * pitch, 0.09, { type: 'triangle', at: 0.05, peak: 0.8 });
}

export function playCrash() {                // cone hit: noise thud + falling growl
  if (!ready()) return;
  noise(0.18, { peak: 0.5 });
  tone(180, 0.22, { type: 'sawtooth', peak: 0.6, slideTo: 70 });
}

export function playLevelUp() {              // tier upgrade: quick major arpeggio
  if (!ready()) return;
  tone(523, 0.09, { type: 'triangle', peak: 0.8 });
  tone(659, 0.09, { type: 'triangle', at: 0.08, peak: 0.8 });
  tone(784, 0.16, { type: 'triangle', at: 0.16, peak: 0.8 });
}

export function playFinish() {               // buzzer: rising three-note fanfare
  if (!ready()) return;
  tone(392, 0.15, { type: 'square', peak: 0.6 });
  tone(523, 0.15, { type: 'square', at: 0.14, peak: 0.6 });
  tone(784, 0.35, { type: 'square', at: 0.28, peak: 0.6 });
}

export function playSoftTick() {              // final-10 heartbeat - well under the coin blip
  if (!ready()) return;
  tone(740, 0.05, { type: 'sine', peak: 0.25 });
}

export function playBonusSting() {            // bonus-round slam: two rising notes
  if (!ready()) return;
  tone(523, 0.14, { type: 'square', peak: 0.6 });
  tone(880, 0.3, { type: 'square', at: 0.13, peak: 0.6 });
}

export function playChime() {                 // connection made: soft two-note rise
  if (!ready()) return;
  tone(784, 0.12, { type: 'triangle', peak: 0.7 });
  tone(1175, 0.28, { type: 'triangle', at: 0.1, peak: 0.7 });
}
