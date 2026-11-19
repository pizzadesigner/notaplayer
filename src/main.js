// notaplayer: follows what's playing and shows it on a pixel-art device. The devices ("interfaces")
// live in their own files (vinyl.js, cd.js); this file keeps the music state, the timing, the looks
// (window / scene widget / disc widget), the menus and the mouse handling they share.
import { W, VIEW, SLEEVE, DESK_Y, g, tone, rect, lerp, ease, clipTo } from "./pixel.js";
import vinyl from "./vinyl.js";
import cd from "./cd.js";

const IFACES = { vinyl, cd };
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let iface = IFACES[load("interface", "vinyl")] ?? vinyl;

const DEFAULT_WALL = { h: 196, s: 39, l: 47 };
const EASE = 1; // seconds to stop on pause / reach full speed on play
const PAUSE_EASE = 0.3; // seconds for the paused look (vinyl arm lifting) to come in
const FLIP = 0.8; // seconds, coin flip of the disc widget on an album change
const SEARCH_STEP = 4, SEARCH_EVERY = 250; // holding ◀◀/▶▶: jump 4 s every 250 ms
const HOLD_DELAY = 400; // ms before a held button starts repeating
const SONGS_KEPT = 16, ALBUMS_KEPT = 3;

// Everything the interfaces read.
const S = {
  shown: undefined, // cover on the device (undefined until the first track arrives)
  next: null, // newest cover from the player
  songCover: undefined, // cover of the song playing now
  albums: [], // past album covers, newest first (vinyl stand)
  songs: [], // past song covers, newest first (CD wheel)
  songCount: 0, // how many songs have gone by (keeps the CD wheel's blank cases in step as it turns)
  playing: false,
  speed: 0, // 0 stopped .. 1 full speed
  turn: 0, // disc angle in radians
  paused: 1, // 0 playing .. 1 paused, eased
  search: 0, // -1 / 1 while holding ◀◀ / ▶▶
  volume: 100,
  trackNo: 0,
  pos: { sec: 0, dur: 0, at: 0 },
  position(now) {
    const s = this.pos.sec + (this.playing ? (now - this.pos.at) / 1000 : 0);
    return Math.max(0, this.pos.dur ? Math.min(s, this.pos.dur) : s);
  },
  songChange: null, // time of the last song change (vinyl arm hop, CD wheel turn)
  swapping: false,
  mode: "window", // "window", "scene" (whole scene as a small widget) or "disc" (only the disc, see-through)
  pressed: null, // id of the button held down
  hover: null, // "album" or "stand" under the mouse
  dragging: false, // dragging the volume slider
};

let nextKey, trackId, last = 0, running = false;
let swap = null; // { start, from, to, albums } while an album change plays

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
const wallOf = (c) => (c ? c.wall : DEFAULT_WALL);

// Shrink the cover to sample size and cut it to 8 levels per channel.
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
  const avg = sum.map((s) => s / (d.data.length / 4));
  return { canvas: c, data: d.data, wall: wallFrom(avg), avg: avg.map(Math.round) };
}

// Placeholder for songs without a usable cover (browsers, some Windows players): black with a gray pixel
// music note. Each album gets its own copy, so changing albums still plays the swap.
const NOTE = ["....xxxx", "...xxxxx", "...xx..x", "...x...x", "...x...x", "...x...x", "...x...x", ".xxx.xxx", "xxxx.xxx", ".xx...x."];
const PLACEHOLDER = (() => {
  const c = new OffscreenCanvas(SLEEVE, SLEEVE), x = c.getContext("2d");
  x.fillStyle = "#141519";
  x.fillRect(0, 0, SLEEVE, SLEEVE);
  const k = 2, ox = (SLEEVE - 8 * k) / 2, oy = (SLEEVE - NOTE.length * k) / 2; // note drawn 2× so it stays visible small
  x.fillStyle = "#5c616b";
  NOTE.forEach((row, y) => [...row].forEach((ch, i) => ch === "x" && x.fillRect(ox + i * k, oy + y * k, k, k)));
  return { canvas: c, data: x.getImageData(0, 0, SLEEVE, SLEEVE).data, wall: DEFAULT_WALL, avg: [20, 21, 25] };
})();
const placeholder = () => ({ ...PLACEHOLDER });

