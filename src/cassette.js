// Cassette interface: a retro portable cassette player standing on the desk, seen from the front.
// The tape shows through the window (labelled tape, reels turning, tape moving from the top reel
// to the bottom one as the song plays), mechanical keys on top, a tape counter and a volume slider
// on the silver side strip, headphones beside it, the album's tape case and a wall rack of past albums.
import { VIEW_RIGHT, g, px, rect, lerp, ease, mix, poly, seg, cover as drawCover } from "./pixel.js";

const BODY = { x0: 66, x1: 138, y0: 64, y1: 168, side: 4 }; // front face, plus a darker right side
const STRIP = 118; // the silver strip starts here
const DOOR = { x0: 70, x1: 114, y0: 74, y1: 150 }; // the door, hinged at its left edge
const WIN = { x0: 75, x1: 109, y0: 80, y1: 140 }; // window in the door
const TAPE = { x: 77, y: 83, w: 30, h: 54 }; // cassette seen through the window (standing, reels top and bottom)
const REEL = { rMin: 4, rMax: 9 }; // tape pack radius range
const KEYS = [ // mechanical keys on top: ◀◀ silver, ▶ green, ■ orange, ▶▶ silver
  { id: "rew", x: 67, w: 12, top: "#d6dae0", ink: "#1c1d22" },
  { id: "play", x: 81, w: 15, top: "#4fb36a", ink: "#ffffff" },
  { id: "stop", x: 98, w: 12, top: "#e8892c", ink: "#ffffff" },
  { id: "ff", x: 112, w: 12, top: "#d6dae0", ink: "#1c1d22" },
];
const KEY_Y = BODY.y0 - 7, KEY_H = 7;
const COUNTER = { x: 120, y: 72 };
const SLIDER = { x: 126, y0: 116, y1: 158 };
const JACK = { x: 130, y: BODY.y0 - 3 };

// Tape case on the desk (right, under the rack) and the wall rack of past albums (right, partly out of view).
const CASE = { x: 146, y: 120, w: 30, h: 46 };
const RACK = { x: 146, y: 34, h: 30, step: 6, slots: 7 };
const rackX = (j) => RACK.x + j * RACK.step;
const OFFSTAGE = VIEW_RIGHT + 6; // where cases wait, just out of view on the right

// Small cassette drawn at any box: black shell with screws, a cream label with a stripe in the album's
// color, little written lines and an "A" mark, and a clear window strip with the two reels.
// prog: 0..1 how far the tape has moved from the top reel to the bottom one; turn: reel angle.
function tape(c, box, prog = 0, turn = 0) {
  const { x, y, w, h } = box;
  rect(x + 1, y + 1, w, h, "rgba(0,0,0,.35)");
  rect(x, y, w, h, "#1c1d22");
  rect(x, y, w, 1, "#3a3d46");
  rect(x, y, 1, h, "#2e3038");
  if (w < 8) return;
  for (const [sx, sy] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) px(sx, sy, "#6c717c"); // screws
  // Label.
  const lx = x + 3, ly = y + 4, lw = w - 6, lh = h - 8;
  rect(lx, ly, lw, lh, "#efe6cf");
  rect(lx, ly, Math.max(2, lw * 0.14), lh, c ? `rgb(${c.avg.join(",")})` : "#9aa0aa"); // album-color stripe
  const tx = lx + Math.max(3, lw * 0.2);
  for (let k = 0; k < 3; k++) { // "handwritten" title lines
    const yy = ly + 3 + k * 3;
    if (yy > y + h * 0.2) break;
    for (let xx = tx; xx < lx + lw - 2; xx += 1) if (Math.sin(xx * 1.7 + k * 3) > -0.4) px(xx, yy, "#5a5048");
  }
  px(lx + lw - 3, ly + lh - 4, "#c0392b"); // "A" side mark
  px(lx + lw - 4, ly + lh - 3, "#c0392b");
  px(lx + lw - 2, ly + lh - 3, "#c0392b");
  // Clear strip down the middle with the reels and the tape between them.
  const sx = x + w / 2, sw = Math.max(4, w * 0.4), top = y + h * 0.3, bot = y + h * 0.72;
  rect(sx - sw / 2, top - sw / 2, sw, bot - top + sw, "#2a2018");
  rect(sx - sw / 2, top - sw / 2, sw, 1, "rgba(255,255,255,.35)");
  rect(sx - sw / 2, top - sw / 2, 1, bot - top + sw, "rgba(255,255,255,.15)");
  const scale = w / TAPE.w;
  for (const [cy, amount] of [[top, 1 - prog], [bot, prog]]) {
    const r = Math.sqrt(REEL.rMin ** 2 + amount * (REEL.rMax ** 2 - REEL.rMin ** 2)) * scale * 0.5;
    const circ = (rr, n = 20) => Array.from({ length: n }, (_, i) => [sx + rr * Math.cos(i * 2 * Math.PI / n), cy + rr * Math.sin(i * 2 * Math.PI / n)]);
    poly(circ(Math.max(r, 1.5)), "#6a4426"); // tape wound on the reel
    if (r > 2.5) poly(circ(r - 1), "#5a3a22");
    poly(circ(Math.max(1.5, 2.4 * scale)), "#f4f5f7"); // hub
    for (let k = 0; k < 6; k++) { // hub teeth turning
      const a = turn + k * Math.PI / 3;
      px(sx + Math.cos(a) * 1.6 * scale, cy + Math.sin(a) * 1.6 * scale, "#1c1d22");
    }
  }
  seg([sx - 1, top], [sx - 1, bot], "rgba(106,68,38,.95)"); // the tape running between the reels
  rect(x + w * 0.25, y + h - 3, w * 0.5, 2, "#2e3038"); // bottom ridge with the tape openings
}

