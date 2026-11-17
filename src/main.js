// The scene is laid out on a 200×200 grid; the 160×160 canvas shows the VIEW part of it (closer camera).
// Everything is drawn in whole pixels, CSS scales it up crisp.
// Seen from the front-left and above, like the reference picture. Light from the top left.
const W = 200;
const VIEW = { x: 22, y: 24 }; // top-left of the visible 160×160 part
const VIEW_RIGHT = VIEW.x + 160;
const g = document.getElementById("scene").getContext("2d");
g.imageSmoothingEnabled = false;

const DESK_Y = 100; // where wall meets desk
const SLEEVE = 64; // displayed sleeve size, also the cover sample size
const DEFAULT_WALL = { h: 196, s: 39, l: 47 };

// Stand of past albums at the right edge: each shows about a quarter of its cover.
const STAND_SIZE = 3;
const STAND_STEP = 16;
const standSlot = (i) => ({ x: VIEW_RIGHT - STAND_STEP * (i + 1), y: SLEEVE_Y - i, dark: i * 0.15, alpha: 1 }); // 0 = newest, in front

// Perspective grid: the player is drawn on a flat deck plane (u to the right, v toward the viewer,
// in deck units, height h up from the deck) mapped to the screen through its four corners.
// The front is wider than the back, so everything shrinks toward the back consistently.
const DECK = { U: 150, V: 117, T: 10 }; // width, depth, thickness
// Low camera: deck squashed in depth, front corners just past the window edges (view is x 22..182).
const CORNERS = [[47, 115], [167, 115], [188, 162], [16, 162]]; // back-left, back-right, front-right, front-left
const HEIGHT = 1.2; // low camera: heights look taller compared to the squashed deck
const PLAT = { u: 62, v: 58, r: 52, t: 5 }; // platter center, radius, height
const REC_R = 47, LABEL_R = 15; // record and label radius
const START = { u: 8, v: 103, w: 14, d: 8 }; // start/stop button at the front-left, clear of the platter
const SLIDER = { u: 141, back: 62, front: 108 }; // volume slider slot: back end = loud
const ARM = { u: 130, v: 28, len: 63, h: 11, play: Math.atan2(52, -35), rest: Math.atan2(62, 8) }; // pivot, length, angles

// Record keyframes. Flat: plane position (u, v, h). Upright (up = 1): screen center (sx, sy), scale ss.
// In between, every point of the record blends from its flat to its upright place.
const UPRIGHT_R = 29; // record radius on screen when standing upright, fits the sleeve
const SLEEVE_X = VIEW_RIGHT - STAND_STEP * STAND_SIZE - 2 - SLEEVE, SLEEVE_Y = DESK_Y - SLEEVE;
const ON_PLATTER = { u: PLAT.u, v: PLAT.v, h: PLAT.t + 1, up: 0, sx: SLEEVE_X + SLEEVE / 2, sy: SLEEVE_Y - UPRIGHT_R, ss: UPRIGHT_R / REC_R };
const LIFTED = { ...ON_PLATTER, h: 28 };
const ABOVE_SLEEVE = { ...LIFTED, up: 1 }; // partly out of frame, that's fine
const IN_SLEEVE = { ...ABOVE_SLEEVE, sy: SLEEVE_Y + SLEEVE / 2 };

const tone = (w, k = 1) => `hsl(${w.h},${w.s}%,${w.l * k}%)`;
const px = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const add = ([x, y], [dx, dy]) => [x + dx, y + dy];
const mix = (a, b, k) => Object.fromEntries(Object.keys(a).map((n) => [n, lerp(a[n], b[n], k)]));

// Convex polygon, filled row by row so edges stay hard pixels.
function poly(pts, c) {
  g.fillStyle = c;
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y < Math.max(...ys); y++) {
    const yc = y + 0.5, xs = [];
    pts.forEach(([x0, y0], i) => {
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((yc >= y0) !== (yc >= y1)) xs.push(x0 + (yc - y0) * (x1 - x0) / (y1 - y0));
    });
    if (xs.length > 1) {
      const l = Math.round(Math.min(...xs)), r = Math.round(Math.max(...xs));
      g.fillRect(l, y, r - l, 1);
    }
  }
}

