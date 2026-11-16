const g = document.getElementById("scene").getContext("2d");

// Everything is drawn in whole pixels on a 160×160 canvas, CSS scales it up crisp.
// Seen from the front-left and above, like the reference picture. Light from the top left.
const SLEEVE = 76; // sleeve size, also the cover sample size
const REC = { x: 64, y: 118 }; // record center
const TILT = -0.15; // ovals lean: right side higher, as seen from the left
const SQUASH = 0.5; // circle height / width when lying flat
const DEFAULT_WALL = { h: 196, s: 39, l: 47 };

const tone = (w, k = 1) => `hsl(${w.h},${w.s}%,${w.l * k}%)`;
const px = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

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

// Flat circle of radius a seen in perspective: a tilted oval, filled row by row.
function oval(cx, cy, a, c) {
  const b = a * SQUASH, cs = Math.cos(TILT), sn = Math.sin(TILT);
  const A = cs * cs / (a * a) + sn * sn / (b * b);
  const B = 2 * sn * cs * (1 / (a * a) - 1 / (b * b));
  const C = sn * sn / (a * a) + cs * cs / (b * b);
  g.fillStyle = c;
  for (let y = -Math.ceil(a); y <= Math.ceil(a); y++) {
    const d = B * B * y * y - 4 * A * (C * y * y - 1);
    if (d < 0) continue;
    const l = Math.round(cx + (-B * y - Math.sqrt(d)) / (2 * A));
    const r = Math.round(cx + (-B * y + Math.sqrt(d)) / (2 * A));
    g.fillRect(l, cy + y, r - l + 1, 1);
  }
}

// Point on that oval; angle 90° is the side nearest the viewer.
function onOval(cx, cy, a, deg) {
  const t = deg * Math.PI / 180, x = a * Math.cos(t), y = a * SQUASH * Math.sin(t);
  return [cx + x * Math.cos(TILT) - y * Math.sin(TILT), cy + x * Math.sin(TILT) + y * Math.cos(TILT)];
}
function ring(cx, cy, a, from, to, step, c) {
  for (let d = from; d <= to; d += step) px(...onOval(cx, cy, a, d), c);
}

// Rings further in sit slightly further back: cheap perspective.
const back = (a) => REC.y - 4 * (1 - a / 52);

