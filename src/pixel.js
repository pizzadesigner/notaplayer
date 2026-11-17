// Shared pixel drawing: everything is drawn in whole pixels so CSS can scale it up crisp.
// The scene is laid out on a 200×200 grid; the 160×160 canvas shows the VIEW part of it.
export const W = 200;
export const VIEW = { x: 22, y: 24 }; // top-left of the visible 160×160 part
export const VIEW_RIGHT = VIEW.x + 160;
export const DESK_Y = 100; // where wall meets desk
export const SLEEVE = 64; // cover sample size (and vinyl sleeve size)

export const g = document.getElementById("scene").getContext("2d");
g.imageSmoothingEnabled = false;

export const tone = (w, k = 1) => `hsl(${w.h},${w.s}%,${w.l * k}%)`;
export const px = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
export const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
export const lerp = (a, b, k) => a + (b - a) * k;
export const ease = (k) => k * k * (3 - 2 * k);
export const add = ([x, y], [dx, dy]) => [x + dx, y + dy];
export const mix = (a, b, k) => Object.fromEntries(Object.keys(a).map((n) => [n, lerp(a[n], b[n], k)]));

// Convex polygon, filled row by row so edges stay hard pixels.
export function poly(pts, c) {
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

export function line(x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
}
export const seg = (a, b, c) => line(a[0], a[1], b[0], b[1], c);

export function clipTo(x, y, w, h) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
}

// Map the unit square onto four corners (projective transform).
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

// Perspective grid for one device: a flat top (u to the right, v toward the viewer, in device units,
// height h up from the top) mapped to the screen through its four corners, so everything shrinks
// toward the back consistently. corners: back-left, back-right, front-right, front-left.
export function perspective(U, V, corners, height) {
  const H = homography(...corners);
  const P = (u, v, h = 0) => {
    const [x, y] = H(u / U, v / V);
    const [x1, y1] = H((u + 1) / U, v / V);
    return [x, y - h * height * Math.hypot(x1 - x, y1 - y)];
  };
  // Circle lying on the plane. Angle 90° is the side nearest the viewer.
  const circle = (u, v, r, h, n = 48) =>
    Array.from({ length: n }, (_, i) => P(u + r * Math.cos(i * 2 * Math.PI / n), v + r * Math.sin(i * 2 * Math.PI / n), h));
  const disc = (u, v, r, h, c) => poly(circle(u, v, r, h), c);
  const arcDots = (u, v, r, h, from, to, step, c) => {
    for (let d = from; d <= to; d += step) px(...P(u + r * Math.cos(d * Math.PI / 180), v + r * Math.sin(d * Math.PI / 180), h), c);
  };
  // Upright cylinder from height h0 to h1.
  const cyl = (u, v, r, h0, h1, side, top) => {
    for (let h = h0; h < h1; h++) disc(u, v, r, h, side);
    disc(u, v, r, h1, top);
  };
  // Raised button: back-left corner (u, v), size w × d, height h, in a dark recess.
  const box = (u, v, w, d, h, top, recess = "#6c717c") => {
    poly([P(u - 1, v - 1), P(u + w + 1, v - 1), P(u + w + 1, v + d + 1), P(u - 1, v + d + 1)], recess);
    poly([P(u, v + d), P(u + w, v + d), P(u + w, v + d, h), P(u, v + d, h)], "#5c616b"); // front side
    poly([P(u, v, h), P(u + w, v, h), P(u + w, v + d, h), P(u, v + d, h)], top);
    seg(P(u, v, h), P(u + w, v, h), "#ffffff"); // lit back edge
  };
  // Screen bounding box of a flat rectangle, for click tests.
  const hitRect = (u, v, w, d, h, [x, y]) => {
    const pts = [P(u, v, h), P(u + w, v, h), P(u + w, v + d), P(u, v + d)];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    return x >= Math.min(...xs) - 1 && x <= Math.max(...xs) + 1 && y >= Math.min(...ys) - 1 && y <= Math.max(...ys) + 1;
  };
  return { P, circle, disc, arcDots, cyl, box, hitRect };
}

// Cover texture drawn at any size (nearest pixel), with optional shade and fade.
export function cover(c, x, y, size, dark = 0, alpha = 1) {
  if (!c) return;
  g.globalAlpha = alpha;
  g.drawImage(c.canvas, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  if (dark) rect(x, y, size, size, `rgba(0,0,0,${dark})`);
  g.globalAlpha = 1;
}

// Cover color at texture position (u, v in 0..1), as a CSS color.
export function texel(c, u, v, fallback = "#d7dbe0") {
  if (!c) return fallback;
  const i = (Math.min(SLEEVE - 1, Math.max(0, Math.round(v * (SLEEVE - 1)))) * SLEEVE + Math.min(SLEEVE - 1, Math.max(0, Math.round(u * (SLEEVE - 1))))) * 4;
  return `rgb(${c.data[i]},${c.data[i + 1]},${c.data[i + 2]})`;
}

export function spindle(x, y) {
  rect(x - 1, y - 2, 2, 2, "#9aa0aa");
  px(x - 1, y - 2, "#f4f5f7");
}