// Map the unit square onto the four deck corners (projective transform).
function homography([x0, y0], [x1, y1], [x2, y2], [x3, y3]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const gg = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + gg * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + gg * y1, e = y3 - y0 + hh * y3;
  return (u, v) => {
    const w = gg * u + hh * v + 1;
    return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w];
  };
}
const H = homography(...CORNERS);

// Deck plane point (u, v) at height h, on screen. Height uses the local scale, so it shrinks toward the back too.
function P(u, v, h = 0) {
  const [x, y] = H(u / DECK.U, v / DECK.V);
  const [x1, y1] = H((u + 1) / DECK.U, v / DECK.V);
  return [x, y - h * HEIGHT * Math.hypot(x1 - x, y1 - y)];
}

// Circle lying on the plane. Angle 90° is the side nearest the viewer.
const circle = (u, v, r, h, n = 48) =>
  Array.from({ length: n }, (_, i) => P(u + r * Math.cos(i * 2 * Math.PI / n), v + r * Math.sin(i * 2 * Math.PI / n), h));
const disc = (u, v, r, h, c) => poly(circle(u, v, r, h), c);
function arcDots(u, v, r, h, from, to, step, c) {
  for (let d = from; d <= to; d += step) px(...P(u + r * Math.cos(d * Math.PI / 180), v + r * Math.sin(d * Math.PI / 180), h), c);
}
const seg = (a, b, c) => line(a[0], a[1], b[0], b[1], c);

// Raised box on the deck: back-left corner (u, v), size w × d, height h.
function box(u, v, w, d, h, top) {
  poly([P(u - 1, v - 1), P(u + w + 1, v - 1), P(u + w + 1, v + d + 1), P(u - 1, v + d + 1)], "#6c717c"); // recess
  poly([P(u, v + d), P(u + w, v + d), P(u + w, v + d, h), P(u, v + d, h)], "#5c616b"); // front side
  poly([P(u, v, h), P(u + w, v, h), P(u + w, v + d, h), P(u, v + d, h)], top);
  seg(P(u, v, h), P(u + w, v, h), "#ffffff"); // lit back edge
}

function line(x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
}

function clipTo(x, y, w, h) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
}

// Average cover color, made darker and stronger so light covers don't wash the wall out.
function wallFrom([r, gr, b]) {
  r /= 255; gr /= 255; b /= 255;
  const max = Math.max(r, gr, b), min = Math.min(r, gr, b), d = max - min;
  const l = (max + min) / 2;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((gr - b) / d) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4;
  if (s > 0.08) s = Math.max(s, 0.4); // near-gray covers stay gray instead of getting a random hue
  return { h: Math.round(h * 60 + 360) % 360, s: Math.round(s * 100), l: Math.round(Math.min(Math.max(l, 0.3), 0.5) * 100) };
}

// Blend two wall colors, turning the hue the short way round.
function mixWall(a, b, k) {
  const dh = ((b.h - a.h + 540) % 360) - 180;
  return { h: Math.round(a.h + dh * k + 360) % 360, s: Math.round(lerp(a.s, b.s, k)), l: Math.round(lerp(a.l, b.l, k)) };
}

// Shrink the cover to sleeve size and cut it to 8 levels per channel.
async function loadCover(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const c = new OffscreenCanvas(SLEEVE, SLEEVE);
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(img, 0, 0, SLEEVE, SLEEVE);
  const d = x.getImageData(0, 0, SLEEVE, SLEEVE);
  const sum = [0, 0, 0];
  for (let i = 0; i < d.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      sum[k] += d.data[i + k];
      d.data[i + k] = Math.min(255, Math.round(d.data[i + k] / 32) * 32);
    }
  }
  x.putImageData(d, 0, 0);
  const n = d.data.length / 4;
  return { canvas: c, data: d.data, wall: wallFrom(sum.map((s) => s / n)) };
}