function line(x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
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

// Cover mapped onto the tilted label; `turn` (radians) is for spinning later.
function label(cover, turn) {
  const a = 17, cx = REC.x, cy = Math.round(back(a));
  const cs = Math.cos(TILT), sn = Math.sin(TILT), ct = Math.cos(turn), st = Math.sin(turn);
  for (let y = -a; y <= a; y++) {
    for (let x = -a; x <= a; x++) {
      // Undo the tilt and squash to get back to the flat cover, then spin.
      const fx = x * cs + y * sn, fy = (-x * sn + y * cs) / SQUASH;
      if (fx * fx + fy * fy > a * a) continue;
      const u = Math.round(((fx * ct - fy * st) / a * 0.5 + 0.5) * (SLEEVE - 1));
      const v = Math.round(((fx * st + fy * ct) / a * 0.5 + 0.5) * (SLEEVE - 1));
      let c = "#d7dbe0";
      if (cover && u >= 0 && v >= 0 && u < SLEEVE && v < SLEEVE) {
        const i = (v * SLEEVE + u) * 4;
        c = `rgb(${cover.data[i]},${cover.data[i + 1]},${cover.data[i + 2]})`;
      }
      px(cx + x, cy + y, c);
    }
  }
  rect(cx - 1, cy - 1, 2, 2, "#9aa0aa"); // spindle
  px(cx - 1, cy - 1, "#f4f5f7");
}

// turn: label angle (radians). drift: strobe dot offset (degrees). shine: 0..1 flicker while spinning.
function draw(cover, turn, drift, shine) {
  const wall = cover ? cover.wall : DEFAULT_WALL;
  rect(0, 0, 160, 160, tone(wall));
  rect(0, 84, 160, 76, tone(wall, 0.5)); // desk
  rect(0, 84, 160, 1, tone(wall, 0.7)); // desk edge catching light

  if (cover) {
    rect(75, 11, SLEEVE, SLEEVE - 3, tone(wall, 0.65)); // shadow on the wall
    g.drawImage(cover.canvas, 72, 8);
    rect(72, 8, SLEEVE, 1, "rgba(255,255,255,.35)"); // lit top edge
    rect(72, 8, 1, SLEEVE, "rgba(255,255,255,.2)");
    rect(72 + SLEEVE - 3, 8, 3, SLEEVE, "rgba(0,0,0,.18)"); // shaded right side
  }

  // Deck: back-left corner at (20,90), runs off the bottom-left; we see its top, left side and front.
  const A = [20, 90], B = [150, 92], Cc = [164, 151], D = [-42, 151];
  poly([[B[0] + 2, B[1] - 2], [Cc[0] + 2, Cc[1] - 2], Cc, B], "rgba(0,0,0,.3)"); // shadow on the desk
  poly([A, D, [D[0], D[1] + 7], [A[0], A[1] + 7]], "#6c717c"); // left side
  poly([A, B, Cc, D], "#b8bcc4"); // top
  line(A[0], A[1], B[0], B[1], "#e8eaee");
  line(A[0], A[1], 0, 110, "#dfe2e7");
  poly([D, Cc, [Cc[0], 158], [D[0], 158]], "#7d838e"); // front
  rect(0, 151, 160, 1, "#d2d5db");
  rect(0, 158, 160, 2, "#4a4f5a");

  // Platter: side band (with strobe dots) shows at the front, silver top rim, dark gap.
  oval(REC.x, REC.y + 5, 58, "#2c3038");
  for (let k = 1; k <= 4; k++) ring(REC.x, REC.y + k, 58, 15 + drift, 175, 4, k % 2 ? "#8a8f99" : "#5c616b");
  for (let k = 2; k <= 4; k += 2) ring(REC.x, REC.y + k, 58, 17 + drift, 177, 4, "#c9cdd4");
  oval(REC.x, REC.y, 58, "#a3a9b3");
  ring(REC.x, REC.y, 58, 190, 300, 2, "#e2e5ea"); // lit back edge
  oval(REC.x, REC.y, 55, "#2a2e36");

  // Record: thickness, top, lit rim, grooves, fixed shine.
  oval(REC.x, REC.y + 1, 52, "#07080e");
  oval(REC.x, REC.y, 52, "#191c2c");
  ring(REC.x, REC.y, 52, 190, 280, 1, "#7a82a4");
  for (const a of [46, 40, 34, 28]) ring(REC.x, back(a), a, 0, 359, 1, "#232741");
  const wob = Math.round(shine * 3); // shine streaks shift a few degrees while spinning
  for (const a of [41, 44, 47]) {
    ring(REC.x, back(a), a, 205 + wob, 245 - wob, 2, shine > 0.5 ? "#9aa0c0" : "#8a90b0");
    ring(REC.x, back(a), a, 25 - wob, 65 + wob, 2, "#4a5070");
  }
  oval(REC.x, Math.round(back(19)), 19, "#11131f"); // run-out ring
  label(cover, -turn); // minus: clockwise on screen, like a real record

  // Start/stop button and speed buttons at the front-left corner, 45 adapter well at the back.
  oval(26, 97, 5, "#2c3038");
  oval(26, 96, 3, "#4a4f5a");
  poly([[2, 141], [16, 140], [16, 146], [2, 147]], "#5c616b");
  poly([[2, 139], [16, 138], [16, 144], [2, 145]], "#dfe2e7");
  line(2, 139, 16, 138, "#ffffff");

  // Pitch slider runs along the right edge.
  for (let i = 0; i < 8; i++) rect(141 + i * 1.1 | 0, 108 + i * 4, 2, 1, "#6c717c");
  poly([[145, 106], [148, 106], [154, 140], [151, 140]], "#3a3e48");
  poly([[147, 122], [154, 121], [155, 125], [148, 126]], "#5c616b");
  poly([[147, 120], [154, 119], [155, 123], [148, 124]], "#eef0f3");

  // Tonearm: shadow first, then pivot base, counterweight, arm, headshell.
  line(134, 100, 85, 125, "rgba(0,0,0,.35)");
  oval(132, 102, 11, "#3a3e48");
  oval(132, 99, 11, "#8a8f99");
  oval(132, 98, 6, "#5c616b");
  oval(132, 96, 6, "#d6dae0");
  poly([[134, 86], [142, 82], [145, 89], [137, 93]], "#3a3e48"); // counterweight
  line(134, 86, 142, 82, "#9aa0aa");
  line(131, 95, 82, 120, "#6c717c");
  line(131, 94, 82, 119, "#f4f5f7");
  poly([[75, 118], [84, 116], [86, 120], [77, 122]], "#cfd2d8"); // headshell
  line(75, 118, 84, 116, "#ffffff");
  rect(77, 122, 3, 2, "#3fae6a");
}

const RPM = 100 / 3; // 33⅓
const EASE = 1; // seconds to stop on pause / reach full speed on play

let coverUrl = null;
let cover = null;
let playing = false;
let speed = 0; // 0 stopped .. 1 full speed
let turn = 0;
let last = 0;
let running = false;

const frame = (now) => draw(cover, turn, (turn * 180 / Math.PI * 0.05) % 4, speed * (0.5 + 0.5 * Math.sin(now / 80)));

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  speed += Math.max(-dt / EASE, Math.min(dt / EASE, (playing ? 1 : 0) - speed));
  turn += speed * dt * 2 * Math.PI * RPM / 60;
  frame(now);
  // Stop the loop once the record stands still, so a paused app uses no CPU.
  if (playing || speed > 0) requestAnimationFrame(tick);
  else running = false;
}

async function show(t) {
  playing = !!t?.playing;
  const url = t?.artwork_url || null;
  if (url !== coverUrl) {
    coverUrl = url;
    cover = url ? await loadCover(url).catch(() => null) : null;
  }
  frame(performance.now());
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
}

frame(0);
window.__TAURI__.event.listen("track", (e) => show(e.payload));
window.__TAURI__.core.invoke("current_track").then(show);