const filed = (from, list) => (from ? [from, ...list] : list).slice(0, ALBUMS_KEPT);
const swapLength = () => (S.mode === "disc" ? FLIP : iface.swap.reduce((a, b) => a + b));

// Where everything is at time `now`. The interface fills in its own parts.
function pose(now) {
  const p = { now, turn: S.turn, shine: S.speed * (0.5 + 0.5 * Math.sin(now / 80)), display: S.shown, wallMix: 0, sw: null };
  if (swap) {
    let t = (now - swap.start) / 1000, i = 0;
    const ph = iface.swap;
    while (i < ph.length - 1 && t > ph[i]) t -= ph[i++];
    p.sw = { i, k: ease(Math.min(t / ph[i], 1)), from: swap.from, to: swap.to, history: swap.albums, filed: filed(swap.from, swap.albums) };
    p.flip = { k: Math.min((now - swap.start) / 1000 / FLIP, 1), from: swap.from, to: swap.to };
  }
  iface.pose(p, S, p.sw);
  p.wall = p.sw ? mixWall(wallOf(swap.from), wallOf(swap.to), p.wallMix) : wallOf(S.shown);
  return p;
}

function draw(p) {
  if (S.mode === "disc") {
    g.clearRect(0, 0, 160, 160);
    let cover = S.shown, fx = 1;
    if (p.flip) {
      cover = p.flip.k < 0.5 ? p.flip.from : p.flip.to; // new label shows once it turns past edge-on
      fx = Math.max(Math.abs(Math.cos(Math.PI * ease(p.flip.k))), 0.04);
    }
    iface.widget(p, cover, fx);
    return;
  }
  g.save();
  g.translate(-VIEW.x, -VIEW.y);
  rect(0, 0, W, W, tone(p.wall));
  rect(0, DESK_Y, W, W - DESK_Y, tone(p.wall, 0.5)); // desk
  rect(0, DESK_Y, W, 1, tone(p.wall, 0.7)); // desk edge catching light
  iface.draw(p, S);
  if (showName) nameStrip(p.now);
  g.restore();
}
const redraw = () => { if (!running) draw(pose(performance.now())); };

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (swap && now - swap.start > swapLength() * 1000) {
    S.albums = filed(swap.from, swap.albums);
    S.shown = swap.to;
    swap = null;
    S.swapping = false;
    if (S.next !== S.shown) startSwap(now); // album changed again mid-swap
  }
  if (S.songChange !== null && now - S.songChange > 1600) S.songChange = null; // longest song-change animation (CD wheel)
  const target = S.playing && !swap ? 1 : 0; // the disc stops while being swapped
  S.speed += Math.max(-dt / EASE, Math.min(dt / EASE, target - S.speed));
  if (!grab) S.turn += (S.speed * 2 * Math.PI * iface.rpm / 60 + S.search * 10) * dt; // a held record follows the hand
  const pausedTarget = S.playing ? 0 : 1;
  S.paused += Math.max(-dt / PAUSE_EASE, Math.min(dt / PAUSE_EASE, pausedTarget - S.paused));
  draw(pose(now));
  // Stop the loop once nothing moves, so a paused app uses no CPU.
  if (S.playing || S.speed > 0 || swap || S.songChange !== null || S.paused !== pausedTarget || S.search || nameScrolls()) requestAnimationFrame(tick);
  else running = false;
}
setInterval(redraw, 500); // slow clock for things that change while idle (blinking LCD)

function startSwap(now) {
  swap = { start: now, from: S.shown, to: S.next, albums: S.albums };
  S.swapping = true;
}

function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}