// Record point at local offset (x, y) from its center: blend of lying flat and standing upright.
function recAt(R, x, y) {
  const [fx, fy] = P(R.u + x, R.v + y, R.h);
  return [lerp(fx, R.sx + x * R.ss * (R.fx ?? 1), R.up), lerp(fy, R.sy + y * R.ss, R.up)]; // fx: coin-flip squash
}
const recCircle = (R, r, n = 56) => Array.from({ length: n }, (_, i) => recAt(R, r * Math.cos(i * 2 * Math.PI / n), r * Math.sin(i * 2 * Math.PI / n)));
function recDots(R, r, from, to, step, c) {
  for (let d = from; d <= to; d += step) px(...recAt(R, r * Math.cos(d * Math.PI / 180), r * Math.sin(d * Math.PI / 180)), c);
}

// Record R (see keyframes), label spun clockwise by `turn` radians.
function record(cover, R, turn, shine) {
  poly(recCircle(R, REC_R).map(([x, y]) => [x, y + 1]), "#07080e"); // edge thickness
  poly(recCircle(R, REC_R), "#191c2c");
  recDots(R, REC_R, 190, 280, 1, "#7a82a4"); // lit back rim
  for (const r of [42, 36, 30, 24]) recDots(R, r, 0, 359, 1, "#232741"); // grooves
  const wob = Math.round(shine * 3); // shine streaks shift a few degrees while spinning
  for (const r of [37, 40, 43]) {
    recDots(R, r, 205 + wob, 245 - wob, 2, shine > 0.5 ? "#9aa0c0" : "#8a90b0");
    recDots(R, r, 25 - wob, 65 + wob, 2, "#4a5070");
  }
  poly(recCircle(R, LABEL_R + 2), "#11131f"); // run-out ring
  // Label: every cover texel is placed onto the record (dense enough to leave no holes).
  const n = SLEEVE, ct = Math.cos(turn), st = Math.sin(turn);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const lx = (i / (n - 1) * 2 - 1) * LABEL_R, ly = (j / (n - 1) * 2 - 1) * LABEL_R;
      if (lx * lx + ly * ly > LABEL_R * LABEL_R) continue;
      const k = (j * n + i) * 4;
      const c = cover ? `rgb(${cover.data[k]},${cover.data[k + 1]},${cover.data[k + 2]})` : "#d7dbe0";
      px(...recAt(R, lx * ct - ly * st, lx * st + ly * ct), c);
    }
  }
  spindle(...recAt(R, 0, 0));
}

function spindle(x, y) {
  rect(x - 1, y - 2, 2, 2, "#9aa0aa");
  px(x - 1, y - 2, "#f4f5f7");
}

// A standing sleeve at (x, y); dark: 0..1 shade for sleeves further back; alpha to fade one out.
function sleeve(cover, x, y, dark = 0, alpha = 1) {
  if (!cover) return;
  g.globalAlpha = alpha;
  g.drawImage(cover.canvas, Math.round(x), Math.round(y));
  rect(x, y, SLEEVE, 1, "rgba(255,255,255,.35)"); // lit top edge
  rect(x, y, 1, SLEEVE, "rgba(255,255,255,.2)");
  rect(x + SLEEVE - 2, y, 2, SLEEVE, "rgba(0,0,0,.18)"); // shaded right side
  if (dark) rect(x, y, SLEEVE, SLEEVE, `rgba(0,0,0,${dark})`);
  g.globalAlpha = 1;
}

// Sleeve standing out on the wall, with its shadow.
function displayed(cover, x, wall) {
  if (!cover) return;
  rect(x + 3, SLEEVE_Y + 3, SLEEVE, SLEEVE - 3, tone(wall, 0.65));
  sleeve(cover, x, SLEEVE_Y);
}

// Stand rail along the desk edge, in front of the sleeve bottoms.
function standRail() {
  const x = standSlot(STAND_SIZE - 1).x - 2;
  rect(x, DESK_Y - 4, W - x, 5, "#4a4f5a");
  rect(x, DESK_Y - 4, W - x, 1, "#9aa0aa");
  rect(x, DESK_Y - 4, 1, 5, "#6c717c");
  rect(x, DESK_Y + 1, W - x, 2, "rgba(0,0,0,.3)"); // shadow on the desk
}

