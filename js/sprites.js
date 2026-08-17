// Vehicle sprite sheet: images/vehicles.png holds all seven tiers in one
// row, GrabBike on the left to Exec on the right, gaps between vehicles.
// Sliced once at load into per-tier canvases. Any failure - missing file,
// wrong vehicle count, decode error - leaves ready=false and the game keeps
// its code-drawn vehicles, so the sheet can never break a live session.

export const SPRITE_COUNT = 7;

const ALPHA_ON = 40;      // a pixel this opaque counts as vehicle
const MIN_RUN = 10;       // ignore occupied runs narrower than this (noise)
const MERGE_GAP = 8;      // gaps narrower than this are inside one vehicle

export const sprites = { ready: false, list: [] };

// Pure: boolean column-occupancy array -> [{start, end}] inclusive runs of
// true columns. Gaps under mergeGap are bridged; runs under minRun dropped.
export function findRuns(occupied, mergeGap = MERGE_GAP, minRun = MIN_RUN) {
  const raw = [];
  let start = -1;
  for (let i = 0; i <= occupied.length; i++) {
    const on = i < occupied.length && occupied[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) { raw.push({ start, end: i - 1 }); start = -1; }
  }
  const merged = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (prev && r.start - prev.end - 1 < mergeGap) prev.end = r.end;
    else merged.push({ ...r });
  }
  return merged.filter(r => r.end - r.start + 1 >= minRun);
}

// The sheet may carry real transparency or a baked light background (white
// or checkerboard - image tools fake transparency that way). Border pixels
// tell us which: mostly transparent means nothing to remove.
function borderIsTransparent(data, w, h) {
  let clear = 0, total = 0;
  for (let x = 0; x < w; x += 4) {
    total += 2;
    if (data[(x * 4) + 3] < 16) clear++;
    if (data[((h - 1) * w + x) * 4 + 3] < 16) clear++;
  }
  return clear / total > 0.9;
}

function isBackgroundColor(data, i) {          // white / light checker grey
  const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
  if (a < 16) return true;
  const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
  return lo > 200 && hi - lo < 20;
}

// Flood-fill from every border pixel, clearing background-coloured pixels.
// The fill cannot cross a vehicle outline, so white bodies enclosed by an
// outline survive - only the connected backdrop goes transparent.
function clearBackground(data, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!seen[p] && isBackgroundColor(data, p * 4)) { seen[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
}

// Canvas in, seven tight-cropped sprite canvases out - or null if the sheet
// does not slice into exactly SPRITE_COUNT vehicles.
export function sliceFromCanvas(sheet) {
  const w = sheet.width, h = sheet.height;
  const ctx = sheet.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  if (!borderIsTransparent(img.data, w, h)) {
    clearBackground(img.data, w, h);
    ctx.putImageData(img, 0, 0);
  }
  const occupied = new Array(w).fill(false);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (img.data[(y * w + x) * 4 + 3] >= ALPHA_ON) { occupied[x] = true; break; }
    }
  }
  const runs = findRuns(occupied);
  if (runs.length !== SPRITE_COUNT) return null;
  return runs.map(run => {
    let top = h, bottom = 0;
    for (let x = run.start; x <= run.end; x++) {
      for (let y = 0; y < h; y++) {
        if (img.data[(y * w + x) * 4 + 3] >= ALPHA_ON) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    const sw = run.end - run.start + 1, sh = bottom - top + 1;
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(sheet, run.start, top, sw, sh, 0, 0, sw, sh);
    return { canvas: c, w: sw, h: sh };
  });
}

// Kick off at page load so the sheet is sliced long before the first heat.
// No-op outside a browser (node tests import this module).
export function loadVehicleSprites() {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    try {
      const sheet = document.createElement('canvas');
      sheet.width = img.naturalWidth; sheet.height = img.naturalHeight;
      sheet.getContext('2d').drawImage(img, 0, 0);
      const list = sliceFromCanvas(sheet);
      if (list) { sprites.list = list; sprites.ready = true; }
      else console.warn('vehicles.png did not slice into 7 - using drawn vehicles');
    } catch (e) {
      console.warn('vehicle sheet failed, using drawn vehicles', e);
    }
  };
  img.onerror = () => console.warn('vehicles.png missing - using drawn vehicles');
  img.src = new URL('../images/vehicles.png', import.meta.url);
}