async function show(t) {
  const now = performance.now();
  S.playing = !!t?.playing;
  setName(t ? `${t.name} — ${t.artist}` : "");
  if (t && !S.dragging) S.volume = t.volume;
  if (t) {
    S.trackNo = t.number;
    S.pos = { sec: t.position, dur: t.duration, at: now };
  }
  const url = t?.artwork_url || null;
  // What decides a new album: the cover picture, or without one the album name and artist.
  const key = !t ? null : url || `no-cover:${t.album}|${t.artist}`;
  const id = t?.id ?? null;
  if (id !== trackId && trackId !== undefined) {
    if (S.songCover !== undefined) S.songs = [S.songCover, ...S.songs].slice(0, SONGS_KEPT); // the song that just ended
    S.songCount++;
    S.songChange = now;
  }
  trackId = id;
  if (key !== nextKey) {
    nextKey = key;
    const c = !t ? null : url ? await loadCover(url).catch(placeholder) : placeholder();
    if (nextKey !== key) return; // a newer track arrived while loading
    S.next = c;
    S.songCover = c;
    if (S.shown === undefined) S.shown = c; // first track: just show it
    else if (!swap) startSwap(performance.now());
  } else if (S.songCover === undefined) {
    S.songCover = S.next;
  }
  redraw();
  wake();
}

// Interface switch from the menu: finish a running album change at once, then redraw with the new device.
function setInterface(id) {
  if (!IFACES[id]) return;
  if (swap) {
    S.albums = filed(swap.from, swap.albums);
    S.shown = swap.to;
    swap = null;
    S.swapping = false;
  }
  iface = IFACES[id];
  save("interface", id);
  window.__TAURI__.core.invoke("interface_checked", { id }).catch(() => {});
  redraw();
  wake();
}
window.__TAURI__.event.listen("interface", (e) => setInterface(e.payload));
window.__TAURI__.core.invoke("interface_checked", { id: iface.id }).catch(() => {});

// Three looks: the normal window and two 200×200 widgets that sit on the desktop.
// Double-click cycles window → scene → disc → window. Window and widgets each remember their position.
const MODES = ["window", "scene", "disc"];
const win = window.__TAURI__.window.getCurrentWindow();
const { LogicalSize, PhysicalPosition } = window.__TAURI__.dpi;
const posKey = (m) => "pos-" + (m === "window" ? "window" : "widget");
const savedPos = (m) => { try { return JSON.parse(localStorage.getItem(posKey(m))); } catch { return null; } };
async function setMode(m) {
  if (m === S.mode || !MODES.includes(m)) return;
  const wasWindow = S.mode === "window", toWindow = m === "window";
  save(posKey(S.mode), JSON.stringify(await win.outerPosition()));
  S.mode = m;
  S.hover = null;
  document.body.classList.toggle("widget", !toWindow);
  document.body.dataset.mode = m; // scene widget gets rounded corners (CSS)
  if (wasWindow !== toWindow) {
    await win.setDecorations(toWindow);
    await win.setShadow(toWindow);
    await win.setResizable(toWindow);
    await win.setAlwaysOnBottom(!toWindow); // widgets sit on the desktop, behind normal windows
    await win.setSize(new LogicalSize(toWindow ? 480 : 200, toWindow ? 480 : 200));
    const pos = savedPos(m);
    if (pos) await win.setPosition(new PhysicalPosition(pos.x, pos.y));
  }
  redraw();
}
window.__TAURI__.event.listen("mode", (e) => setMode(e.payload));
const scene = document.getElementById("scene");
const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args).catch(() => {});

// Volume: sends at most one change at a time to the player, always ending with the latest value.
let volWant = null, volBusy = false;
async function setVolume(v) {
  S.volume = Math.min(100, Math.max(0, v));
  volWant = Math.round(S.volume);
  redraw();
  if (volBusy) return;
  volBusy = true;
  while (volWant !== null) {
    const send = volWant;
    volWant = null;
    await invoke("set_volume", { volume: send });
  }
  volBusy = false;
}
function seek(seconds) {
  invoke("seek_by", { seconds });
  S.pos.sec += seconds; // the LCD follows right away
}
// Mouse position in scene pixels.
function scenePoint(e) {
  const r = scene.getBoundingClientRect(), k = Math.min(r.width, r.height) / 160;
  return [(e.clientX - r.left - (r.width - 160 * k) / 2) / k + VIEW.x, (e.clientY - r.top - (r.height - 160 * k) / 2) / k + VIEW.y];
}
const controlAt = (pt) => (S.mode === "disc" ? null : iface.hit(pt, S));