// Tape case: clear plastic box with the cover card in its lid. open 0..1: the lid tips toward us around its
// bottom hinge and shows the tray; `holds` is a tape { cover, box } drawn inside, between tray and lid.
function tapeCase(c, box, lift = 0, alpha = 1, open = 0, holds = null) {
  if (!c) return;
  const { x, w, h } = box, y = box.y - lift;
  g.globalAlpha = alpha;
  rect(x + 2, y + 2, w, h + open * 4, "rgba(0,0,0,.3)");
  if (open > 0.01) {
    rect(x, y, w, h, "rgba(46,50,62,.95)"); // the tray, seen into
    rect(x + 1, y + 1, w - 2, 1, "rgba(255,255,255,.3)");
    rect(x + 3, y + h - 6, w - 6, 3, "rgba(255,255,255,.12)"); // tape holder ridge
  }
  if (holds) tape(holds.cover, holds.box);
  const lidH = h * Math.cos(open * Math.PI * 0.45), top = y + h - lidH + open * 4;
  if (lidH > 1) {
    rect(x, top, w, lidH, "rgba(200,210,222,.55)");
    rect(x + 1, top + 1, w - 2, Math.max(0, lidH - 2), `rgb(${c.avg.join(",")})`);
    if (lidH > w * 0.5) g.drawImage(c.canvas, Math.round(x + 4), Math.round(top + 3), w - 6, Math.round((w - 6) * lidH / h)); // the cover card, foreshortened
    rect(x + 1, top + 1, 3, Math.max(0, lidH - 2), "rgba(30,34,44,.6)"); // spine fold
    if (open < 0.05) for (let k = 0; k < 3; k++) rect(x + 5, y + w + 2 + k * 4, w - 9, 1, "rgba(255,255,255,.55)"); // track list lines
    rect(x, top, w, 1, "rgba(255,255,255,.7)");
    if (open < 0.05) for (let k = 0; k < 8; k++) seg([x + 6 + k * 2, y + 1], [x + 1, y + 6 + k * 2], "rgba(255,255,255,.07)"); // glare
  }
  g.globalAlpha = 1;
}

// Wall rack: a wooden shelf with tape cases standing side by side, spines showing.
function rack(albums, at, extra, lift) {
  const y = RACK.y - lift;
  rect(RACK.x - 4, y + RACK.h, 60, 3, "#7a4628"); // shelf
  rect(RACK.x - 4, y + RACK.h, 60, 1, "#a8703f");
  rect(RACK.x - 4, y + RACK.h + 3, 60, 1, "rgba(0,0,0,.3)");
  rect(RACK.x - 4, y - 2, 2, RACK.h + 2, "#7a4628"); // end board
  const cases = albums.map((c, j) => ({ c, slot: at(j) }));
  if (extra) cases.push({ c: extra.cover, slot: extra.slot });
  for (const { c, slot } of cases) {
    if (!c || slot < -0.5 || slot > RACK.slots - 0.5) continue; // not in the rack right now, or pushed past its end
    const x = Math.round(rackX(slot));
    rect(x, y, RACK.step - 1, RACK.h, `rgb(${c.avg.join(",")})`);
    rect(x, y, 1, RACK.h, "rgba(255,255,255,.45)"); // clear edge
    rect(x + RACK.step - 2, y, 1, RACK.h, "rgba(0,0,0,.35)");
    rect(x + 1, y + 4, RACK.step - 3, 8, "rgba(255,255,255,.75)"); // spine label
    rect(x + 2, y + 6, 1, 4, "rgba(40,40,50,.6)");
  }
}

