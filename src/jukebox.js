// Jukebox interface: the upper half of a retro jukebox, close up. Glowing light tubes in the album's
// color around a wooden arch, a glass dome with the record mechanism inside (a rack of 45s with your
// recent songs, a gripper arm, a small turntable with a tone arm), and a selector panel with a title card.
import { g, px, rect, lerp, ease, mix, poly, seg } from "./pixel.js";

const CX = 102; // middle of the jukebox
const ARCH = { y: 98, r: 72 }; // arch center height and outer radius (the tubes)
const DOME = { y: 94, r: 50 }; // glass dome: half circle sitting on y, big so the mechanism is easy to follow
const PANEL = { x0: 58, x1: 146, y0: 100, y1: 138 };
const CARD = { x0: 64, x1: 140, y0: 104, y1: 117 }; // title card
const BTN = {
  prev: { x: 70, y: 128, r: 4 },
  next: { x: 82, y: 128, r: 4 },
  play: { x: 102, y: 128, r: 6 },
};
const KNOB = { x: 126, y: 128, r: 6 };

// Mechanism inside the dome.
const RACK_Y = 63, RACK_R = 9, SLOTS = 7;
const rackX = (j) => 70 + j * 10;
const TT = { x: CX, y: 86, r: 15, flat: 1 }; // record on the turntable
const LIFTED = { x: CX, y: 69, r: 11, flat: 0 }; // held up by the gripper, standing
const RACK0 = { x: rackX(0), y: RACK_Y, r: RACK_R, flat: 0 }; // first rack slot
const FETCH = { x: rackX(SLOTS), y: RACK_Y, r: RACK_R, flat: 0 }; // where the next record waits, at the right end
const PARK = { x: CX + 26, y: 54 }; // gripper rest
const SQUASH = 0.55; // how flat a record lying on the turntable looks

// Shapes: an arch (half circle on top of straight sides that run off the bottom) and the dome.
const half = (cy, r, n = 40) => Array.from({ length: n + 1 }, (_, i) => [CX + r * Math.cos(Math.PI + i * Math.PI / n), cy + r * Math.sin(Math.PI + i * Math.PI / n)]);
const arch = (r) => [...half(ARCH.y, r), [CX + r, 200], [CX - r, 200]];
const dome = (r) => half(DOME.y, r);

// Light color from the cover: the album's hue made bright, pulsing gently while playing.
function glow(cover, now, playing) {
  const [r, gr, b] = cover ? cover.avg : [70, 160, 200];
  const max = Math.max(r, gr, b), min = Math.min(r, gr, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((gr - b) / d) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4;
  const hue = d < 12 ? 190 : Math.round(h * 60 + 360) % 360; // gray covers glow the classic blue
  const pulse = playing ? 0.5 + 0.5 * Math.sin(now / 700) : 0;
  const l = playing ? 62 + pulse * 10 : 48;
  return { core: `hsl(${hue},85%,${l + 14}%)`, tube: `hsl(${hue},75%,${l}%)`, edge: `hsl(${hue},70%,${l - 18}%)`, halo: `hsla(${hue},90%,70%,${playing ? 0.18 + pulse * 0.1 : 0.08})` };
}

// A 45 record: flat 1 = lying on the turntable (squashed oval), 0 = standing, face on.
// The label shows the cover, spun by `turn` when it's playing.
function record45(c, R, turn = 0) {
  const ry = R.r * (1 - SQUASH * R.flat), oval = (rx, ryy, n = 32) => Array.from({ length: n }, (_, i) => [R.x + rx * Math.cos(i * 2 * Math.PI / n), R.y + ryy * Math.sin(i * 2 * Math.PI / n)]);
  poly(oval(R.r, ry).map(([x, y]) => [x, y + 1]), "#050508");
  poly(oval(R.r, ry), "#15161d");
  for (let d = 200; d <= 280; d += 8) px(R.x + R.r * 0.75 * Math.cos(d * Math.PI / 180), R.y + ry * 0.75 * Math.sin(d * Math.PI / 180), "#5a5f78"); // shine
  const lr = R.r * 0.45, lry = ry * 0.45, n = 20, ct = Math.cos(turn), st = Math.sin(turn);
  poly(oval(lr, lry, 20), c ? `rgb(${c.avg.join(",")})` : "#d7dbe0");
  if (c) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const lx = (i / (n - 1) * 2 - 1), ly = (j / (n - 1) * 2 - 1);
        if (lx * lx + ly * ly > 1) continue;
        const x = lx * ct - ly * st, y = lx * st + ly * ct;
        const k = (Math.round(j / (n - 1) * 63) * 64 + Math.round(i / (n - 1) * 63)) * 4;
        px(R.x + x * lr, R.y + y * lry, `rgb(${c.data[k]},${c.data[k + 1]},${c.data[k + 2]})`);
      }
    }
  }
  poly(oval(Math.max(1, lr * 0.3), Math.max(0.6, lry * 0.3), 12), "#c9cdd4"); // the big 45 hole with its adapter
}