// Upright cylinder on the deck from height h0 to h1.
function cyl(u, v, r, h0, h1, side, top) {
  for (let h = h0; h < h1; h++) disc(u, v, r, h, side);
  disc(u, v, r, h1, top);
}

// Thick bar between two screen points: dark underside, mid body, lit top (w pixels tall).
function bar(a, b, w, dark, mid, lit) {
  for (let k = 0; k < w; k++) {
    const c = k === 0 ? lit : k === w - 1 ? dark : mid;
    seg([a[0], a[1] + k], [b[0], b[1] + k], c);
  }
}

// swing: 0 on the record .. 1 at rest. lift: extra height of the arm.
function tonearm(swing, lift) {
  const a = lerp(ARM.play, ARM.rest, swing), du = Math.cos(a), dv = Math.sin(a);
  const eu = ARM.u + du * ARM.len, ev = ARM.v + dv * ARM.len, h = ARM.h + lift;
  const restU = ARM.u + Math.cos(ARM.rest) * (ARM.len - 14), restV = ARM.v + Math.sin(ARM.rest) * (ARM.len - 14);

  // Shadows on the deck/record (stay down when lifted).
  seg(P(ARM.u + 4, ARM.v + 4), P(eu + 4, ev + 4, 1), "rgba(0,0,0,.35)");
  disc(ARM.u + 4, ARM.v + 4, 12, 0, "rgba(0,0,0,.3)");
  // Arm rest post.
  cyl(restU, restV, 2, 0, 8, "#5c616b", "#9aa0aa");
  // Base plate, bearing housing, gimbal post.
  cyl(ARM.u, ARM.v, 11, 0, 2, "#3a3e48", "#8a8f99");
  arcDots(ARM.u, ARM.v, 11, 2, 190, 300, 4, "#d6dae0");
  cyl(ARM.u, ARM.v, 6, 2, h - 2, "#5c616b", "#d6dae0");
  arcDots(ARM.u, ARM.v, 6, h - 2, 190, 300, 6, "#ffffff");
  cyl(ARM.u, ARM.v, 3, h - 2, h, "#3a3e48", "#9aa0aa");

  // Counterweight: a short fat cylinder on the back end of the arm.
  const c0 = P(ARM.u - du * 5, ARM.v - dv * 5, h + 1), c1 = P(ARM.u - du * 14, ARM.v - dv * 14, h + 1);
  bar(add(c0, [0, -2]), add(c1, [0, -2]), 5, "#2c3038", "#4a4f5a", "#8a8f99");
  // Arm tube, 3 pixels thick.
  bar(add(P(ARM.u, ARM.v, h), [0, -1]), add(P(eu, ev, h), [0, -1]), 3, "#6c717c", "#c9cdd4", "#ffffff");
  // Headshell with finger lift, cartridge underneath.
  const su = -dv * 3, sv = du * 3; // sideways
  const shell = [P(eu + su, ev + sv, h), P(eu - su, ev - sv, h), P(eu - su + du * 8, ev - sv + dv * 8, h), P(eu + su + du * 8, ev + sv + dv * 8, h)];
  poly(shell.map(([x, y]) => [x, y + 1]), "#6c717c");
  poly(shell, "#dfe2e7");
  seg(shell[0], shell[1], "#ffffff");
  seg(P(eu - su + du * 6, ev - sv + dv * 6, h), P(eu - su * 2 + du * 7, ev - sv * 2 + dv * 7, h + 1), "#cfd2d8"); // finger lift
  poly([P(eu + du * 2 - su / 2, ev + dv * 2 - sv / 2, h - 1), P(eu + du * 2 + su / 2, ev + dv * 2 + sv / 2, h - 1), P(eu + du * 6 + su / 2, ev + dv * 6 + sv / 2, h - 4), P(eu + du * 6 - su / 2, ev + dv * 6 - sv / 2, h - 4)], "#3fae6a"); // cartridge
}