// Headphones standing on the left like in the reference photo: the near ear cup facing us at the
// bottom, the metal headband rising from it with its slider and arching over behind the player.
// Headphones standing to the left of the player, like the reference photo: the near ear cup turned
// toward us showing its round foam pad, a thick metal band with sliders arching up, and the far cup
// (its metal back toward us) peeking out from behind the player.
const NEAR = { x: 34, y: 148 }, FAR = { x: 60, y: 100 };
const bez = (t, p0, p1, p2, p3) => [0, 1].map((i) => (1 - t) ** 3 * p0[i] + 3 * (1 - t) ** 2 * t * p1[i] + 3 * (1 - t) * t * t * p2[i] + t ** 3 * p3[i]);
const BAND = [[NEAR.x + 1, NEAR.y - 26], [12, 40], [62, 18], [FAR.x + 1, FAR.y - 16]]; // from the near slider over to the far one
const bandAt = (t) => bez(t, ...BAND);
function headphonesBack() {
  // Far cup: metal back with a grille, smaller (further away), mostly hidden by the player.
  const ell = (cx, cy, rx, ry, n = 20) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(i * 2 * Math.PI / n), cy + ry * Math.sin(i * 2 * Math.PI / n)]);
  poly(ell(FAR.x, FAR.y, 10, 11), "#7d838e");
  poly(ell(FAR.x, FAR.y, 9, 10), "#b9bec7");
  for (let y = FAR.y - 6; y <= FAR.y + 6; y += 2) for (let x = FAR.x - 5; x <= FAR.x + 5; x += 2) if (((x - FAR.x) / 6) ** 2 + ((y - FAR.y) / 7) ** 2 < 1) px(x, y, "#7d838e");
  rect(FAR.x - 2, FAR.y - 16, 5, 7, "#9aa0aa"); // far slider
  rect(FAR.x - 1, FAR.y - 16, 3, 7, "#d6dae0");
  // Band: a flat metal strip with thickness, an edge highlight and a darker underside.
  for (let t = 0; t <= 1; t += 0.004) {
    const [x, y] = bandAt(t);
    rect(x - 2, y - 1, 4, 4, "#5c616b");
  }
  for (let t = 0; t <= 1; t += 0.004) {
    const [x, y] = bandAt(t);
    rect(x - 1, y - 1, 3, 2, "#c9cdd4");
    px(x - 1, y - 1, "#ffffff");
  }
}
function headphonesFront() {
  const { x: cx, y: cy } = NEAR;
  const ell = (rx, ry, n = 28, dx = 0, dy = 0) => Array.from({ length: n }, (_, i) => [cx + dx + rx * Math.cos(i * 2 * Math.PI / n), cy + dy + ry * Math.sin(i * 2 * Math.PI / n)]);
  // Slider and yoke from the band down to the cup.
  rect(cx - 2, cy - 28, 7, 14, "#9aa0aa");
  rect(cx - 1, cy - 28, 5, 14, "#d6dae0");
  rect(cx, cy - 26, 3, 10, "#7d838e"); // slot
  rect(cx - 1, cy - 28, 5, 1, "#ffffff");
  poly([[cx - 12, cy - 12], [cx - 2, cy - 16], [cx + 5, cy - 16], [cx + 14, cy - 12], [cx + 14, cy - 10], [cx - 12, cy - 10]], "#9aa0aa"); // yoke
  poly(ell(17, 18, 28, 3, 4), "rgba(0,0,0,.3)"); // shadow on the desk
  // Metal cup ring, then the round foam pad facing us with its foam texture and the speaker cloth in the middle.
  poly(ell(16, 17), "#7d838e");
  poly(ell(15, 16), "#c9cdd4");
  for (let d = 200; d <= 300; d += 5) px(cx + 15.5 * Math.cos(d * Math.PI / 180), cy + 16.5 * Math.sin(d * Math.PI / 180), "#ffffff");
  poly(ell(13, 14), "#2a2228");
  for (let y = cy - 13; y <= cy + 13; y++) for (let x = cx - 13; x <= cx + 13; x++) {
    const r = ((x - cx) / 13) ** 2 + ((y - cy) / 14) ** 2;
    if (r < 1 && r > 0.18 && (x + y * 3) % 4 === 0) px(x, y, "#43363e"); // foam pores
  }
  for (let d = 190; d <= 280; d += 8) px(cx + 11 * Math.cos(d * Math.PI / 180), cy + 12 * Math.sin(d * Math.PI / 180), "#55464e"); // foam catching light
  poly(ell(5.5, 6), "#4a4f5a"); // speaker cloth
  for (let y = cy - 4; y <= cy + 4; y += 2) for (let x = cx - 4; x <= cx + 4; x += 2) if (((x - cx) / 5) ** 2 + ((y - cy) / 5.5) ** 2 < 1) px(x, y, "#2c2e36");
}
// Coiled cable from the jack on top of the player up over to the far ear cup.
function cable() {
  const p0 = [JACK.x + 1, JACK.y - 5], p1 = [JACK.x + 4, 22], p2 = [FAR.x + 30, 20], p3 = [FAR.x + 6, FAR.y - 12];
  for (let t = 0; t <= 1; t += 0.006) {
    const [x, y] = bez(t, p0, p1, p2, p3);
    if (t < 0.4) { // the coiled part: little loops
      const wob = Math.sin(t * 160) * 1.6;
      px(x + wob, y, "#1a1c22");
      px(x + wob + 1, y, "#3a3d46");
    } else px(x, y, "#1a1c22");
  }
  rect(JACK.x - 1, JACK.y - 5, 4, 5, "#2c2e36"); // plug
  rect(JACK.x, JACK.y - 5, 1, 5, "#5c616b");
}