// The gripper: a chrome rod from the top of the dome down to two claws around the record.
function gripper(at, holding) {
  seg([at.x, DOME.y - DOME.r + 3], [at.x, at.y - 9], "#9aa0aa");
  seg([at.x + 1, DOME.y - DOME.r + 3], [at.x + 1, at.y - 9], "#eef0f3");
  rect(at.x - 4, at.y - 10, 9, 2, "#c9cdd4");
  rect(at.x - 4, at.y - 10, 9, 1, "#ffffff");
  const open = holding ? 0 : 2;
  for (const s of [-1, 1]) seg([at.x + s * (4 + open), at.y - 9], [at.x + s * (4 + open), at.y - 5], "#c9cdd4");
}

// Tone arm on the right of the turntable. swing: 0 on the record .. 1 parked.
function toneArm(swing) {
  const base = [CX + 23, 84], a = lerp(Math.PI * 1.08, Math.PI * 1.45, swing), len = 14;
  const tip = [base[0] + len * Math.cos(a), base[1] + len * Math.sin(a) * 0.5 - swing * 2];
  poly([[base[0] - 2, base[1] - 1], [base[0] + 2, base[1] - 1], [base[0] + 2, base[1] + 2], [base[0] - 2, base[1] + 2]], "#5c616b");
  seg(base, tip, "#eef0f3");
  seg([base[0], base[1] + 1], [tip[0], tip[1] + 1], "#7d838e");
  rect(tip[0] - 1, tip[1] - 1, 3, 2, "#dfe2e7");
}

function knob(volume) {
  const { x, y, r } = KNOB, circ = (rr, n = 20) => Array.from({ length: n }, (_, i) => [x + rr * Math.cos(i * 2 * Math.PI / n), y + rr * Math.sin(i * 2 * Math.PI / n)]);
  poly(circ(r + 1).map(([a, b]) => [a + 1, b + 1]), "rgba(0,0,0,.35)");
  poly(circ(r), "#7d838e");
  poly(circ(r - 1), "#dfe2e7");
  for (let d = 0; d < 360; d += 30) px(x + (r - 0.5) * Math.cos(d * Math.PI / 180), y + (r - 0.5) * Math.sin(d * Math.PI / 180), "#9aa0aa"); // grip ridges
  const a = (135 + volume / 100 * 270) * Math.PI / 180; // pointer from lower left, round the top, to lower right
  seg([x, y], [x + (r - 1.5) * Math.cos(a), y + (r - 1.5) * Math.sin(a)], "#8b1e1e");
}

function button(id, S) {
  const b = BTN[id], down = S.pressed === id, circ = (rr, n = 20) => Array.from({ length: n }, (_, i) => [b.x + rr * Math.cos(i * 2 * Math.PI / n), b.y + (down ? 1 : 0) + rr * Math.sin(i * 2 * Math.PI / n)]);
  poly(circ(b.r + 1).map(([a, c]) => [a, c + (down ? 0 : 1)]), "#4a4f5a");
  poly(circ(b.r), id === "play" ? (down ? "#8b1e1e" : "#c0392b") : down ? "#b9bec7" : "#e2e5ea");
  poly(circ(b.r - 1.5).map(([a, c]) => [a - 0.5, c - 0.5]), id === "play" ? "#e0564a" : "#f4f5f7"); // shine
  const y = b.y + (down ? 1 : 0), ink = id === "play" ? "#ffffff" : "#2c3038";
  if (id === "prev") [[1, -1], [1, 0], [1, 1], [0, 0], [-1, 0]].forEach(([dx, dy]) => px(b.x + dx, y + dy, ink));
  if (id === "next") [[-1, -1], [-1, 0], [-1, 1], [0, 0], [1, 0]].forEach(([dx, dy]) => px(b.x + dx, y + dy, ink));
  if (id === "play") [[-2, -1], [-2, 0], [-2, 1], [-1, 0], [1, -1], [1, 0], [1, 1], [2, -1], [2, 0], [2, 1]].forEach(([dx, dy]) => px(b.x + dx, y + dy, ink));
}

