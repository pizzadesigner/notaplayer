// CD interface: portable CD player with a clear window in the lid, blue LCD with track and time,
// the album's jewel case on the desk and a round acrylic wheel holding the last 16 songs.
import {
  VIEW, VIEW_RIGHT, DESK_Y, SLEEVE, g, tone, px, rect, lerp, ease, mix, poly, seg, clipTo, perspective, cover as drawCover, spindle,
} from "./pixel.js";

const BODY = { U: 110, V: 110, T: 10 }; // width, depth, thickness
// Seen a little more from above than the turntable, so the top and its buttons read better.
const CORNERS = [[58, 96], [144, 96], [168, 160], [34, 160]]; // back-left, back-right, front-right, front-left
const { P, disc, arcDots, cyl } = perspective(BODY.U, BODY.V, CORNERS, 1.0);
const T = BODY.T;
// Round body (the lid is the whole round top) with a silver control panel bulging out at the front.
const ROUND = { u: 55, v: 50, r: 50 }; // round body, center and radius
const POD = { u: 55, v: 95, ru: 40, rv: 15 }; // front panel: an oval that sticks out past the round body
const LID = { u: 55, v: 45, r: 42 }; // round lid, a bit smaller than the body so the faceplate wraps around its front
const CD = { u: 55, v: 45, r: 38, hub: 7 }; // disc center and radius in the player, clear hub radius
const WINDOW_R = 31; // clear window in the lid
const HINGE_V = LID.v - LID.r; // lid hinge at the back of the lid
const LID_OPEN = 75 * Math.PI / 180;
// Controls laid out symmetrically around the player's middle (u 55): play/pause left, LCD centered,
// the four small buttons right, all on the LCD's center line.
const BTN = { // round buttons on the panel: center (u, v), radius
  play: { u: 28, v: 95, r: 4.5 },
  prev: { u: 78, v: 91, r: 3 },
  next: { u: 86, v: 91, r: 3 },
  minus: { u: 78, v: 99.5, r: 3 },
  plus: { u: 86, v: 99.5, r: 3 },
};
const LCD = { u: 41, v: 90.5, w: 28, d: 9 };

// Jewel case on the desk at the left (clear of the lid when it opens), and the wheel of past songs
// at the right edge (about half of it shows).
const CASE = 46, CASE_X = VIEW.x + 4, CASE_Y = DESK_Y - CASE - 2;
const WHEEL = { x: VIEW_RIGHT, y: 58, r: 36, slots: 16 };
// Song change: the case on the desk flies into the wheel (which turns to free a slot meanwhile),
// then a fresh case pops up from the side.
const FLY_TIME = 0.8, TURN_TIME = 0.5, POP_TIME = 0.4;
const OFFSTAGE = VIEW.x - CASE - 4; // where a new case waits, just out of view on the left
const popBack = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2; // overshoots a little, then settles

// Disc keyframes, like the vinyl: flat in the player (u, v, h) blended toward upright on screen (sx, sy, ss).
const UPRIGHT_R = 21; // disc radius on screen when upright, fits the case
const IN_PLAYER = { u: CD.u, v: CD.v, h: T - 3, up: 0, sx: CASE_X + CASE / 2, sy: CASE_Y - UPRIGHT_R, ss: UPRIGHT_R / CD.r };
const LIFTED = { ...IN_PLAYER, h: T + 34 };
const ABOVE_CASE = { ...LIFTED, up: 1 };
const IN_CASE = { ...ABOVE_CASE, sy: CASE_Y + CASE / 2 };

