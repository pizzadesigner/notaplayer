// Vinyl interface: turntable with a perspective deck, sleeve on the wall, stand of the last 3 albums.
import {
  W, VIEW_RIGHT, DESK_Y, SLEEVE, g, tone, px, rect, lerp, ease, add, mix, poly, seg, clipTo, perspective, texel, spindle,
} from "./pixel.js";

const DECK = { U: 150, V: 117, T: 10 }; // width, depth, thickness
// Low camera: deck squashed in depth, front corners just past the window edges (view is x 22..182).
const CORNERS = [[47, 115], [167, 115], [188, 162], [16, 162]]; // back-left, back-right, front-right, front-left
const { P, disc, arcDots, cyl, box, hitRect } = perspective(DECK.U, DECK.V, CORNERS, 1.2);
const PLAT = { u: 62, v: 58, r: 52, t: 5 }; // platter center, radius, height
const REC_R = 47, LABEL_R = 15; // record and label radius
const START = { u: 8, v: 103, w: 14, d: 8 }; // start/stop button at the front-left, clear of the platter
const SLIDER = { u: 141, back: 62, front: 108 }; // volume slider slot: back end = loud
const ARM = { u: 130, v: 28, len: 63, h: 11, play: Math.atan2(52, -35), rest: Math.atan2(62, 8) }; // pivot, length, angles
const ARM_HOVER = 4; // how high the arm hovers while paused
const HOP = 0.4; // seconds, arm hop for a new song on the same album

// Stand of past albums at the right edge: each shows about a quarter of its cover.
const STAND_SIZE = 3, STAND_STEP = 16;
const SLEEVE_X = VIEW_RIGHT - STAND_STEP * STAND_SIZE - 2 - SLEEVE, SLEEVE_Y = DESK_Y - SLEEVE;
const standSlot = (i) => ({ x: VIEW_RIGHT - STAND_STEP * (i + 1), y: SLEEVE_Y - i, dark: i * 0.15, alpha: 1 }); // 0 = newest, in front

// Record keyframes. Flat: plane position (u, v, h). Upright (up = 1): screen center (sx, sy), scale ss.
// In between, every point of the record blends from its flat to its upright place.
const UPRIGHT_R = 29; // record radius on screen when standing upright, fits the sleeve
const ON_PLATTER = { u: PLAT.u, v: PLAT.v, h: PLAT.t + 1, up: 0, sx: SLEEVE_X + SLEEVE / 2, sy: SLEEVE_Y - UPRIGHT_R, ss: UPRIGHT_R / REC_R };
const LIFTED = { ...ON_PLATTER, h: 28 };
const ABOVE_SLEEVE = { ...LIFTED, up: 1 }; // partly out of frame, that's fine
const IN_SLEEVE = { ...ABOVE_SLEEVE, sy: SLEEVE_Y + SLEEVE / 2 };

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
      px(...recAt(R, lx * ct - ly * st, lx * st + ly * ct), texel(cover, i / (n - 1), j / (n - 1)));
    }
  }
  spindle(...recAt(R, 0, 0));
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
function displayed(cover, x, wall, lift = 0) {
  if (!cover) return;
  rect(x + 3, SLEEVE_Y + 3, SLEEVE, SLEEVE - 3, tone(wall, 0.65));
  sleeve(cover, x, SLEEVE_Y - lift);
}