// Title card: cream card with a red line, the song in dark ink, scrolling when it's too long.
function titleCard(S, now) {
  const { x0, x1, y0, y1 } = CARD;
  rect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, "#5c616b");
  rect(x0, y0, x1 - x0, y1 - y0, "#f3ead2");
  rect(x0, y0 + 1, x1 - x0, 1, "#c0392b");
  rect(x0, y1 - 2, x1 - x0, 1, "#c0392b");
  const img = S.textImage([52, 36, 30]);
  if (!img) return;
  const w = x1 - x0 - 4, y = y0 + 1;
  g.save();
  g.beginPath();
  g.rect(x0 + 2, y0 + 2, w, y1 - y0 - 4);
  g.clip();
  if (img.width <= w) g.drawImage(img, Math.round(x0 + 2 + (w - img.width) / 2), y);
  else {
    const loop = img.width + 30, off = Math.floor((now / 1000 * 16) % loop);
    g.drawImage(img, x0 + 2 - off, y);
    g.drawImage(img, x0 + 2 - off + loop, y);
  }
  g.restore();
}

// Chrome crown on top: a center fan with scroll wings either side.
function crown() {
  const fan = [[CX - 12, 31], [CX + 12, 31], [CX + 7, 19], [CX - 7, 19]];
  poly(fan.map(([x, y]) => [x + 1, y + 1]), "#4a4f5a");
  poly(fan, "#9aa0aa");
  poly([[CX - 10, 30], [CX + 10, 30], [CX + 6, 20], [CX - 6, 20]], "#dfe2e7");
  for (let k = -2; k <= 2; k++) seg([CX + k * 2.5, 29], [CX + k * 1.5, 21], "#9aa0aa"); // fluting
  rect(CX - 2, 15, 5, 5, "#9aa0aa");
  rect(CX - 1, 15, 3, 4, "#f4f5f7");
  for (const s of [-1, 1]) { // scroll wings
    for (let k = 0; k < 12; k++) {
      const a = k / 11 * Math.PI * 1.4, r = 5 - k * 0.25;
      px(CX + s * (14 + k * 1.3) , 28 - Math.sin(a) * r, "#dfe2e7");
      px(CX + s * (14 + k * 1.3), 29 - Math.sin(a) * r, "#7d838e");
    }
  }
}

// Back wall of the mechanism: dark panel with an arc of little bulbs that chase while playing,
// and two chrome pillars holding the rack and the turntable.
function mechanismBack(now, playing) {
  for (let y = DOME.y - DOME.r; y < DOME.y; y += 4) rect(CX - DOME.r, y, DOME.r * 2, 1, "#1d1726");
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i + 0.5) * Math.PI / n, x = CX + (DOME.r - 4) * Math.cos(a), y = DOME.y + (DOME.r - 4) * Math.sin(a);
    const lit = playing ? (Math.floor(now / 160) + i) % 4 !== 0 : i % 3 === 0;
    rect(x - 1, y - 1, 2, 2, lit ? `hsl(${(i * 360) / n},90%,68%)` : "#3a3248");
    if (lit) px(x - 1, y - 1, "#ffffff");
  }
  for (const s of [-1, 1]) {
    const x = CX + s * 36;
    rect(x - 1, RACK_Y + 8, 3, DOME.y - RACK_Y - 8, "#5c616b");
    rect(x - 1, RACK_Y + 8, 1, DOME.y - RACK_Y - 8, "#c9cdd4");
  }
}