const ring = (c, ru, rv, n = 48) => Array.from({ length: n }, (_, i) => [c.u + ru * Math.cos(i * 2 * Math.PI / n), c.v + rv * Math.sin(i * 2 * Math.PI / n)]);
// Smallest convex outline around a set of points (so the round body and the front bulge are one shape).
function hull(pts) {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  return [...half(s), ...half(s.reverse())];
}
// Part of a convex outline with v >= v0 (cut straight across).
function frontOf(pts, v0) {
  const out = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    if (a[1] >= v0) out.push(a);
    if ((a[1] >= v0) !== (b[1] >= v0)) out.push([a[0] + (b[0] - a[0]) * (v0 - a[1]) / (b[1] - a[1]), v0]);
  });
  return out;
}
// Shrink an outline toward its middle by d units (for bevels and the inset faceplate).
const inset = (pts, d) => {
  const cu = pts.reduce((a, p) => a + p[0], 0) / pts.length, cv = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([u, v]) => { const l = Math.hypot(u - cu, v - cv); return [u - (u - cu) / l * d, v - (v - cv) / l * d]; });
};
const LID_PTS = ring(LID, LID.r, LID.r);
const SHAPE = hull([...ring(ROUND, ROUND.r, ROUND.r), ...ring(POD, POD.ru, POD.rv)]); // whole body: round with the front bulging out
const PLATE = frontOf(inset(SHAPE, 3), LID.v + 10); // silver faceplate; its back part is hidden under the round lid
const outline = (h, pts = SHAPE) => pts.map(([u, v]) => P(u, v, h));
const lidShape = (a) => LID_PTS.map(([u, v]) => lidP(u, v, a));
// Lid point: the lid turns up around the hinge at the back.
function lidP(u, v, a, dh = 0) {
  const d = v - HINGE_V;
  return P(u, HINGE_V + d * Math.cos(a), T + dh + d * Math.sin(a));
}
const lidCircle = (u, v, r, a, n = 40) => Array.from({ length: n }, (_, i) => lidP(u + r * Math.cos(i * 2 * Math.PI / n), v + r * Math.sin(i * 2 * Math.PI / n), a));

// Disc point at local offset (x, y): blend of lying flat in the player and standing upright.
function cdAt(R, x, y) {
  const [fx, fy] = P(R.u + x, R.v + y, R.h);
  return [lerp(fx, R.sx + x * R.ss * (R.fx ?? 1), R.up), lerp(fy, R.sy + y * R.ss, R.up)];
}
const cdCircle = (R, r, n = 48) => Array.from({ length: n }, (_, i) => cdAt(R, r * Math.cos(i * 2 * Math.PI / n), r * Math.sin(i * 2 * Math.PI / n)));

// Cover color at texture position, with a rainbow shimmer in two fixed light bands (dithered).
function discColor(cover, tu, tv, x, y, r, shine, dither) {
  const a = Math.atan2(y, x) * 180 / Math.PI;
  const band = Math.min(Math.abs(((a - 225 + 540) % 360) - 180), Math.abs(((a - 45 + 540) % 360) - 180));
  if (band < 10 + shine * 4 && dither) return `hsl(${Math.round((r * 11 + a) % 360)},80%,78%)`;
  if (!cover) return band < 14 ? "#e8ecf2" : "#c4cad4"; // blank silver disc
  const i = (Math.round(tv * (SLEEVE - 1)) * SLEEVE + Math.round(tu * (SLEEVE - 1))) * 4;
  return `rgb(${cover.data[i]},${cover.data[i + 1]},${cover.data[i + 2]})`;
}

// The CD: the cover printed over the whole disc except the clear hub; only the part within `limit` shows.
function disc_(cover, R, turn, shine, limit = CD.r) {
  const base = cover ? `rgb(${cover.avg.join(",")})` : "#c4cad4";
  if (limit >= CD.r) poly(cdCircle(R, CD.r).map(([x, y]) => [x, y + 1]), "#5c616b"); // edge
  poly(cdCircle(R, Math.min(limit, CD.r)), base); // fills any gaps between placed texels
  const n = 96, ct = Math.cos(turn), st = Math.sin(turn);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const lx = (i / (n - 1) * 2 - 1) * CD.r, ly = (j / (n - 1) * 2 - 1) * CD.r;
      const r = Math.hypot(lx, ly);
      if (r > CD.r || r > limit || r < CD.hub) continue;
      const x = lx * ct - ly * st, y = lx * st + ly * ct; // spun clockwise
      px(...cdAt(R, x, y), discColor(cover, i / (n - 1), j / (n - 1), x, y, r, shine, (i + j) % 2));
    }
  }
  // Clear plastic hub with the hole in the middle.
  poly(cdCircle(R, CD.hub), "rgba(215,225,238,.55)");
  poly(cdCircle(R, 2.5), "#16181e");
  if (limit >= CD.r) {
    for (let d = 190; d <= 280; d += 2) px(...cdAt(R, CD.r * Math.cos(d * Math.PI / 180), CD.r * Math.sin(d * Math.PI / 180)), "#ffffff"); // lit rim
  }
}