// Slider cap: crisp raised block with a grip line across the middle, no recess around it.
function sliderKnob(u, v, w, d, h) {
  poly([P(u + 1, v + 1), P(u + w + 1, v + 1), P(u + w + 1, v + d + 1), P(u + 1, v + d + 1)], "rgba(0,0,0,.3)"); // shadow
  poly([P(u, v + d), P(u + w, v + d), P(u + w, v + d, h), P(u, v + d, h)], "#8a8f99"); // front side
  poly([P(u, v, h), P(u + w, v, h), P(u + w, v + d, h), P(u, v + d, h)], "#eef0f3"); // top
  seg(P(u, v, h), P(u + w, v, h), "#ffffff"); // lit back edge
  seg(P(u + 1, v + d / 2, h), P(u + w - 1, v + d / 2, h), "#6c717c"); // grip line
}

function deck(drift) {
  const { U, V, T } = DECK;
  const top = [P(0, 0), P(U, 0), P(U, V), P(0, V)];
  poly(top.map(([x, y]) => [x + 5, y + T * 2]), "rgba(0,0,0,.3)"); // shadow on the desk
  poly([P(0, V), P(U, V), P(U, V, -T), P(0, V, -T)], "#7d838e"); // front
  seg(P(0, V, -T), P(U, V, -T), "#4a4f5a");
  poly(top, "#b8bcc4");
  seg(P(0, 0), P(U, 0), "#e8eaee"); // lit back edge
  seg(P(0, 0), P(0, V), "#dfe2e7"); // lit left edge
  seg(P(0, V), P(U, V), "#d2d5db");

  // Platter: dark side shows at the front with strobe dots, silver top rim, dark mat.
  const { u, v, r, t } = PLAT;
  disc(u + 4, v + 4, r, 0, "rgba(0,0,0,.25)"); // shadow on the deck
  disc(u, v, r, 0, "#2c3038");
  for (let k = 1; k < t; k++) arcDots(u, v, r, k, 10 + drift, 170, 4, k % 2 ? "#8a8f99" : "#c9cdd4");
  disc(u, v, r, t, "#a3a9b3");
  arcDots(u, v, r, t, 190, 300, 2, "#e2e5ea"); // lit back edge
  disc(u, v, r - 3, t, "#2a2e36");
  spindle(...P(u, v, t + 2));

  // Big round start knob at the back-left (short cylinder).
  disc(16, 16, 7, 0, "rgba(0,0,0,.3)"); // shadow
  disc(14, 14, 7, 0, "#2c3038");
  disc(14, 14, 7, 4, "#4a4f5a");
  disc(14, 14, 5, 4, "#5c616b");
  arcDots(14, 14, 7, 4, 190, 300, 6, "#9aa0aa");
  // Small square start/stop at the front-left.
  box(START.u, START.v, START.w, START.d, pressed ? 1 : 3, "#dfe2e7");
  // Volume slider on the right, with markings; the knob shows Spotify's volume.
  const { u: su, back, front } = SLIDER;
  for (let k = 0; k < 8; k++) seg(P(su - 8, back + 2 + k * 6), P(su - 5, back + 2 + k * 6), "#6c717c");
  poly([P(su - 2, back), P(su + 2, back), P(su + 2, front), P(su - 2, front)], "#3a3e48");
  sliderKnob(su - 5, lerp(front - 5, back, volume / 100), 10, 5, 4);
}

// Widget mode: just the record standing upright on a see-through background.
const WIDGET_R = 76; // record radius in canvas pixels
const FLIP = 0.8; // seconds, coin flip on album change
function drawWidget(p) {
  g.clearRect(0, 0, 160, 160);
  let cover = shown, fx = 1;
  if (p.flip) {
    cover = p.flip.k < 0.5 ? p.flip.from : p.flip.to; // new label shows once it turns past edge-on
    fx = Math.max(Math.abs(Math.cos(Math.PI * ease(p.flip.k))), 0.04);
  }
  record(cover, { u: 0, v: 0, h: 0, up: 1, sx: 80, sy: 79, ss: WIDGET_R / REC_R, fx }, p.turn, p.shine);
}