// Speaker grille below the panel: a chrome-framed opening with a rounded top, woven cloth behind
// a chrome diamond lattice (dots where the bars cross), a chrome star medallion, and glowing tubes either side.
function grille(light, now, playing) {
  const x0 = CX - 32, x1 = CX + 32, y0 = 146, y1 = 200, rr = 10;
  const shape = (d) => {
    const pts = [];
    for (let k = 0; k <= 8; k++) { const a = Math.PI + k * Math.PI / 16; pts.push([x0 + d + rr + (rr) * Math.cos(a), y0 + d + rr + rr * Math.sin(a)]); }
    for (let k = 0; k <= 8; k++) { const a = Math.PI * 1.5 + k * Math.PI / 16; pts.push([x1 - d - rr + rr * Math.cos(a), y0 + d + rr + rr * Math.sin(a)]); }
    return [...pts, [x1 - d, y1], [x0 + d, y1]];
  };
  // Tubes either side, in the same glow as the arch.
  for (const s of [-1, 1]) {
    const x = s < 0 ? x0 - 9 : x1 + 3;
    rect(x - 1, y0 + 2, 8, y1 - y0, "#2a1a12");
    rect(x, y0 + 3, 6, y1 - y0, light.edge);
    rect(x + 1, y0 + 3, 4, y1 - y0, light.tube);
    rect(x + 2, y0 + 3, 2, y1 - y0, light.core);
    rect(x, y0 + 2, 6, 2, "#dfe2e7"); // chrome cap
  }
  poly(shape(-3), "#4a4f5a"); // chrome frame: dark outer edge, bright face
  poly(shape(-2), "#dfe2e7");
  poly(shape(-1), "#9aa0aa");
  poly(shape(0), "#241c26");
  g.save();
  g.beginPath();
  shape(0).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  // Woven cloth: fine two-tone weave.
  for (let y = y0; y < y1; y++) for (let x = x0 + ((y % 2) ? 1 : 0); x < x1; x += 2) px(x, y, "#33283a");
  // Diamond lattice: chrome bars with a lit edge, dots where they cross.
  const step = 12;
  for (let k = -6; k <= 12; k++) {
    const a = x0 + k * step;
    seg([a, y0], [a + (y1 - y0), y1], "#7d838e");
    seg([a + 1, y0], [a + 1 + (y1 - y0), y1], "#dfe2e7");
    seg([a + step * 6, y0], [a + step * 6 - (y1 - y0), y1], "#7d838e");
    seg([a + step * 6 + 1, y0], [a + step * 6 + 1 - (y1 - y0), y1], "#dfe2e7");
  }
  for (let y = y0; y < y1; y += step / 2) {
    for (let x = x0 + (((y - y0) / (step / 2)) % 2 ? step / 2 : 0); x < x1; x += step) rect(x, y, 2, 2, "#f4f5f7");
  }
  g.restore();
  // Chrome medallion with a yellow star at the bottom middle; the star glows while playing.
  const mx = CX, my = 176, ring = (r, n = 20) => Array.from({ length: n }, (_, i) => [mx + r * Math.cos(i * 2 * Math.PI / n), my + r * Math.sin(i * 2 * Math.PI / n)]);
  poly(ring(8), "#4a4f5a");
  poly(ring(7), "#dfe2e7");
  poly(ring(5.5), "#7d838e");
  const star = Array.from({ length: 16 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 8, r = i % 2 ? 2 : 5; return [mx + r * Math.cos(a), my + r * Math.sin(a)]; });
  for (let i = 0; i < 8; i++) poly([[mx, my], star[(i * 2) % 16], star[(i * 2 + 1) % 16]], playing ? (Math.sin(now / 500) > 0 ? "#f7d33c" : "#e8c33a") : "#b8962a");
  for (let i = 0; i < 8; i++) poly([[mx, my], star[(i * 2 + 1) % 16], star[(i * 2 + 2) % 16]], playing ? "#f7d33c" : "#b8962a");
}

// Song change, phases in seconds (~2.9s).
const SWAP = [
  0.3, //  0 tone arm swings off, gripper comes down to the turntable
  0.45, // 1 gripper lifts the record and stands it up
  0.5, //  2 files it into the first rack slot, the rack slides along to make room
  0.45, // 3 gripper goes to the right end, where the next record slides in
  0.5, //  4 carries it back over the turntable
  0.35, // 5 lays it down flat on the turntable
  0.3, //  6 tone arm swings back on
];