// What a press on a control does. The interfaces only say what is where (see their hit()).
let act = null; // the control being held: { kind, ... }
let grab = null; // vinyl: { angle, seconds } while the record is held
const SEEK_PER_TURN = 30;
scene.addEventListener("mousedown", (e) => {
  const pt = scenePoint(e), h = controlAt(pt);
  if (!h) {
    if (S.mode !== "window" && e.detail === 1) win.startDragging(); // widgets have no title bar to drag by
    return;
  }
  act = h;
  if (h.kind === "press") {
    S.pressed = h.id;
    invoke("play_pause");
  } else if (h.kind === "skip") {
    invoke("skip", { forward: h.forward });
  } else if (h.kind === "slider") {
    S.dragging = true;
    setVolume(h.value(pt));
  } else if (h.kind === "grab") {
    grab = { angle: h.angle(pt), seconds: 0 };
    scene.style.cursor = "grabbing";
  } else if (h.kind === "search") {
    // Click = previous/next song, hold = wind through the song.
    S.pressed = h.id;
    h.timer = setTimeout(() => {
      h.searching = true;
      S.search = h.forward ? 1 : -1;
      seek(h.forward ? SEARCH_STEP : -SEARCH_STEP);
      h.every = setInterval(() => seek(h.forward ? SEARCH_STEP : -SEARCH_STEP), SEARCH_EVERY);
      wake();
    }, HOLD_DELAY);
  } else if (h.kind === "volume") {
    S.pressed = h.id;
    setVolume(S.volume + h.step);
    h.timer = setTimeout(() => { h.every = setInterval(() => setVolume(S.volume + h.step), 120); }, HOLD_DELAY);
  }
  redraw();
});
window.addEventListener("mousemove", (e) => {
  if (act?.kind === "slider") setVolume(act.value(scenePoint(e)));
  if (act?.kind === "grab" && grab) {
    const a = act.angle(scenePoint(e));
    const d = Math.atan2(Math.sin(a - grab.angle), Math.cos(a - grab.angle)); // shortest way round
    grab.angle = a;
    grab.seconds += d / (2 * Math.PI) * SEEK_PER_TURN;
    S.turn += d;
    redraw();
  }
});
window.addEventListener("mouseup", () => {
  if (!act) return;
  const h = act;
  act = null;
  clearTimeout(h.timer);
  clearInterval(h.every);
  if (h.kind === "grab" && grab) {
    if (Math.abs(grab.seconds) >= 0.5) seek(grab.seconds);
    grab = null;
    scene.style.cursor = "grab";
  }
  if (h.kind === "search" && !h.searching) invoke("skip", { forward: h.forward });
  S.search = 0;
  S.dragging = false;
  S.pressed = null;
  redraw();
});
// Right-click anywhere: the app menu (looks, interface, song name, quit) at the pointer.
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  invoke("context_menu");
});
scene.addEventListener("dblclick", (e) => {
  if (controlAt(scenePoint(e))) return; // double-clicking a control just uses it twice
  setMode(MODES[(MODES.indexOf(S.mode) + 1) % MODES.length]);
});
// Scroll changes the volume (sideways scrolling is ignored so it can't change it by accident).
scene.addEventListener("wheel", (e) => {
  if (S.mode === "disc") return;
  e.preventDefault();
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) setVolume(S.volume - e.deltaY * 0.25);
}, { passive: false });
scene.addEventListener("mousemove", (e) => {
  if (act) return;
  const h = controlAt(scenePoint(e));
  scene.style.cursor = !h ? "" : h.kind === "grab" ? "grab" : "pointer";
  const hover = h?.hover ?? null;
  if (hover === S.hover) return;
  S.hover = hover;
  redraw();
});
scene.addEventListener("mouseleave", () => {
  S.hover = null;
  redraw();
});