// p: everything that moves. See pose().
function draw(p) {
  if (widget) return drawWidget(p);
  g.save();
  g.translate(-VIEW.x, -VIEW.y);
  rect(0, 0, W, W, tone(p.wall));
  rect(0, DESK_Y, W, W - DESK_Y, tone(p.wall, 0.5)); // desk
  rect(0, DESK_Y, W, 1, tone(p.wall, 0.7)); // desk edge catching light

  // Stand: oldest at the back first; the moving sleeve goes in front of all of it.
  for (const s of [...p.stand].reverse()) sleeve(s.cover, s.x, s.y, s.dark, s.alpha);
  displayed(p.display, p.displayX, p.wall);
  standRail();

  deck(p.drift);

  // Record: while going in or out of the sleeve, only the part above the sleeve shows.
  if (p.rec) {
    if (p.rec.clip) clipTo(0, 0, W, SLEEVE_Y);
    record(p.rec.cover, p.rec, p.turn, p.shine);
    if (p.rec.clip) g.restore();
  }

  tonearm(p.swing, p.lift);
  g.restore();
}

const RPM = 100 / 3; // 33⅓
const EASE = 1; // seconds to stop on pause / reach full speed on play
// Swap phases in seconds, ~2.8s total.
const SWAP = [
  0.2, //  0 arm swings out
  0.2, //  1 record lifts off the platter
  0.35, // 2 record turns upright and moves above the sleeve
  0.25, // 3 record sinks into the sleeve
  0.4, //  4 sleeve slides right into the stand, older ones move back
  0.4, //  5 new sleeve slides out of the stand to the display (wall color fades)
  0.25, // 6 new record rises out of the sleeve
  0.35, // 7 turns flat and moves over the platter
  0.2, //  8 lowers onto the platter
  0.2, //  9 arm swings back
];
const SWAP_TOTAL = SWAP.reduce((a, b) => a + b);
// Record path per phase: [from, to] keyframes; null = inside the sleeve.
const PATH = [
  [ON_PLATTER, ON_PLATTER], [ON_PLATTER, LIFTED], [LIFTED, ABOVE_SLEEVE], [ABOVE_SLEEVE, IN_SLEEVE],
  null, null,
  [IN_SLEEVE, ABOVE_SLEEVE], [ABOVE_SLEEVE, LIFTED], [LIFTED, ON_PLATTER], [ON_PLATTER, ON_PLATTER],
];
const HOP = 0.4; // seconds, arm hop for a new track on the same album

let shown; // cover on the turntable (undefined until the first track arrives)
let stand = []; // past covers, newest first
let next = null; // newest cover from Spotify
let nextUrl;
let trackId;
let playing = false;
let speed = 0; // 0 stopped .. 1 full speed
let turn = 0;
let last = 0;
let running = false;
let swap = null; // { start, from, to, stand } while swapping records
let hop = null; // start time of an arm hop
let widget = false; // widget mode: small see-through window with only the record
let volume = 100; // Spotify's volume, 0..100
let dragging = false; // dragging the volume slider
let pressed = false; // start/stop button held down
let armUp = 1; // 0 arm down on the record .. 1 lifted (paused); eases toward the play state
const ARM_HOVER = 4; // how high the arm hovers while paused
const ARM_EASE = 0.3; // seconds to lift / lower

const wallOf = (c) => (c ? c.wall : DEFAULT_WALL);
const standItems = (list) => list.map((cover, i) => ({ cover, ...standSlot(i) }));
const filed = (from, list) => (from ? [from, ...list] : list).slice(0, STAND_SIZE);