// Tape counter: mechanical digit wheels showing the song time.
const DIG = { 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 7, 1, 7], 4: [5, 5, 7, 1, 1], 5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 1, 1], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7] };
function counter(seconds) {
  const { x, y } = COUNTER, text = `${String(Math.floor(seconds / 60) % 100).padStart(2, "0")}${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  rect(x - 1, y - 1, 17, 8, "#5c616b");
  rect(x - 1, y + 6, 17, 1, "#f4f5f7");
  [...text].forEach((ch, i) => {
    const dx = x + i * 4;
    rect(dx, y, 3, 6, "#15161c");
    rect(dx, y, 3, 1, "#2c2e36");
    DIG[ch].forEach((row, r) => [4, 2, 1].forEach((bit, c) => row & bit && px(dx + c, y + 0.5 + r, "#f4f5f7")));
  });
}

// Bold icons for the keys (offsets from the key's middle).
const ICON = {
  play: [[-1, -2], [-1, -1], [0, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [-1, 2]],
  stop: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  ff: [[-3, -1], [-3, 0], [-2, 0], [-3, 1], [0, -1], [0, 0], [1, 0], [0, 1]],
  rew: [[2, -1], [2, 0], [1, 0], [2, 1], [-1, -1], [-1, 0], [-2, 0], [-1, 1]],
};
// The play key latches down as soon as it's pressed (and stop releases it at once), without waiting
// for the music app to report the change; the latch lets go when the app agrees, or after 2s.
let latch = null; // { playing, at }
function keys(S) {
  const now = performance.now();
  if (S.pressed === "play" || S.pressed === "stop") latch = { playing: S.pressed === "play", at: now };
  if (latch && !S.pressed && (S.playing === latch.playing || now - latch.at > 2000)) latch = null;
  const playDown = S.pressed ? S.pressed === "play" : latch ? latch.playing : S.playing;
  for (const k of KEYS) {
    const down = S.pressed === k.id || (k.id === "play" && playDown);
    const sink = down ? 3 : 0, y = KEY_Y + sink, h = KEY_H - sink;
    rect(k.x + 1, KEY_Y + KEY_H, k.w, 1, "rgba(0,0,0,.35)");
    rect(k.x, y + h - 2, k.w, 2, "rgba(0,0,0,.3)"); // front side of the key
    rect(k.x, y, k.w, h - 2, k.top);
    rect(k.x, y, k.w, 1, "rgba(255,255,255,.7)");
    rect(k.x + k.w - 1, y, 1, h - 2, "rgba(0,0,0,.2)");
    const cx = k.x + Math.floor(k.w / 2), cy = y + Math.floor((h - 2) / 2);
    if (h - 2 >= 3) ICON[k.id].forEach(([a, b]) => { if (cy + b >= y && cy + b < y + h - 2) px(cx + a, cy + b, k.ink); });
  }
}

function player(p, S) {
  const { x0, x1, y0, y1, side } = BODY;
  // Shadow, right side, top.
  rect(x0 + 6, y1 - 2, x1 - x0 + side, 5, "rgba(0,0,0,.3)");
  poly([[x1, y0], [x1 + side, y0 - 3], [x1 + side, y1 - 3], [x1, y1]], "#8a8f99");
  for (let y = y0 + 4; y < y1 - 4; y += 6) seg([x1 + 1, y], [x1 + side - 1, y - 2], "#7d838e"); // grip ridges on the side
  poly([[x0, y0], [x0 + side, y0 - 3], [x1 + side, y0 - 3], [x1, y0]], "#3a5aa8");
  poly([[STRIP, y0], [STRIP + side, y0 - 3], [x1 + side, y0 - 3], [x1, y0]], "#dfe2e7");
  keys(S);
  rect(JACK.x - 2, JACK.y, 6, 2, "#1a1c22"); // headphone jack
  // Front: blue body with beveled edges, brushed silver strip on the right.
  rect(x0, y0, STRIP - x0, y1 - y0, "#2f4fa8");
  rect(x0, y0, STRIP - x0, 1, "#6a88dc");
  rect(x0, y0 + 1, STRIP - x0, 1, "#4a68c0");
  rect(x0, y0, 1, y1 - y0, "#5a78d0");
  rect(x0, y1 - 2, STRIP - x0, 2, "#1a2a5a");
  rect(STRIP, y0, x1 - STRIP, y1 - y0, "#c9cdd4");
  for (let x = STRIP + 2; x < x1; x += 2) rect(x, y0 + 1, 1, y1 - y0 - 2, "rgba(255,255,255,.18)"); // brushed metal
  rect(STRIP, y0, 1, y1 - y0, "#f4f5f7");
  rect(STRIP + 1, y0, 1, y1 - y0, "#7d838e");
  rect(x1 - 1, y0, 1, y1 - y0, "#9aa0aa");
  rect(STRIP, y1 - 2, x1 - STRIP, 2, "#7d838e");
  for (const [sx, sy] of [[x0 + 3, y0 + 3], [x0 + 3, y1 - 6], [STRIP - 5, y1 - 6]]) { rect(sx, sy, 2, 2, "#1a2a5a"); px(sx, sy, "#6a88dc"); } // screws
  // Compartment behind the door, then the door itself (tilting toward us on a tape swap).
  // The compartment: dark inside with tape guides, two spindles, springs and the tape head at the bottom
  // (you mostly see it while the door is open).
  rect(DOOR.x0, DOOR.y0, DOOR.x1 - DOOR.x0, DOOR.y1 - DOOR.y0, "#1c1e26");
  rect(DOOR.x0, DOOR.y0, DOOR.x1 - DOOR.x0, 2, "#0a0b10");
  rect(DOOR.x0, DOOR.y0, 2, DOOR.y1 - DOOR.y0, "#0a0b10");
  for (const y of [TAPE.y + TAPE.h * 0.3, TAPE.y + TAPE.h * 0.72]) { // spindles
    rect(TAPE.x + TAPE.w / 2 - 2, y - 2, 4, 4, "#5c616b");
    rect(TAPE.x + TAPE.w / 2 - 1, y - 1, 2, 2, "#c9cdd4");
  }
  for (const x of [DOOR.x0 + 3, DOOR.x1 - 5]) for (let y = DOOR.y0 + 6; y < DOOR.y0 + 18; y += 2) rect(x, y, 2, 1, "#7d838e"); // springs
  rect(DOOR.x0 + 3, DOOR.y1 - 7, DOOR.x1 - DOOR.x0 - 6, 4, "#2c2e36"); // tape head and pinch roller at the bottom
  rect(DOOR.x0 + (DOOR.x1 - DOOR.x0) / 2 - 3, DOOR.y1 - 8, 6, 3, "#c9cdd4");
  rect(DOOR.x0 + 6, DOOR.y1 - 7, 3, 3, "#4a4f5a");
  if (p.inPlayer) tape(p.inPlayer, TAPE, p.prog, p.reelTurn);
  // Silver strip: counter, mic grille, a stop/eject button, volume slider with its scale.
  counter(S.position(p.now));
  for (let y = 84; y < 96; y += 2) for (let x = 121; x < 135; x += 2) px(x, y, "#7d838e");
  rect(121, 100, 14, 9, "#9aa0aa");
  rect(121, 100, 14, 8, p.door > 0.02 ? "#b9bec7" : "#e2e5ea");
  rect(121, 100, 14, 1, "#ffffff");
  rect(124, 103, 8, 1, "#7d838e");
  rect(SLIDER.x - 1, SLIDER.y0, 3, SLIDER.y1 - SLIDER.y0, "#4a4f5a");
  rect(SLIDER.x - 1, SLIDER.y0, 1, SLIDER.y1 - SLIDER.y0, "#2c2e36");
  for (let y = SLIDER.y0 + 2; y < SLIDER.y1; y += 5) rect(SLIDER.x + 4, y, 3, 1, "#7d838e");
  const ky = lerp(SLIDER.y1 - 4, SLIDER.y0, S.volume / 100);
  rect(SLIDER.x - 4, ky + 1, 9, 5, "#5c616b");
  rect(SLIDER.x - 4, ky, 9, 4, "#eef0f3");
  rect(SLIDER.x - 4, ky, 9, 1, "#ffffff");
  for (let x = SLIDER.x - 3; x < SLIDER.x + 5; x += 2) px(x, ky + 2, "#9aa0aa"); // grip ridges
  rect(x1 - 7, y1 - 9, 3, 3, "#1a1c22"); // power socket
}

// Door: blue panel with a raised frame around the window. open 0..1: it swings open toward us around a
// hinge on its left edge, getting narrower; past halfway you see its inside, reaching over the headphones.
// The window glass stays see-through, so whatever is behind it shows.
function glass(q) {
  poly(q, "rgba(140,170,230,.14)");
  const [a, b, , d] = q; // a glint across the glass
  for (let k = 0; k < 3; k++) seg([lerp(a[0], b[0], 0.2 + k * 0.08), lerp(a[1], b[1], 0.2) + 2], [lerp(a[0], b[0], 0.05 + k * 0.08), lerp(a[1], d[1], 0.3)], "rgba(255,255,255,.18)");
}
function door(open) {
  const { x0, x1, y0, y1 } = DOOR;
  if (open < 0.02) {
    rect(x0 - 1, y0 - 1, x1 - x0 + 2, 1, "#1a2a5a"); // seam
    rect(x0 - 1, y0 - 1, 1, y1 - y0 + 2, "#1a2a5a");
    rect(x1, y0 - 1, 1, y1 - y0 + 2, "#5a78d0");
    rect(x0 - 1, y1, x1 - x0 + 2, 1, "#5a78d0");
    rect(x0, y0, x1 - x0, WIN.y0 - y0, "#2f4fa8");
    rect(x0, WIN.y1, x1 - x0, y1 - WIN.y1, "#2f4fa8");
    rect(x0, WIN.y0, WIN.x0 - x0, WIN.y1 - WIN.y0, "#2f4fa8");
    rect(WIN.x1, WIN.y0, x1 - WIN.x1, WIN.y1 - WIN.y0, "#2f4fa8");
    // Raised window frame: lit top/left, dark bottom/right, then the glass with a reflection.
    rect(WIN.x0 - 2, WIN.y0 - 2, WIN.x1 - WIN.x0 + 4, 1, "#6a88dc");
    rect(WIN.x0 - 2, WIN.y0 - 2, 1, WIN.y1 - WIN.y0 + 4, "#6a88dc");
    rect(WIN.x0 - 2, WIN.y1 + 1, WIN.x1 - WIN.x0 + 4, 1, "#1a2a5a");
    rect(WIN.x1 + 1, WIN.y0 - 2, 1, WIN.y1 - WIN.y0 + 4, "#1a2a5a");
    rect(WIN.x0 - 1, WIN.y0 - 1, WIN.x1 - WIN.x0 + 2, 1, "#0a0c14"); // inner edge
    rect(WIN.x0 - 1, WIN.y0 - 1, 1, WIN.y1 - WIN.y0 + 2, "#0a0c14");
    g.fillStyle = "rgba(140,170,230,.08)";
    g.fillRect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0);
    for (let k = 0; k < 7; k++) seg([WIN.x0 + 6 + k, WIN.y0 + 1], [WIN.x0 + 1, WIN.y0 + 8 + k * 2], "rgba(255,255,255,.1)"); // glare
    // Arrow printed on the door, like the original.
    seg([x1 - 3, 112], [x1 - 3, 124], "#dfe2e7");
    seg([x1 - 5, 114], [x1 - 3, 112], "#dfe2e7");
    seg([x1 - 1, 114], [x1 - 3, 112], "#dfe2e7");
    return;
  }
  const a = open * Math.PI * 0.7, w = x1 - x0, c = Math.cos(a), grow = Math.sin(a) * 5; // the free edge comes closer: taller
  // Door panel as a quad from the hinge (h) to the free edge (f), with the window cut out of it.
  const f = x0 + w * c, top = (t) => lerp(y0, y0 - grow, t), bot = (t) => lerp(y1, y1 + grow, t);
  const at = (t, v) => [lerp(x0, f, t), lerp(top(t), bot(t), v)];
  const wl = (WIN.x0 - x0) / w, wr = (WIN.x1 - x0) / w, wt = (WIN.y0 - y0) / (y1 - y0), wb = (WIN.y1 - y0) / (y1 - y0);
  const col = c > 0 ? "#2f4fa8" : "#24386e"; // outer side, or its darker inside past halfway
  poly([at(0, 0), at(1, 0), at(1, wt), at(0, wt)], col);
  poly([at(0, wb), at(1, wb), at(1, 1), at(0, 1)], col);
  poly([at(0, wt), at(wl, wt), at(wl, wb), at(0, wb)], col);
  poly([at(wr, wt), at(1, wt), at(1, wb), at(wr, wb)], col);
  const win = [at(wl, wt), at(wr, wt), at(wr, wb), at(wl, wb)];
  glass(win);
  for (let i = 0; i < 4; i++) seg(win[i], win[(i + 1) % 4], c > 0 ? "#1a2a5a" : "#14182a"); // window frame
  seg(at(1, 0), at(1, 1), c > 0 ? "#6a88dc" : "#5a78d0"); // free edge in the light
  if (c < 0) poly([at(1, 0), [f - 2, top(1) + 1], [f - 2, bot(1) + 1], at(1, 1)], "rgba(0,0,0,.35)"); // its shadow
  rect(x0 - 1, y0, 2, y1 - y0, "#9aa0aa"); // hinge
}

// Album change, phases in seconds (~3.1s).
const SWAP = [
  0.3, //  0 the player's door and the tape case on the desk open
  0.25, // 1 the tape comes out of the player toward you
  0.35, // 2 goes over above the open case
  0.25, // 3 slides down into the case
  0.4, //  4 the case closes and goes up into the wall rack (going back: slides away to the side)
  0.4, //  5 the next album's case comes in and opens
  0.25, // 6 its tape rises out of the case
  0.35, // 7 goes over in front of the player
  0.25, // 8 slides into the player
  0.3, //  9 the door and the case close
];
const WIND = 0.6; // seconds of fast winding on a new song from the same album
const IN_CASE = { x: CASE.x + 3, y: CASE.y + 3, w: CASE.w - 6, h: CASE.h - 6 };
const ABOVE_CASE = { ...IN_CASE, y: IN_CASE.y - IN_CASE.h - 4 };
const OUT_FRONT = { x: TAPE.x - 3, y: TAPE.y - 3, w: TAPE.w + 6, h: TAPE.h + 6 }; // pulled out toward you: a bit bigger
const caseBox = { ...CASE };
const rackBox = (slot) => ({ x: rackX(slot), y: RACK.y, w: RACK.step - 1, h: RACK.h });

export default {
  id: "cassette",
  rpm: 40,
  swap: SWAP,

  pose(p, S, sw) {
    const dur = S.pos.dur || 0;
    p.prog = dur ? Math.min(1, S.position(p.now) / dur) : 0;
    p.reelTurn = p.turn;
    p.door = 0;
    p.inPlayer = S.shown;
    p.moving = null; // a tape on its way, out in the open: { cover, box }
    p.inCase = null; // a tape going into or out of the desk case: { cover, box }
    p.caseTape = null; // cover of a tape sitting inside an arriving case
    p.caseOpen = 0;
    p.flyingCase = null; // a case on its way: { cover, box }
    p.caseOnDesk = S.shown;
    p.albums = S.albums;
    p.at = (j) => j;
    p.extra = null;
    if (!sw) {
      // Same album, new song: the reels wind fast for a moment, like fast-forwarding to the next track.
      if (S.songChange !== null) {
        const t = (p.now - S.songChange) / 1000;
        if (t < WIND) p.reelTurn += Math.sin(Math.PI * t / WIND) * 14 * (S.back ? -1 : 1);
      }
      return;
    }
    const { i, k, from, to } = sw;
    const at = (a, b) => mix(a, b, k);
    const arc = (a, b, high) => { const m = at(a, b); return { ...m, y: m.y - Math.sin(Math.PI * k) * high }; };
    p.door = i === 0 ? ease(k) : i === 9 ? 1 - ease(k) : 1;
    p.caseOpen = i === 0 ? ease(k) : i <= 3 ? 1 : i === 4 ? Math.max(0, 1 - k * 3) : i === 5 ? Math.max(0, (k - 0.6) / 0.4) : i <= 8 ? 1 : 1 - ease(k);
    p.wallMix = i < 5 ? 0 : i === 5 ? k : 1;
    p.inPlayer = i === 0 ? from : i === 9 ? to : null;
    p.caseOnDesk = i <= 3 ? from : i >= 6 ? to : null;
    p.prog = i === 0 ? p.prog : 0;
    // The tape on its way: out of the player toward you, over to the case, down into it — and back for the new one.
    if (i === 1) p.moving = { cover: from, box: at(TAPE, OUT_FRONT) };
    if (i === 2) p.moving = { cover: from, box: arc(OUT_FRONT, ABOVE_CASE, 18) };
    if (i === 3) p.inCase = { cover: from, box: at(ABOVE_CASE, IN_CASE) };
    if (i === 5) p.caseTape = to; // the new case arrives with its tape inside
    if (i === 6) p.inCase = { cover: to, box: at(IN_CASE, ABOVE_CASE) };
    if (i === 7) p.moving = { cover: to, box: arc(ABOVE_CASE, OUT_FRONT, 18) };
    if (i === 8) p.moving = { cover: to, box: at(OUT_FRONT, TAPE) };
    if (sw.back && sw.history[0]) {
      // Going back: the old case slides away to the side, the previous album's case comes out of the rack.
      p.albums = sw.history.slice(1);
      p.at = (j) => j + 1 - (i < 5 ? 0 : i === 5 ? k : 1);
      if (i <= 4) p.extra = { cover: sw.history[0], slot: 0 };
      if (i === 4) p.flyingCase = { cover: from, box: { ...caseBox, x: lerp(CASE.x, OFFSTAGE, k) } };
      if (i === 5) p.flyingCase = { cover: to, box: arc(rackBox(0), caseBox, 20) };
      return;
    }
    // Next album: the closed case goes up into the first rack slot (the others shift along), the new one comes in.
    p.albums = i < 5 ? [from, ...sw.history] : sw.filed;
    if (i < 4) p.at = (j) => (j === 0 ? -99 : j - 1); // the old case is still on the desk
    if (i === 4) {
      p.at = (j) => (j === 0 ? -99 : j - 1 + k);
      p.flyingCase = { cover: from, box: arc(caseBox, rackBox(0), 26) };
    }
    if (i === 5) p.flyingCase = { cover: to, box: { ...caseBox, x: lerp(OFFSTAGE, CASE.x, ease(Math.min(1, k * 1.4))) } };
  },

  draw(p, S) {
    const lift = (what) => (S.hover === what && !p.sw ? 2 : 0);
    rack(p.albums, p.at, p.extra, lift("stand"));
    headphonesBack();
    player(p, S);
    cable();
    headphonesFront();
    door(p.door); // after the headphones: it swings open over them
    const inside = p.inCase || (p.caseTape && { cover: p.caseTape, box: IN_CASE });
    tapeCase(p.caseOnDesk, CASE, lift("album"), 1, p.caseOpen, p.caseOnDesk ? inside : null);
    if (p.flyingCase) {
      const b = p.flyingCase.box, open = p.sw && p.sw.i === 5 ? p.caseOpen : 0;
      if (b.w > 8) tapeCase(p.flyingCase.cover, b, 0, 1, open, open > 0 && p.caseTape ? { cover: p.caseTape, box: { ...IN_CASE, x: b.x + 3, y: b.y + 3 } } : null);
      else rect(b.x, b.y, b.w, b.h, `rgb(${p.flyingCase.cover.avg.join(",")})`);
    }
    if (p.moving) tape(p.moving.cover, p.moving.box, 0, 0);
  },

  // Disc widget: the cassette itself, lying sideways, flipping like a coin on an album change.
  widget(p, cover, fx) {
    const w = 150 * fx, h = 96, x = 80 - w / 2, y = 32;
    rect(x, y, w, h, "#2a2c33");
    rect(x, y, w, 2, "#4a4f5a");
    if (w < 20) return;
    // Cream label with a stripe in the album's color and a few written lines.
    const lw = w - 12, lh = 56;
    rect(x + 6, y + 6, lw, lh, "#efe6cf");
    rect(x + 6, y + 6, lw, 8 * Math.min(1, fx * 2), cover ? `rgb(${cover.avg.join(",")})` : "#9aa0aa");
    for (let k = 0; k < 2; k++) for (let xx = x + 14; xx < x + w - 14; xx++) if (Math.sin(xx * 0.9 + k * 2) > -0.3) px(xx, y + 19 + k * 5, "#5a5048");
    rect(x + w - 16, y + 18, 4, 5, "#c0392b"); // "A" side
    // Clear strip with the two reels, side by side.
    const sy = y + 34, sh = 20;
    rect(x + w * 0.22, sy, w * 0.56, sh, "rgba(40,30,25,.92)");
    for (const [cx, amount] of [[x + w * 0.32, 0.6], [x + w * 0.68, 0.4]]) {
      const r = (4 + amount * 6) * fx;
      const circ = (rr, n = 24) => Array.from({ length: n }, (_, i) => [cx + rr * Math.cos(i * 2 * Math.PI / n), sy + sh / 2 + rr * Math.sin(i * 2 * Math.PI / n)]);
      poly(circ(Math.max(1, r * 1.4)), "#5a3a22");
      poly(circ(Math.max(1, 5 * fx)), "#e8eaee");
      for (let k = 0; k < 6; k++) {
        const a = p.turn + k * Math.PI / 3;
        px(cx + Math.cos(a) * 3.5 * fx, sy + sh / 2 + Math.sin(a) * 3.5, "#2a2c33");
      }
    }
    // Screws and the bottom ridge, like a real cassette.
    for (const [sx, sy2] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) rect(sx, sy2, 2, 2, "#7d838e");
    rect(x + w * 0.2, y + h - 12, w * 0.6, 10, "#33353d");
  },

  hit(pt, S) {
    const [x, y] = pt;
    for (const k of KEYS) {
      if (x < k.x || x > k.x + k.w || y < KEY_Y - 1 || y > KEY_Y + KEY_H + 1) continue;
      if (k.id === "play") return S.playing ? null : { kind: "press", id: "play", act: "play" };
      if (k.id === "stop") return S.playing ? { kind: "press", id: "stop", act: "play" } : null;
      return { kind: "search", id: k.id, forward: k.id === "ff" };
    }
    if (x >= SLIDER.x - 5 && x <= SLIDER.x + 6 && y >= SLIDER.y0 - 2 && y <= SLIDER.y1 + 2) {
      return { kind: "slider", value: ([, qy]) => Math.min(100, Math.max(0, (SLIDER.y1 - 4 - qy) / (SLIDER.y1 - 4 - SLIDER.y0) * 100)) };
    }
    if (x >= CASE.x && x <= CASE.x + CASE.w && y >= CASE.y && y <= CASE.y + CASE.h) return { kind: "skip", forward: true, hover: "album" };
    if (x >= RACK.x - 4 && y >= RACK.y - 2 && y <= RACK.y + RACK.h + 3) return { kind: "skip", forward: false, hover: "stand" };
    return null;
  },
};