export default {
  id: "jukebox",
  rpm: 45,
  swap: SWAP,
  swapEverySong: true, // the mechanism changes records on every song
  ownName: true, // the title card shows the song; no strip along the bottom

  pose(p, S, sw) {
    p.arm = ease(S.paused) * 0.25; // lifts a little while paused
    p.rec = { ...TT, cover: S.shown };
    p.grip = { ...PARK, holding: false };
    p.slot = (j) => rackX(j); // where history record j stands in the rack
    p.skip0 = false; // history record 0 isn't in the rack (it's in the gripper)
    p.extra = null; // a record in the rack that isn't in the history (going back: the one being taken out)
    p.incoming = null; // a record sliding in or out at the right end
    if (!sw) return;
    const { i, k, from, to } = sw;
    const at = (a, b) => mix(a, b, k);
    const TOP = { x: TT.x, y: TT.y - 3 };
    p.arm = i === 0 ? k : i === 6 ? 1 - k : 1;
    p.wallMix = i < 3 ? 0 : i === 3 ? k : 1;
    if (i >= 4) p.display = to;
    if (i === 0) p.grip = { ...at(PARK, TOP), holding: false };
    if (i === 1) { p.rec = { ...at(TT, LIFTED), cover: from }; p.grip = { ...p.rec, holding: true }; }
    if (i === 5) { p.rec = { ...at(LIFTED, TT), cover: to }; p.grip = { ...p.rec, holding: true }; }
    if (i === 6) { p.rec = { ...TT, cover: to }; p.grip = { ...at(TOP, PARK), holding: false }; }
    if (!sw.back) {
      // Next song: file the record into the first slot (the rack slides along), fetch the new one from the right.
      const slide = i < 2 ? 0 : i === 2 ? k : 1;
      p.slot = (j) => rackX(j - 1 + slide);
      p.skip0 = i < 3;
      if (i === 2) { p.rec = { ...at(LIFTED, RACK0), cover: from }; p.grip = { ...p.rec, holding: true }; }
      if (i === 3) {
        p.rec = null;
        p.grip = { ...at(RACK0, FETCH), holding: false };
        p.incoming = { ...FETCH, x: lerp(FETCH.x + 22, FETCH.x, k), cover: to }; // slides in from behind the dome edge
      }
      if (i === 4) { p.rec = { ...at(FETCH, LIFTED), cover: to }; p.grip = { ...p.rec, holding: true }; }
      return;
    }
    // Previous song: the record goes back out at the right, the previous one comes out of the first slot
    // and the rack slides back to close the gap.
    const slide = i < 4 ? 0 : i === 4 ? k : 1;
    p.slot = (j) => rackX(j + 1 - slide);
    if (i < 4) p.extra = { ...RACK0, cover: to };
    if (i === 2) { p.rec = { ...at(LIFTED, FETCH), cover: from }; p.grip = { ...p.rec, holding: true }; }
    if (i === 3) {
      p.rec = null;
      p.grip = { ...at(FETCH, RACK0), holding: false };
      p.incoming = { ...FETCH, x: lerp(FETCH.x, FETCH.x + 22, k), cover: from }; // slides away behind the dome edge
    }
    if (i === 4) { p.rec = { ...at(RACK0, LIFTED), cover: to }; p.grip = { ...p.rec, holding: true }; p.extra = null; }
  },

  draw(p, S) {
    const light = glow(p.display, p.now, S.playing);
    // Body: halo, light tubes with ridges, chrome trim, red stripe, wood.
    poly(arch(ARCH.r + 4), light.halo);
    poly(arch(ARCH.r + 1), "#2a1a12");
    poly(arch(ARCH.r), light.edge);
    poly(arch(ARCH.r - 1.5), light.tube);
    poly(arch(ARCH.r - 4.5), light.core);
    poly(arch(ARCH.r - 6), light.tube);
    poly(arch(ARCH.r - 8), light.edge);
    for (let d = 184; d < 357; d += 8) { // ridges across the tube
      const a = d * Math.PI / 180;
      seg([CX + (ARCH.r - 7.5) * Math.cos(a), ARCH.y + (ARCH.r - 7.5) * Math.sin(a)], [CX + (ARCH.r - 0.5) * Math.cos(a), ARCH.y + (ARCH.r - 0.5) * Math.sin(a)], light.edge);
    }
    for (const x of [CX - ARCH.r, CX + ARCH.r - 8]) for (let y = ARCH.y + 6; y < 190; y += 8) seg([x + 0.5, y], [x + 7.5, y], light.edge);
    poly(arch(ARCH.r - 8.5), "#dfe2e7"); // chrome trim
    poly(arch(ARCH.r - 9.5), "#8b1e1e");
    poly(arch(ARCH.r - 10.5), "#c0392b");
    poly(arch(ARCH.r - 12), "#5a2f1a");
    poly(arch(ARCH.r - 13), "#7a4628");
    for (let k = 0; k < 4; k++) { // wood grain following the arch
      const r = ARCH.r - 16 - k * 3;
      for (let d = 190 + k * 7; d < 350; d += 4) px(CX + r * Math.cos(d * Math.PI / 180), ARCH.y + r * Math.sin(d * Math.PI / 180), "rgba(60,30,15,.3)");
    }
    for (let x = CX - 56; x <= CX + 56; x += 7) seg([x, 140], [x + 2, 200], "rgba(60,30,15,.35)");
    crown();
    for (const s of [-1, 1]) { // chrome clips on the side tubes
      const x = CX + s * (ARCH.r - 4) - 6;
      rect(x - 1, 110, 13, 18, "#4a4f5a");
      for (let k = 0; k < 4; k++) rect(x, 111 + k * 4, 11, 3, k % 2 ? "#c0392b" : "#dfe2e7");
      rect(x, 111, 11, 1, "#ffffff");
    }
    // Glass dome: chrome frame with rivets and a ridged base bar.
    poly(dome(DOME.r + 4), "#4a4f5a");
    poly(dome(DOME.r + 3), "#dfe2e7");
    poly(dome(DOME.r + 1.5), "#9aa0aa");
    for (let d = 186; d < 356; d += 12) px(CX + (DOME.r + 2.3) * Math.cos(d * Math.PI / 180), DOME.y + (DOME.r + 2.3) * Math.sin(d * Math.PI / 180), "#5c616b");
    poly(dome(DOME.r), "#17121f");
    g.save();
    g.beginPath();
    dome(DOME.r).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    mechanismBack(p.now, S.playing);
    // Rack carriage: chrome rail with dividers, the records standing in it.
    rect(CX - 44, RACK_Y + RACK_R - 1, 88, 3, "#5c616b");
    rect(CX - 44, RACK_Y + RACK_R - 1, 88, 1, "#dfe2e7");
    for (let x = rackX(0) - 5; x < CX + 44; x += 10) rect(x, RACK_Y + 2, 1, RACK_R - 3, "#7d838e"); // dividers
    if (p.extra) record45(p.extra.cover, p.extra);
    for (let j = SLOTS; j >= 0; j--) {
      const c = S.songs[j];
      if (!c || (j === 0 && p.skip0)) continue;
      record45(c, { x: p.slot(j), y: RACK_Y, r: RACK_R, flat: 0 });
    }
    if (p.incoming) record45(p.incoming.cover, p.incoming);
    // Turntable on a chrome plinth with a motor housing.
    rect(CX - 22, TT.y + 1, 44, 9, "#2c3038");
    rect(CX - 22, TT.y + 1, 44, 1, "#7d838e");
    for (let x = CX - 19; x < CX + 20; x += 4) rect(x, TT.y + 5, 2, 1, "#4a4f5a"); // vents
    const plat = (rx, ry, dy, c) => poly(Array.from({ length: 32 }, (_, i) => [TT.x + rx * Math.cos(i * Math.PI / 16), TT.y + dy + ry * Math.sin(i * Math.PI / 16)]), c);
    plat(17, 17 * (1 - SQUASH), 2, "#3a3e48");
    plat(17, 17 * (1 - SQUASH), 0, "#9aa0aa");
    plat(16, 16 * (1 - SQUASH), -0.5, "#c9cdd4");
    if (p.rec && p.rec.flat > 0.99) record45(p.rec.cover, p.rec, p.turn);
    toneArm(p.arm);
    if (p.rec && p.rec.flat <= 0.99) record45(p.rec.cover, p.rec);
    gripper(p.grip, p.grip.holding);
    // Glass: a curved reflection along the left and a soft glint on the right.
    for (let d = 200; d < 245; d += 2) px(CX + (DOME.r - 4) * Math.cos(d * Math.PI / 180), DOME.y + (DOME.r - 4) * Math.sin(d * Math.PI / 180), "rgba(255,255,255,.22)");
    for (let d = 205; d < 240; d += 3) px(CX + (DOME.r - 7) * Math.cos(d * Math.PI / 180), DOME.y + (DOME.r - 7) * Math.sin(d * Math.PI / 180), "rgba(255,255,255,.1)");
    g.restore();
    rect(CX - DOME.r - 4, DOME.y, DOME.r * 2 + 8, 3, "#9aa0aa"); // base bar
    rect(CX - DOME.r - 4, DOME.y, DOME.r * 2 + 8, 1, "#f4f5f7");
    for (let x = CX - DOME.r; x < CX + DOME.r; x += 3) px(x, DOME.y + 2, "#5c616b");
    // Selector panel with screws.
    rect(PANEL.x0 + 2, PANEL.y0 + 2, PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0, "rgba(0,0,0,.35)");
    rect(PANEL.x0, PANEL.y0, PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0, "#9aa0aa");
    rect(PANEL.x0 + 1, PANEL.y0 + 1, PANEL.x1 - PANEL.x0 - 2, PANEL.y1 - PANEL.y0 - 2, "#c9cdd4");
    rect(PANEL.x0 + 1, PANEL.y0 + 1, PANEL.x1 - PANEL.x0 - 2, 1, "#f4f5f7");
    for (const [x, y] of [[PANEL.x0 + 2, PANEL.y0 + 2], [PANEL.x1 - 4, PANEL.y0 + 2], [PANEL.x0 + 2, PANEL.y1 - 4], [PANEL.x1 - 4, PANEL.y1 - 4]]) {
      rect(x, y, 2, 2, "#7d838e");
      px(x, y, "#f4f5f7");
    }
    titleCard(S, p.now);
    for (const id of Object.keys(BTN)) button(id, S);
    knob(S.volume);
    grille(light, p.now, S.playing);
  },

  // Disc widget: a 45 standing upright, big center hole, cover on the label, flipping like a coin.
  widget(p, cover, fx) {
    const R = 76, cx = 80, cy = 79, img = g.createImageData(160, 160), ct = Math.cos(-p.turn), st = Math.sin(-p.turn);
    const put = (x, y, rgb) => img.data.set([...rgb, 255], (y * 160 + x) * 4);
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 160; x++) {
        const lx = (x + 0.5 - cx) / (R * fx), ly = (y + 0.5 - cy) / R, r = Math.hypot(lx, ly);
        if (r > 1 || r < 0.14) continue; // outside, or the big hole
        if (r > 0.45) {
          const a = Math.atan2(ly, lx) * 180 / Math.PI, shine = (a > -160 && a < -110) || (a > 20 && a < 70);
          put(x, y, r > 0.985 ? [60, 62, 75] : Math.round(r * 60) % 4 === 0 ? [32, 34, 44] : shine ? [70, 74, 96] : [21, 22, 29]); // grooves
          continue;
        }
        if (r < 0.2) { put(x, y, [201, 205, 212]); continue; } // adapter ring
        const tx = (lx * ct - ly * st) / 0.45, ty = (lx * st + ly * ct) / 0.45; // unspin, label space -1..1
        if (!cover) { put(x, y, [215, 219, 224]); continue; }
        const i = (Math.min(63, Math.max(0, Math.round((ty + 1) / 2 * 63))) * 64 + Math.min(63, Math.max(0, Math.round((tx + 1) / 2 * 63)))) * 4;
        put(x, y, [cover.data[i], cover.data[i + 1], cover.data[i + 2]]);
      }
    }
    g.putImageData(img, 0, 0);
  },

  hit(pt) {
    const [x, y] = pt;
    for (const [id, b] of Object.entries(BTN)) {
      if (Math.hypot(x - b.x, y - b.y) > b.r + 1) continue;
      return id === "play" ? { kind: "press", id, act: "play" } : { kind: "skip", id, forward: id === "next" };
    }
    if (Math.hypot(x - KNOB.x, y - KNOB.y) <= KNOB.r + 1) {
      return { kind: "slider", value: ([qx, qy]) => {
        const deg = (Math.atan2(qy - KNOB.y, qx - KNOB.x) * 180 / Math.PI + 360) % 360;
        return Math.min(1, Math.max(0, ((deg - 135 + 360) % 360) / 270)) * 100;
      } };
    }
    return null;
  },
};