// Where everything is at time `now`.
function pose(now) {
  const p = {
    turn, drift: (turn * 180 / Math.PI * 0.05) % 4, shine: speed * (0.5 + 0.5 * Math.sin(now / 80)),
    swing: 0, lift: 0,
    rec: { ...ON_PLATTER, cover: shown, clip: false },
    display: shown, displayX: SLEEVE_X, stand: standItems(stand),
    wall: wallOf(shown),
  };
  if (hop !== null) p.lift = Math.sin(Math.PI * Math.min((now - hop) / 1000 / HOP, 1)) * 3;
  p.lift = Math.max(p.lift, ease(armUp) * ARM_HOVER); // hovers above the record while paused
  if (!swap) return p;

  let t = (now - swap.start) / 1000, i = 0;
  while (i < SWAP.length - 1 && t > SWAP[i]) t -= SWAP[i++];
  const k = ease(Math.min(t / SWAP[i], 1));
  const { from, to } = swap;
  p.flip = { k: Math.min((now - swap.start) / 1000 / FLIP, 1), from, to };

  p.swing = i === 0 ? k : i === 9 ? 1 - k : 1;
  p.lift = Math.max(p.swing * 3, ease(armUp) * ARM_HOVER);
  p.rec = PATH[i] && { ...mix(PATH[i][0], PATH[i][1], k), cover: i < 4 ? from : to, clip: i === 3 || i === 6 };
  p.display = i < 5 ? from : to;
  p.wall = i < 5 ? wallOf(from) : i > 5 ? wallOf(to) : mixWall(wallOf(from), wallOf(to), k);
  if (i < 4) p.stand = standItems(swap.stand);
  if (i === 4) {
    // Old sleeve slides into the front slot while the others move one slot back; the oldest fades out.
    p.displayX = lerp(SLEEVE_X, standSlot(0).x, k);
    p.stand = swap.stand.map((cover, j) => ({ cover, ...(j + 1 < STAND_SIZE ? mix(standSlot(j), standSlot(j + 1), k) : { ...standSlot(j), alpha: 1 - k }) }));
  }
  if (i >= 5) p.stand = standItems(filed(from, swap.stand));
  if (i === 5) p.displayX = lerp(VIEW_RIGHT, SLEEVE_X, k); // new sleeve comes out from the stand side
  return p;
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (swap && now - swap.start > (widget ? FLIP : SWAP_TOTAL) * 1000) {
    stand = filed(swap.from, swap.stand);
    shown = swap.to;
    swap = null;
    if (next !== shown) startSwap(now); // album changed again mid-swap
  }
  if (hop !== null && now - hop > HOP * 1000) hop = null;
  const target = playing && !swap ? 1 : 0; // record stops while being swapped
  speed += Math.max(-dt / EASE, Math.min(dt / EASE, target - speed));
  turn += speed * dt * 2 * Math.PI * RPM / 60;
  const armTarget = playing ? 0 : 1;
  armUp += Math.max(-dt / ARM_EASE, Math.min(dt / ARM_EASE, armTarget - armUp));
  draw(pose(now));
  // Stop the loop once nothing moves, so a paused app uses no CPU.
  if (playing || speed > 0 || swap || hop !== null || armUp !== armTarget) requestAnimationFrame(tick);
  else running = false;
}

function startSwap(now) {
  swap = { start: now, from: shown, to: next, stand };
}

function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}

async function show(t) {
  playing = !!t?.playing;
  if (t && !dragging) volume = t.volume;
  const url = t?.artwork_url || null;
  const newTrack = (t?.id ?? null) !== trackId;
  trackId = t?.id ?? null;
  if (url !== nextUrl) {
    nextUrl = url;
    const c = url ? await loadCover(url).catch(() => null) : null;
    if (nextUrl !== url) return; // a newer track arrived while loading
    next = c;
    if (shown === undefined) shown = next; // first track: just show it
    else if (!swap) startSwap(performance.now());
  } else if (newTrack && !swap) {
    hop = performance.now();
  }
  draw(pose(performance.now()));
  wake();
}