// Song name strip along the bottom (window and scene widget), switched in the menu.
// Text uses a 5×7 pixel font; names with characters it doesn't have (Cyrillic, Japanese, ...) fall back
// to the system font cut to hard pixels.
const STRIP_H = 12, NAME_SPEED = 18; // strip height in pixels, scroll speed in pixels per second
const TEXT_COLOR = [0xe8, 0xea, 0xee];
// One base-32 digit per row (7 rows + 2 for descenders), bit 4 = left column.
const FONT = {" ":"","!":"4444404","\"":"aaa","#":"aavavaa","$":"4fke5u4","%":"op248j3","&":"cik8lid","'":"448","(":"2488842",")":"8422248","*":"04lel40","+":"044v440",",":"00000c48","-":"000e",".":"00000cc","/":"01248g0","0":"ehjlphe","1":"4c4444e","2":"eh1248v","3":"v2421he","4":"26aiv22","5":"vgu11he","6":"68guhhe","7":"v124888","8":"ehhehhe","9":"ehhf12c",":":"0cc0cc0",";":"0cc0c48","<":"248g842","=":"00v0v",">":"8421248","?":"eh12404","@":"eh1dlle","A":"ehhhvhh","B":"uhhuhhu","C":"ehggghe","D":"sihhhis","E":"vgguggv","F":"vgguggg","G":"ehgnhhf","H":"hhhvhhh","I":"e44444e","J":"72222ic","K":"hikokih","L":"ggggggv","M":"hrllhhh","N":"hhpljhh","O":"ehhhhhe","P":"uhhuggg","Q":"ehhhlid","R":"uhhukih","S":"fgge11u","T":"v444444","U":"hhhhhhe","V":"hhhhha4","W":"hhhllla","X":"hha4ahh","Y":"hhha444","Z":"v1248gv","[":"e88888e","\\":"0g84210","]":"e22222e","^":"4ah","_":"000000v","`":"842","a":"00e1fhf","b":"gguhhhu","c":"00egghe","d":"11fhhhf","e":"00ehvge","f":"688s888","g":"00fhhhf1e","h":"gguhhhh","i":"40c444e","j":"2062222ic","k":"ggikoki","l":"c44444e","m":"00qllll","n":"00uhhhh","o":"00ehhhe","p":"00uhhhugg","q":"00fhhhf11","r":"00mpggg","s":"00fge1u","t":"88s8896","u":"00hhhjd","v":"00hhha4","w":"00hhlla","x":"00ha4ah","y":"00hhhhf1e","z":"00v248v","{":"2448442","|":"4444444","}":"8442448","~":"008l2","\u0131":"00c444e"};
const SAME = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "\u00a0": " " };
const MARKS = { "\u0300": [1], "\u0301": [3], "\u0302": [1, 3], "\u030c": [1, 3], "\u0308": [1, 3], "\u0303": [1, 2, 3], "\u030a": [2] }; // accent columns
// Pixel-font image of the text, or null if a character is missing from the font.
function pixelText(text) {
  const glyphs = [];
  for (const ch of text.normalize("NFD")) {
    if (MARKS[ch] && glyphs.length) { glyphs[glyphs.length - 1].marks.push(...MARKS[ch]); continue; }
    if (/\p{M}/u.test(ch)) continue; // other accents are left off
    for (const c of SAME[ch] ?? ch) {
      if (!(c in FONT)) return null;
      glyphs.push({ c, marks: [] });
    }
  }
  const cells = glyphs.map(({ c, marks }) => {
    if (c === "i" && marks.length) c = "ı"; // accent replaces the dot
    const rows = [...FONT[c]].map((d) => parseInt(d, 32));
    const cols = rows.flatMap((r) => [0, 1, 2, 3, 4].filter((x) => r & (16 >> x))).concat(marks);
    const lo = cols.length ? Math.min(...cols) : 0, w = cols.length ? Math.max(...cols) - lo + 1 : 2;
    const markRow = rows[0] || rows[1] ? -1 : 0; // above capitals, or with a 1-pixel gap over small letters
    return { rows, marks, lo, w, markRow };
  });
  const width = cells.reduce((a, g) => a + g.w + 1, 1);
  const c = new OffscreenCanvas(width, STRIP_H), x = c.getContext("2d");
  const d = x.createImageData(width, STRIP_H);
  const dot = (px, py) => {
    if (py < 0 || py >= STRIP_H) return;
    const i = (py * width + px) * 4;
    [d.data[i], d.data[i + 1], d.data[i + 2]] = TEXT_COLOR;
    d.data[i + 3] = 255;
  };
  let pen = 1;
  for (const g of cells) {
    g.rows.forEach((r, y) => [0, 1, 2, 3, 4].forEach((col) => r & (16 >> col) && dot(pen + col - g.lo, y + 2)));
    g.marks.forEach((col) => dot(pen + col - g.lo, g.markRow + 2));
    pen += g.w + 1;
  }
  x.putImageData(d, 0, 0);
  return c;
}
// Fallback: system font, cut to hard pixels so it stays crisp.
function systemText(text) {
  const c = new OffscreenCanvas(1, STRIP_H), x = c.getContext("2d");
  const font = "9px -apple-system, 'Segoe UI', sans-serif";
  x.font = font;
  c.width = Math.ceil(x.measureText(text).width) + 2;
  x.font = font;
  x.textBaseline = "middle";
  x.fillStyle = "#fff";
  x.fillText(text, 1, STRIP_H / 2 + 0.5);
  const d = x.getImageData(0, 0, c.width, STRIP_H);
  for (let i = 0; i < d.data.length; i += 4) {
    const on = d.data[i + 3] > 110;
    [d.data[i], d.data[i + 1], d.data[i + 2]] = TEXT_COLOR;
    d.data[i + 3] = on ? 255 : 0;
  }
  x.putImageData(d, 0, 0);
  return c;
}
let showName = (() => { try { return localStorage.getItem("show-name") === "1"; } catch { return false; } })();
let nameText = "", nameImg = null;
function setName(text) {
  if (text === nameText) return;
  nameText = text;
  nameImg = text ? pixelText(text) ?? systemText(text) : null;
}
const nameScrolls = () => showName && S.mode !== "disc" && !!nameImg && nameImg.width > 160 - 8;
function nameStrip(now) {
  if (!nameImg) return;
  const y = VIEW.y + 160 - STRIP_H;
  rect(VIEW.x, y, 160, STRIP_H, "rgba(12,13,20,.85)");
  rect(VIEW.x, y, 160, 1, "rgba(255,255,255,.12)");
  clipTo(VIEW.x + 3, y, 160 - 6, STRIP_H);
  if (!nameScrolls()) {
    g.drawImage(nameImg, Math.round(VIEW.x + (160 - nameImg.width) / 2), y);
  } else {
    // Old-display ticker: the text runs left and comes round again after a gap.
    const loop = nameImg.width + 40, off = Math.floor((now / 1000 * NAME_SPEED) % loop);
    g.drawImage(nameImg, VIEW.x + 4 - off, y);
    g.drawImage(nameImg, VIEW.x + 4 - off + loop, y);
  }
  g.restore();
}
window.__TAURI__.core.invoke("show_name_checked", { on: showName }).catch(() => {});
window.__TAURI__.event.listen("toggle-name", () => {
  showName = !showName;
  save("show-name", showName ? "1" : "0");
  invoke("show_name_checked", { on: showName }); // keep the checkmark in step
  redraw();
  wake();
});

draw(pose(0));
window.__TAURI__.event.listen("track", (e) => show(e.payload));
window.__TAURI__.core.invoke("current_track").then(show);