// 3×5 LCD digits.
const DIG = { 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 7, 1, 7], 4: [5, 5, 7, 1, 1], 5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 1, 1], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7], "-": [0, 0, 7, 0, 0] };
function lcdText(text, x, y, c) {
  for (const ch of text) {
    if (ch === ":") { px(x, y + 1, c); px(x, y + 3, c); x += 2; continue; }
    if (ch === " ") { x += 3; continue; }
    DIG[ch].forEach((row, dy) => [4, 2, 1].forEach((bit, dx) => row & bit && px(x + dx, y + dy, c)));
    x += 4;
  }
}
const clock = (s) => `${String(Math.floor(s / 60) % 100).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Small pixel icons for the buttons, drawn around a screen point.
const ICONS = {
  play: [[-2, -1], [-2, 0], [-2, 1], [-1, 0], [1, -1], [1, 0], [1, 1], [2, -1], [2, 0], [2, 1]], // ▶‖
  prev: [[-2, 0], [-1, -1], [-1, 0], [-1, 1], [0, 0], [1, -1], [1, 0], [1, 1]], // ◀◀
  next: [[-2, -1], [-2, 0], [-2, 1], [-1, 0], [0, -1], [0, 0], [0, 1], [1, 0]], // ▶▶
  minus: [[-1, 0], [0, 0], [1, 0]],
  plus: [[-1, 0], [0, 0], [1, 0], [0, -1], [0, 1]],
};

// Flat rubber-topped button: dark outline in the panel, a thin front band, a light cap and a crisp icon.
function button(id, S) {
  const b = BTN[id], down = S.pressed === id, h = T + (down ? 0.3 : 1);
  disc(b.u, b.v, b.r + 0.8, T, "#4a4f5a"); // outline cut into the panel
  disc(b.u, b.v + 0.3, b.r, h - 0.6, "#8a8f99"); // front band
  disc(b.u, b.v, b.r, h, down ? "#c9cdd4" : "#eef0f3"); // cap
  arcDots(b.u, b.v, b.r - 0.6, h, 200, 290, 10, "#ffffff"); // light on the back of the cap
  const [x, y] = P(b.u, b.v, h);
  for (const [dx, dy] of ICONS[id]) px(Math.round(x) + dx, Math.round(y) + dy, "#2c3038");
}

function lcd(p, S) {
  const { u, v, w, d } = LCD;
  poly([P(u - 1.5, v - 2, T), P(u + w + 1.5, v - 2, T), P(u + w + 2, v - 1, T), P(u + w + 2, v + d + 1, T), P(u + w + 1.5, v + d + 2, T), P(u - 1.5, v + d + 2, T), P(u - 2, v + d + 1, T), P(u - 2, v - 1, T)], "#3a3e48"); // bezel with clipped corners
  poly([P(u, v, T), P(u + w, v, T), P(u + w, v + d, T), P(u, v + d, T)], "#6b78e6"); // blue backlight
  seg(P(u, v, T), P(u + w, v, T), "#4b56b8"); // inner shadow along the top
  seg(P(u - 1.5, v + d + 2.5, T), P(u + w + 1.5, v + d + 2.5, T), "#f4f5f7"); // panel catching light under the bezel
  const [x0, y0] = P(u + 1.5, v + d / 2, T);
  const blink = !S.playing && Math.floor(p.now / 500) % 2; // time blinks while paused
  const track = S.trackNo ? String(S.trackNo % 100).padStart(2, "0") : "--";
  lcdText("88", Math.round(x0), Math.round(y0 - 2), "#6371dc"); // faint unlit segments, like a real LCD
  lcdText("88:88", Math.round(x0 + 12), Math.round(y0 - 2), "#6371dc");
  lcdText(track, Math.round(x0), Math.round(y0 - 2), "#1a1f5c");
  if (!blink) lcdText(clock(S.position(p.now)), Math.round(x0 + 12), Math.round(y0 - 2), "#1a1f5c");
}

// The player. lid: angle the lid is open (0 = closed). cd: disc pose or null (in the case).
function player(p, S) {
  const a = p.lid;
  // Shadow, then the side in bands that lighten toward the top so the edge reads as rounded.
  poly(outline(0).map(([x, y]) => [x + 5, y + 6]), "rgba(0,0,0,.3)");
  [["#15171c", 0], ["#1c1f25", 0.3], ["#24272e", 0.55], ["#2e323a", 0.8]].forEach(([c, f]) => poly(outline(T * f), c));
  poly(outline(T), "#3f444f"); // rounded top edge catching the light
  poly(outline(T, inset(SHAPE, 1.5)), "#2f333c"); // top surface inside the bevel
  // Silver faceplate set into the top, wrapping around the front of the round lid: dark groove, plate, lit front edge.
  poly(outline(T, inset(PLATE, -0.8)), "#1a1c22");
  poly(outline(T, PLATE), "#c3c8d0");
  poly(outline(T, inset(PLATE, 2)), "#cdd1d8");
  for (let d = 20; d <= 160; d += 3) px(...P(POD.u + (POD.ru - 3) * Math.cos(d * Math.PI / 180), POD.v + (POD.rv - 3) * Math.sin(d * Math.PI / 180), T), "#eef0f3"); // lit front edge
  // Where the lid sits: graphite with a dark groove, so the plate's back edge follows the lid's curve.
  disc(LID.u, LID.v, LID.r + 1, T, "#1a1c22");
  disc(LID.u, LID.v, LID.r, T, "#2f333c");
  // Well the disc sits in.
  disc(CD.u, CD.v, CD.r + 3, T, "#121419");
  spindle(...P(CD.u, CD.v, T - 1));

  // Open lid: the round top turned up at the back; smoky plastic you can see the case through.
  const lidUp = () => {
    poly(lidShape(a).map(([x, y]) => [x, y + 2]), "rgba(30,33,40,.6)"); // edge thickness
    poly(lidShape(a), "rgba(70,76,90,.6)");
    poly(lidCircle(CD.u, CD.v, WINDOW_R, a), "rgba(170,185,210,.15)"); // window catches a little light
  };
  if (a > 1.2) lidUp(); // opened wide: the lid stands behind the disc
  if (p.cd && a > 0.01) disc_(p.cd.cover, p.cd, p.turn, p.shine);
  if (a > 0.01 && a <= 1.2) lidUp();
  if (a <= 0.01) {
    // Closed: graphite lid with a clear window; the spinning disc shows through it.
    poly(lidShape(0), "#3a3f4a");
    arcDots(LID.u, LID.v, LID.r - 0.5, T, 185, 300, 2, "#6c717c"); // lit back rim
    arcDots(LID.u, LID.v, LID.r - 0.5, T, 30, 150, 3, "#4a4f5a"); // front rim
    poly(lidCircle(CD.u, CD.v, WINDOW_R + 1.5, 0), "#22252c"); // window frame
    poly(lidCircle(CD.u, CD.v, WINDOW_R, 0), "#0f1116");
    if (p.cd) disc_(p.cd.cover, { ...p.cd, h: T - 2 }, p.turn, p.shine, WINDOW_R - 1);
    for (let k = 0; k < 6; k++) seg(lidP(CD.u - 18 + k, CD.v - 14 - k, 0, 0.5), lidP(CD.u - 8 + k, CD.v - 24 - k, 0, 0.5), "rgba(255,255,255,.18)"); // glare
    arcDots(CD.u, CD.v, WINDOW_R, T, 190, 300, 3, "#8a8f99");
  }
  for (const id of Object.keys(BTN)) button(id, S);
  lcd(p, S);
}

// Click test for a round button: its oval on top of the panel, with a pixel to spare.
function onButton(b, [x, y]) {
  const [cx, cy] = P(b.u, b.v, T + 1), [ex] = P(b.u + b.r, b.v, T + 1), [, ey] = P(b.u, b.v + b.r, T + 1);
  const rx = Math.abs(ex - cx) + 1, ry = Math.abs(ey - cy) + 0.5;
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

// Jewel case: cover behind clear plastic, dark hinge strip on the left, light glare.
function jewelCase(c, x, y, lift = 0, alpha = 1) {
  if (!c) return;
  y -= lift;
  g.globalAlpha = alpha;
  rect(x, y, CASE, CASE, "rgba(200,210,222,.5)");
  drawCover(c, x + 4, y + 1, CASE - 5);
  rect(x, y, 4, CASE, "rgba(30,34,44,.85)"); // hinge
  for (let k = 3; k < CASE; k += 6) rect(x + 1, y + k, 2, 1, "rgba(255,255,255,.25)");
  rect(x, y, CASE, 1, "rgba(255,255,255,.6)");
  rect(x + CASE - 1, y, 1, CASE, "rgba(255,255,255,.35)");
  for (let k = 0; k < 10; k++) seg([x + 8 + k * 2, y + 2], [x + 4, y + 6 + k * 2], "rgba(255,255,255,.07)"); // glare
  g.globalAlpha = 1;
}

// Wheel of past songs: clear acrylic disc on a chrome tube stand, slim cases standing out like spokes.
// Slots without a song hold plain cases in the colors of the reference photo.
const BLANKS = ["#e8c33a", "#d95d8f", "#4fb36a", "#22252c", "#7fb5e0", "#f08a3c", "#c9cdd4", "#8e5bb5"];
// k: 0..1 how far the wheel has turned to free the left slot; empty: the newest case is still on its way.
function wheel(songs, S, lift, k, empty) {
  const { x: cx, r } = WHEEL, cy = WHEEL.y - lift;
  // Chrome stand: a bent tube loop from behind the hub down to a U-shaped foot on the desk.
  const tube = (a, b) => { seg([a[0], a[1] + 1], [b[0], b[1] + 1], "#6c717c"); seg(a, b, "#c9cdd4"); seg([a[0] - 1, a[1]], [b[0] - 1, b[1]], "#ffffff"); };
  const foot = DESK_Y + 3;
  tube([cx - 4, cy + 4], [cx - 20, foot - 1]); // back leg
  tube([cx - 20, foot - 1], [cx - 30, foot + 2]); // bend into the foot
  rect(cx - 31, foot + 2, 40, 2, "#c9cdd4"); // foot along the desk
  rect(cx - 31, foot + 2, 40, 1, "#ffffff");
  rect(cx - 29, foot + 4, 40, 1, "rgba(0,0,0,.3)"); // shadow
  // Two acrylic plates: the back one peeks out a little, the front one has slot walls for every case.
  const circ = (rr, n = 64) => Array.from({ length: n }, (_, i) => [cx + rr * Math.cos(i * 2 * Math.PI / n), cy + rr * Math.sin(i * 2 * Math.PI / n)]);
  poly(circ(r).map(([x, y]) => [x + 3, y + 2]), "rgba(200,220,232,.14)"); // back plate
  for (let d = 0; d < 360; d += 3) px(cx + 3 + r * Math.cos(d * Math.PI / 180), cy + 2 + r * Math.sin(d * Math.PI / 180), "rgba(255,255,255,.22)");
  poly(circ(r + 1).map(([x, y]) => [x + 1, y + 1]), "rgba(150,170,185,.25)"); // front plate edge
  poly(circ(r), "rgba(215,232,242,.22)");
  const step = 360 / WHEEL.slots;
  for (let sl = 0; sl < WHEEL.slots; sl++) {
    // Slot walls turn with the wheel: two thin clear fins either side of each case, with a gap between slots.
    const a = (180 + (sl - 1 + k) * step) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    for (const side of [-3, 3]) seg([cx + dx * 10 + nx * side, cy + dy * 10 + ny * side], [cx + dx * (r - 1) + nx * side, cy + dy * (r - 1) + ny * side], "rgba(255,255,255,.3)");
    px(cx + dx * r, cy + dy * r, "rgba(60,70,80,.6)"); // notch in the rim
  }
  // Cases as spokes; on a song change everything turns one slot and the newest comes in at the left.
  for (let j = 0; j < WHEEL.slots; j++) {
    const c = songs[j];
    if (j === 0 && empty) continue; // still on its way in
    const a = (180 + (j === 0 ? 0 : j - 1 + k) * 360 / WHEEL.slots) * Math.PI / 180;
    const dx = Math.cos(a), dy = Math.sin(a), nx = -dy * 1.2, ny = dx * 1.2; // slim cases, a little thinner than their slot
    const p0 = [cx + dx * 11, cy + dy * 11], p1 = [cx + dx * (r - 3), cy + dy * (r - 3)];
    const col = c ? `rgb(${c.avg.join(",")})` : BLANKS[(((j - S.songCount) % BLANKS.length) + BLANKS.length) % BLANKS.length];
    poly([[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]], col);
    seg([p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], "rgba(255,255,255,.55)"); // clear edge catching light
    seg([p0[0] - nx, p0[1] - ny], [p1[0] - nx, p1[1] - ny], "rgba(0,0,0,.35)");
  }
  for (let d = 0; d < 360; d += 2) px(cx + r * Math.cos(d * Math.PI / 180), cy + r * Math.sin(d * Math.PI / 180), d > 150 && d < 260 ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.35)"); // rim
  // Chrome hub knob.
  poly(circ(5, 16), "#6c717c");
  poly(circ(4, 16), "#c9cdd4");
  poly(circ(2, 12), "#ffffff");
}

// The jewel case from the desk on its way into the wheel: it lifts, arcs over the player and turns
// edge-on as it slides into the free slot on the left of the wheel (k 0..1).
function flyingCase(c, k) {
  const cx = WHEEL.x, cy = WHEEL.y, r = WHEEL.r;
  const start = { x: CASE_X, y: CASE_Y, w: CASE, h: CASE };
  const end = { x: cx - r + 3, y: cy - 1.2, w: r - 14, h: 2.4 }; // the slot's case, seen edge-on
  const box = mix(start, end, k);
  box.y -= Math.sin(Math.PI * k) * 40; // arc up over the player
  if (box.h > 5) {
    rect(box.x + 2, box.y + 2, box.w, box.h, "rgba(0,0,0,.25)");
    g.drawImage(c.canvas, Math.round(box.x), Math.round(box.y), Math.max(1, Math.round(box.w)), Math.max(1, Math.round(box.h)));
    rect(box.x, box.y, box.w, 1, "rgba(255,255,255,.6)");
    rect(box.x, box.y, Math.max(1, box.w * 0.08), box.h, "rgba(30,34,44,.8)"); // hinge
  } else {
    rect(box.x, box.y, box.w, Math.max(2, box.h), `rgb(${c.avg.join(",")})`);
    rect(box.x, box.y, box.w, 1, "rgba(255,255,255,.55)");
  }
}

// Album change, phases in seconds (~3.1s).
const SWAP = [
  0.35, // 0 lid opens
  0.25, // 1 disc lifts out
  0.35, // 2 turns upright above the case
  0.25, // 3 slides down into the case
  0.7, //  4 the case flies into the wheel (the wheel turns to make room)
  0.4, //  5 the new album's case pops up from the side (wall color fades)
  0.25, // 6 new disc rises out of its case
  0.35, // 7 lies flat over the player
  0.2, //  8 drops into the player
  0.35, // 9 lid closes
];
const PATH = [
  [IN_PLAYER, IN_PLAYER], [IN_PLAYER, LIFTED], [LIFTED, ABOVE_CASE], [ABOVE_CASE, IN_CASE], null, null,
  [IN_CASE, ABOVE_CASE], [ABOVE_CASE, LIFTED], [LIFTED, IN_PLAYER], [IN_PLAYER, IN_PLAYER],
];

export default {
  id: "cd",
  rpm: 60, // drawn slower than a real CD so the cover stays readable
  swap: SWAP,
  history: "songs", // the wheel keeps past songs
  historySize: WHEEL.slots,

  pose(p, S, sw) {
    p.lid = 0;
    p.cd = { ...IN_PLAYER, cover: S.shown, clip: false };
    p.caseX = CASE_X;
    p.wheelK = 1;
    p.empty = false;
    p.fly = null;
    if (!sw) {
      // Song change: the case flies into the wheel, then a fresh one pops up from the side.
      if (S.songChange === null || !S.songs[0]) return;
      const t = (p.now - S.songChange) / 1000;
      p.wheelK = ease(Math.min(t / TURN_TIME, 1));
      if (t < FLY_TIME) {
        p.fly = { cover: S.songs[0], k: ease(t / FLY_TIME) };
        p.empty = true;
        p.display = null;
      } else if (t < FLY_TIME + POP_TIME) {
        p.caseX = lerp(OFFSTAGE, CASE_X, popBack((t - FLY_TIME) / POP_TIME));
      }
      return;
    }
    const { i, k, from, to } = sw;
    p.lid = (i === 0 ? ease(k) : i === 9 ? 1 - ease(k) : 1) * LID_OPEN;
    p.cd = PATH[i] && { ...mix(PATH[i][0], PATH[i][1], k), cover: i < 4 ? from : to, clip: i === 3 || i === 6 };
    p.display = i < 5 ? from : to;
    p.wallMix = i < 5 ? 0 : i > 5 ? 1 : k;
    if (i < 4) { p.wheelK = 0; p.empty = true; } // the wheel waits for the old album's case
    if (i === 4) {
      p.fly = { cover: from, k };
      p.wheelK = k;
      p.empty = true;
      p.display = null;
    }
    if (i === 5) p.caseX = lerp(OFFSTAGE, CASE_X, popBack(sw.k));
  },

  draw(p, S) {
    const lift = (what) => (S.hover === what && !p.sw ? 2 : 0);
    if (p.display) rect(p.caseX + 3, CASE_Y + 3, CASE, CASE - 2, tone(p.wall, 0.65)); // case shadow on the wall
    jewelCase(p.display, p.caseX, CASE_Y, lift("album"));
    wheel(S.songs, S, lift("stand"), p.wheelK, p.empty);
    // A disc on its way in or out of the case: only the part above the case shows.
    if (p.cd && p.cd.up > 0) {
      player({ ...p, cd: null }, S);
      if (p.cd.clip) clipTo(0, 0, VIEW_RIGHT, CASE_Y);
      disc_(p.cd.cover, p.cd, p.turn, p.shine);
      if (p.cd.clip) g.restore();
    } else {
      player(p, S);
    }
    if (p.fly?.cover) flyingCase(p.fly.cover, p.fly.k);
  },

  // Disc widget: the CD standing upright, cover all over it, flipping like a coin on an album change.
  widget(p, cover, fx) {
    const R = 76, cx = 80, cy = 79, img = g.createImageData(160, 160), ct = Math.cos(-p.turn), st = Math.sin(-p.turn);
    const put = (x, y, rgb, a = 255) => { const i = (y * 160 + x) * 4; img.data.set([...rgb, a], i); };
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 160; x++) {
        const lx = (x + 0.5 - cx) / (R * fx), ly = (y + 0.5 - cy) / R, r = Math.hypot(lx, ly);
        if (r > 1) continue;
        if (r > 0.985) { put(x, y, [92, 97, 107]); continue; } // edge
        if (r < CD.hub / CD.r) { put(x, y, r < 2.5 / CD.r ? [22, 24, 30] : [215, 225, 238], r < 2.5 / CD.r ? 0 : 140); continue; }
        const tx = lx * ct - ly * st, ty = lx * st + ly * ct; // unspin to find the cover texel
        const a = Math.atan2(ly, lx) * 180 / Math.PI;
        const band = Math.min(Math.abs(((a - 225 + 540) % 360) - 180), Math.abs(((a - 45 + 540) % 360) - 180));
        if (band < 10 + p.shine * 4 && (x + y) % 2) {
          const h = (r * 400 + a) % 360, c = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.78 - 0.18 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
          put(x, y, [c(0), c(8), c(4)]);
          continue;
        }
        if (!cover) { put(x, y, band < 14 ? [232, 236, 242] : [196, 202, 212]); continue; }
        const i = (Math.min(SLEEVE - 1, Math.max(0, Math.round((ty + 1) / 2 * (SLEEVE - 1)))) * SLEEVE + Math.min(SLEEVE - 1, Math.max(0, Math.round((tx + 1) / 2 * (SLEEVE - 1))))) * 4;
        put(x, y, [cover.data[i], cover.data[i + 1], cover.data[i + 2]]);
      }
    }
    g.putImageData(img, 0, 0);
  },

  hit(pt, S) {
    for (const [id, b] of Object.entries(BTN)) {
      if (!onButton(b, pt)) continue;
      if (id === "play") return { kind: "press", id, act: "play" };
      if (id === "prev" || id === "next") return { kind: "search", id, forward: id === "next" };
      return { kind: "volume", id, step: id === "plus" ? 5 : -5 };
    }
    const [x, y] = pt;
    if (Math.hypot(x - WHEEL.x, y - WHEEL.y) <= WHEEL.r) return { kind: "skip", forward: false, hover: "stand" };
    if (x >= CASE_X && x < CASE_X + CASE && y >= CASE_Y && y < CASE_Y + CASE) return { kind: "skip", forward: true, hover: "album" };
    return null;
  },
};