// Switch between the normal window and the widget. Each mode remembers where its window was.
const win = window.__TAURI__.window.getCurrentWindow();
const { LogicalSize, PhysicalPosition } = window.__TAURI__.dpi;
const savedPos = (m) => { try { return JSON.parse(localStorage.getItem("pos-" + m)); } catch { return null; } };
async function setMode(w) {
  if (w === widget) return;
  try { localStorage.setItem("pos-" + (widget ? "widget" : "window"), JSON.stringify(await win.outerPosition())); } catch {}
  widget = w;
  document.body.classList.toggle("widget", w);
  await win.setDecorations(!w);
  await win.setShadow(!w);
  await win.setResizable(!w);
  await win.setAlwaysOnBottom(w); // widget sits on the desktop, behind normal windows
  await win.setSize(new LogicalSize(w ? 200 : 480, w ? 200 : 480));
  const pos = savedPos(w ? "widget" : "window");
  if (pos) await win.setPosition(new PhysicalPosition(pos.x, pos.y));
  draw(pose(performance.now()));
}
window.__TAURI__.event.listen("mode", (e) => setMode(e.payload === "widget"));
const scene = document.getElementById("scene");
scene.addEventListener("dblclick", () => setMode(!widget));
scene.addEventListener("mousedown", (e) => { if (widget && e.detail === 1) win.startDragging(); }); // no title bar to drag by

// Volume: drag the slider or scroll on the scene (window mode only).
// Sends at most one change at a time to Spotify, always ending with the latest value.
let volWant = null, volBusy = false;
async function setVolume(v) {
  volume = Math.min(100, Math.max(0, v));
  volWant = Math.round(volume);
  if (!running) draw(pose(performance.now()));
  if (volBusy) return;
  volBusy = true;
  while (volWant !== null) {
    const send = volWant;
    volWant = null;
    await window.__TAURI__.core.invoke("set_volume", { volume: send }).catch(() => {});
  }
  volBusy = false;
}
// Mouse position in scene pixels.
function scenePoint(e) {
  const r = scene.getBoundingClientRect(), k = Math.min(r.width, r.height) / 160;
  return [(e.clientX - r.left - (r.width - 160 * k) / 2) / k + VIEW.x, (e.clientY - r.top - (r.height - 160 * k) / 2) / k + VIEW.y];
}
// Slider ends on screen; the volume follows the mouse between them.
function sliderVolume([x, y], strict) {
  const [bx, by] = P(SLIDER.u, SLIDER.back), [fx, fy] = P(SLIDER.u, SLIDER.front);
  const t = (y - by) / (fy - by);
  if (strict && (t < -0.15 || t > 1.15 || Math.abs(x - lerp(bx, fx, t)) > 7)) return null;
  return (1 - t) * 100;
}
// Start/stop button: press it to play/pause Spotify. The arm follows when Spotify reports the new state.
function onStart([x, y]) {
  const { u, v, w, d } = START;
  const pts = [P(u, v, 3), P(u + w, v, 3), P(u + w, v + d), P(u, v + d)];
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return x >= Math.min(...xs) - 1 && x <= Math.max(...xs) + 1 && y >= Math.min(...ys) - 1 && y <= Math.max(...ys) + 1;
}
scene.addEventListener("mousedown", (e) => {
  if (widget || !onStart(scenePoint(e))) return;
  pressed = true;
  if (!running) draw(pose(performance.now()));
  window.__TAURI__.core.invoke("play_pause").catch(() => {});
});
window.addEventListener("mouseup", () => {
  if (!pressed) return;
  pressed = false;
  if (!running) draw(pose(performance.now()));
});

scene.addEventListener("mousedown", (e) => {
  if (widget) return;
  const v = sliderVolume(scenePoint(e), true);
  if (v === null) return;
  dragging = true;
  setVolume(v);
});
window.addEventListener("mousemove", (e) => { if (dragging) setVolume(sliderVolume(scenePoint(e))); });
window.addEventListener("mouseup", () => { dragging = false; });
scene.addEventListener("wheel", (e) => {
  if (widget) return;
  e.preventDefault();
  setVolume(volume - e.deltaY * 0.25);
}, { passive: false });

draw(pose(0));
window.__TAURI__.event.listen("track", (e) => show(e.payload));
window.__TAURI__.core.invoke("current_track").then(show);