// Stand rail along the desk edge, in front of the sleeve bottoms.
function standRail() {
  const x = standSlot(STAND_SIZE - 1).x - 2;
  rect(x, DESK_Y - 4, W - x, 5, "#4a4f5a");
  rect(x, DESK_Y - 4, W - x, 1, "#9aa0aa");
  rect(x, DESK_Y - 4, 1, 5, "#6c717c");
  rect(x, DESK_Y + 1, W - x, 2, "rgba(0,0,0,.3)"); // shadow on the desk
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

function deck(drift, S) {
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
  box(START.u, START.v, START.w, START.d, S.pressed === "start" ? 1 : 3, "#dfe2e7");
  // Volume slider on the right, with markings; the knob shows Spotify's volume.
  const { u: su, back, front } = SLIDER;
  for (let k = 0; k < 8; k++) seg(P(su - 8, back + 2 + k * 6), P(su - 5, back + 2 + k * 6), "#6c717c");
  poly([P(su - 2, back), P(su + 2, back), P(su + 2, front), P(su - 2, front)], "#3a3e48");
  sliderKnob(su - 5, lerp(front - 5, back, S.volume / 100), 10, 5, 4);
}

// Slider ends on screen; the volume follows the mouse between them.
function sliderVolume([x, y], strict) {
  const [bx, by] = P(SLIDER.u, SLIDER.back), [fx, fy] = P(SLIDER.u, SLIDER.front);
  const t = (y - by) / (fy - by);
  if (strict && (t < -0.15 || t > 1.15 || Math.abs(x - lerp(bx, fx, t)) > 7)) return null;
  return (1 - t) * 100;
}
// Pointer angle around the record, measured on its tilted oval; inside = on the record.
function recordAngle([x, y]) {
  const h = PLAT.t + 1, c = P(PLAT.u, PLAT.v, h);
  const ex = P(PLAT.u + REC_R, PLAT.v, h), ey = P(PLAT.u, PLAT.v + REC_R, h);
  const nx = (x - c[0]) / Math.hypot(ex[0] - c[0], ex[1] - c[1]);
  const ny = (y - c[1]) / Math.hypot(ey[0] - c[0], ey[1] - c[1]);
  return { angle: Math.atan2(ny, nx), inside: nx * nx + ny * ny <= 1 };
}
// Displayed album = next song, stand = previous song.
function sleeves([x, y]) {
  if (y < SLEEVE_Y - 4 || y > DESK_Y) return null;
  if (x >= standSlot(STAND_SIZE - 1).x - 2) return "stand";
  if (x >= SLEEVE_X && x < SLEEVE_X + SLEEVE) return "album";
  return null;
}

// Album change, phases in seconds (~2.8s).
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
// Record path per phase: [from, to] keyframes; null = inside the sleeve.
const PATH = [
  [ON_PLATTER, ON_PLATTER], [ON_PLATTER, LIFTED], [LIFTED, ABOVE_SLEEVE], [ABOVE_SLEEVE, IN_SLEEVE],
  null, null,
  [IN_SLEEVE, ABOVE_SLEEVE], [ABOVE_SLEEVE, LIFTED], [LIFTED, ON_PLATTER], [ON_PLATTER, ON_PLATTER],
];

const standItems = (list) => list.map((cover, i) => ({ cover, ...standSlot(i) }));

export default {
  id: "vinyl",
  rpm: 100 / 3, // 33⅓
  swap: SWAP,
  history: "albums", // the stand keeps past albums
  historySize: STAND_SIZE,
  seekPerTurn: 30, // seconds per full turn of the record by hand

  // Fills in where the vinyl parts are. sw: the running album change ({ i, k, from, to, history }) or null.
  pose(p, S, sw) {
    p.drift = (S.turn * 180 / Math.PI * 0.05) % 4;
    p.swing = 0;
    p.lift = S.songChange !== null && !sw ? Math.sin(Math.PI * Math.min((p.now - S.songChange) / 1000 / HOP, 1)) * 3 : 0;
    p.lift = Math.max(p.lift, ease(S.paused) * ARM_HOVER); // hovers above the record while paused
    p.rec = { ...ON_PLATTER, cover: S.shown, clip: false };
    p.displayX = SLEEVE_X;
    p.stand = standItems(S.albums);
    if (!sw) return;
    const { i, k, from, to } = sw;
    p.swing = i === 0 ? k : i === 9 ? 1 - k : 1;
    p.lift = Math.max(p.swing * 3, ease(S.paused) * ARM_HOVER);
    p.rec = PATH[i] && { ...mix(PATH[i][0], PATH[i][1], k), cover: i < 4 ? from : to, clip: i === 3 || i === 6 };
    p.display = i < 5 ? from : to;
    p.wallMix = i < 5 ? 0 : i > 5 ? 1 : k; // 0 = old album's wall color .. 1 = new
    if (i < 4) p.stand = standItems(sw.history);
    if (i === 4) {
      // Old sleeve slides into the front slot while the others move one slot back; the oldest fades out.
      p.displayX = lerp(SLEEVE_X, standSlot(0).x, k);
      p.stand = sw.history.map((cover, j) => ({ cover, ...(j + 1 < STAND_SIZE ? mix(standSlot(j), standSlot(j + 1), k) : { ...standSlot(j), alpha: 1 - k }) }));
    }
    if (i >= 5) p.stand = standItems(sw.filed);
    if (i === 5) p.displayX = lerp(VIEW_RIGHT, SLEEVE_X, k); // new sleeve comes out from the stand side
  },

  draw(p, S) {
    // Stand: oldest at the back first; the moving sleeve goes in front of all of it.
    const lift = (what) => (S.hover === what && !p.sw ? 2 : 0);
    for (const s of [...p.stand].reverse()) sleeve(s.cover, s.x, s.y - lift("stand"), s.dark, s.alpha);
    displayed(p.display, p.displayX, p.wall, lift("album"));
    standRail();
    deck(p.drift, S);
    // Record: while going in or out of the sleeve, only the part above the sleeve shows.
    if (p.rec) {
      if (p.rec.clip) clipTo(0, 0, W, SLEEVE_Y);
      record(p.rec.cover, p.rec, p.turn, p.shine);
      if (p.rec.clip) g.restore();
    }
    tonearm(p.swing, p.lift);
  },

  // Disc widget: just the record standing upright, flipping like a coin on an album change.
  widget(p, cover, fx) {
    record(cover, { u: 0, v: 0, h: 0, up: 1, sx: 80, sy: 79, ss: 76 / REC_R, fx }, p.turn, p.shine);
  },

  // What's under the pointer (window and scene widget).
  hit(pt, S) {
    if (hitRect(START.u, START.v, START.w, START.d, 3, pt)) return { kind: "press", id: "start", act: "play" };
    if (sliderVolume(pt, true) !== null) return { kind: "slider", value: (q) => sliderVolume(q) };
    const s = sleeves(pt);
    if (s) return { kind: "skip", forward: s === "album", hover: s };
    if (!S.swapping && recordAngle(pt).inside) return { kind: "grab", angle: (q) => recordAngle(q).angle };
    return null;
  },
};
