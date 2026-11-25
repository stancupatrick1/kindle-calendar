// Desenează ecranul pentru Kindle Paperwhite 10 (1072x1448, gri pe 8 biți).
// Imaginea depinde DOAR de evenimente, dată, lună/soare și max/min,
// ca Kindle-ul să redeseneze ecranul doar când se schimbă ceva.
import opentype from "opentype.js";
import IcalExpander from "ical-expander";
import * as Astronomy from "astronomy-engine";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { REGULAR, BOLD } from "./fonts.mjs";

export const TZ = "Europe/Bucharest";
const W = 1072, H = 1448, M = 28;
const ZILE = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];
const LUNI = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"];

const toAB = (b64) => { const b = Buffer.from(b64, "base64"); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const FONT = { r: opentype.parse(toAB(REGULAR)), b: opentype.parse(toAB(BOLD)) };

// ------------------------------------------------------------ timp local

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short",
});
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function local(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: WD[p.weekday] };
}

// ora locală din București -> moment UTC
export function zoned(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const l = local(new Date(t));
    const asUTC = Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s);
    t = t - (asUTC - guess);
  }
  return new Date(t);
}

const hhmm = (date) => { const l = local(date); return `${String(l.h).padStart(2, "0")}:${String(l.mi).padStart(2, "0")}`; };
const shortDate = (date) => { const l = local(date); return `${l.d} ${LUNI[l.m - 1]}`; };

// ------------------------------------------------------------ calendar

export function eventsFor(day, icsTexts) {
  const start = zoned(day.y, day.m, day.d);
  const nd = new Date(Date.UTC(day.y, day.m - 1, day.d + 1));
  const end = zoned(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate());
  const dayKey = day.y * 10000 + day.m * 100 + day.d;
  const timed = [], allday = new Set();

  for (const ics of icsTexts) {
    const exp = new IcalExpander({ ics, maxIterations: 5000 });
    const res = exp.between(new Date(start.getTime() - 86400000 * 2), new Date(end.getTime() + 86400000));
    const items = [
      ...res.events.map((e) => ({ s: e.startDate, e: e.endDate, ev: e })),
      ...res.occurrences.map((o) => ({ s: o.startDate, e: o.endDate, ev: o.item })),
    ];
    for (const { s, e, ev } of items) {
      const status = (ev.component.getFirstPropertyValue("status") || "").toUpperCase();
      if (status === "CANCELLED") continue;
      const title = (ev.summary || "(fără titlu)").trim();
      if (s.isDate) {
        const sk = s.year * 10000 + s.month * 100 + s.day;
        const ek = e ? e.year * 10000 + e.month * 100 + e.day : sk + 1;
        if (sk <= dayKey && (dayKey < ek || sk === dayKey)) allday.add(title);
      } else {
        const sj = s.toJSDate();
        const ej = e ? e.toJSDate() : new Date(sj.getTime() + 3600000);
        if (ej <= start || sj >= end) continue;
        timed.push({ title, start: sj < start ? start : sj, end: ej > end ? end : ej, endsNextDay: ej >= end });
      }
    }
  }
  timed.sort((a, b) => a.start - b.start || a.end - b.end || a.title.localeCompare(b.title));
  const seen = new Set();
  const out = timed.filter((t) => { const k = `${t.title}|${+t.start}|${+t.end}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { events: out, allday: [...allday].sort() };
}

// ------------------------------------------------------------ lună & soare

export function astro(day, lat, lon) {
  const noon = zoned(day.y, day.m, day.d, 12);
  const lit = Astronomy.Illumination(Astronomy.Body.Moon, noon).phase_fraction;
  const phase = Astronomy.MoonPhase(noon);
  const waxing = phase < 180;
  const nextNew = Astronomy.SearchMoonPhase(0, noon, 40).date;
  const nextFull = Astronomy.SearchMoonPhase(180, noon, 40).date;
  const obs = new Astronomy.Observer(lat, lon, 0);
  const midnight = zoned(day.y, day.m, day.d);
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, midnight, 1);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, -1, midnight, 1);

  let name;
  if (lit < 0.03) name = "Lună nouă";
  else if (lit > 0.97) name = "Lună plină";
  else if (Math.abs(lit - 0.5) < 0.06) name = waxing ? "Primul pătrar" : "Ultimul pătrar";
  else if (lit < 0.5) name = waxing ? "Semilună crescătoare" : "Semilună descrescătoare";
  else name = waxing ? "Lună crescătoare" : "Lună descrescătoare";

  return { lit, waxing, name, nextNew, nextFull, rise: rise?.date, set: set?.date };
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Lună procedurală (mări, cratere, textură) + fază + dithering Floyd–Steinberg
function moonPNG(n, lit, waxing) {
  const rnd = mulberry32(42);
  const b = new Float32Array(n * n);
  const xs = (i) => (i - n / 2 + 0.5) / (n / 2);

  const layers = [[8, 0.10], [16, 0.07], [32, 0.05], [64, 0.04]].map(([k, amp]) => {
    const g = Array.from({ length: (k + 1) * (k + 1) }, () => rnd());
    return { k, amp, g };
  });
  const noise = (u, v) => {
    let s = 0;
    for (const { k, amp, g } of layers) {
      const fx = u * (k - 1), fy = v * (k - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (x, y) => g[Math.min(y, k) * (k + 1) + Math.min(x, k)];
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      s += amp * (top * (1 - sy) + bot * sy);
    }
    return s;
  };

  const maria = [[-0.35, -0.42, 0.26, 0.22], [0.18, -0.36, 0.16, 0.15], [0.32, -0.06, 0.19, 0.17],
    [0.66, -0.26, 0.11, 0.09], [0.52, 0.22, 0.15, 0.17], [0.30, 0.32, 0.08, 0.08],
    [-0.15, 0.42, 0.17, 0.12], [-0.62, 0.02, 0.24, 0.42], [-0.42, 0.50, 0.08, 0.07],
    [0.00, -0.70, 0.42, 0.06], [-0.05, -0.05, 0.10, 0.10]];
  const craters = Array.from({ length: 40 }, () => [rnd() * 1.8 - 0.9, rnd() * 1.8 - 0.9, 0.02 + rnd() * 0.04]);

  const e = 1 - 2 * lit;
  for (let j = 0; j < n; j++) {
    const y = xs(j);
    for (let i = 0; i < n; i++) {
      const x = xs(i), r2 = x * x + y * y, idx = j * n + i;
      if (r2 > 1) { b[idx] = 255; continue; }
      let v = 0.80;
      for (const [cx, cy, sx, sy] of maria) v -= 0.70 * Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
      v += noise((x + 1) / 2, (y + 1) / 2) - 0.13;
      for (const [cx, cy, rr] of craters) {
        const d = Math.hypot(x - cx, y - cy);
        v -= 0.12 * Math.exp(-(((d - rr) / (rr * 0.35)) ** 2));
        v += 0.10 * Math.exp(-(((d - rr * 1.25) / (rr * 0.3)) ** 2));
      }
      const dt = Math.hypot(x + 0.12, y - 0.70);
      v += 0.35 * Math.exp(-((dt / 0.04) ** 2));
      if (Math.cos(Math.atan2(y - 0.70, x + 0.12) * 9) > 0.85) v += 0.07 * Math.exp(-dt / 0.5);
      v *= 0.78 + 0.22 * Math.sqrt(Math.max(0, 1 - r2));
      const half = Math.sqrt(Math.max(0, 1 - y * y));
      const litHere = waxing ? x >= e * half : x <= -e * half;
      b[idx] = litHere ? Math.min(1, Math.max(0, v)) * 255 : 45;
    }
  }
  // dithering
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const idx = j * n + i, old = b[idx], nv = old < 128 ? 0 : 255, err = old - nv;
    out[idx] = nv;
    if (i + 1 < n) b[idx + 1] += err * 7 / 16;
    if (j + 1 < n) {
      if (i > 0) b[idx + n - 1] += err * 3 / 16;
      b[idx + n] += err * 5 / 16;
      if (i + 1 < n) b[idx + n + 1] += err / 16;
    }
  }
  return encodeGray(out, n, n);
}

function encodeGray(data, w, h) {
  const png = new PNG({ width: w, height: h, colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false });
  png.data = Buffer.from(data);
  return PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false });
}

// ------------------------------------------------------------ SVG

const g = (v) => `rgb(${v},${v},${v})`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// așezare manuală a literelor (fără regulile OpenType pe care opentype.js nu le suportă)
function glyphs(f, str) { return Array.from(str).map((c) => f.charToGlyph(c)); }
function advance(f, str, size) {
  const gs = glyphs(f, str), sc = size / f.unitsPerEm;
  let w = 0;
  for (let i = 0; i < gs.length; i++) {
    w += (gs[i].advanceWidth || 0) * sc;
    if (i + 1 < gs.length) w += f.getKerningValue(gs[i], gs[i + 1]) * sc;
  }
  return w;
}
function pathData(f, str, x, y, size) {
  const gs = glyphs(f, str), sc = size / f.unitsPerEm;
  let out = "", cx = x;
  for (let i = 0; i < gs.length; i++) {
    out += gs[i].getPath(cx, y, size).toPathData(2);
    cx += (gs[i].advanceWidth || 0) * sc;
    if (i + 1 < gs.length) cx += f.getKerningValue(gs[i], gs[i + 1]) * sc;
  }
  return out;
}
function textWidth(str, size, bold) { return advance(bold ? FONT.b : FONT.r, str, size); }

// anchor ca la Pillow: l/m/r + a(sus)/m(mijloc)/s(linia de bază)
function text(str, x, y, size, { bold = false, fill = 0, anchor = "la" } = {}) {
  const f = bold ? FONT.b : FONT.r;
  const w = advance(f, str, size);
  const asc = (f.ascender / f.unitsPerEm) * size, desc = (f.descender / f.unitsPerEm) * size;
  const ax = anchor[0] === "m" ? x - w / 2 : anchor[0] === "r" ? x - w : x;
  const by = anchor[1] === "m" ? y + (asc + desc) / 2 : anchor[1] === "s" ? y : y + asc;
  const d = pathData(f, str, ax, by, size);
  return d ? `<path d="${d}" fill="${g(fill)}"/>` : "";
}

function fit(str, size, bold, maxW) {
  if (textWidth(str, size, bold) <= maxW) return str;
  while (str && textWidth(str + "…", size, bold) > maxW) str = str.slice(0, -1);
  return str.trimEnd() + "…";
}

function layoutColumns(evs) {
  const groups = []; let cur = [], curEnd = null;
  for (const ev of evs) {
    if (cur.length && ev.start >= curEnd) { groups.push(cur); cur = []; curEnd = null; }
    cur.push(ev); curEnd = curEnd === null ? ev.end : (ev.end > curEnd ? ev.end : curEnd);
  }
  if (cur.length) groups.push(cur);
  for (const grp of groups) {
    const cols = [];
    for (const ev of grp) {
      const i = cols.findIndex((last) => ev.start >= last);
      if (i >= 0) { ev.col = i; cols[i] = ev.end; } else { ev.col = cols.length; cols.push(ev.end); }
    }
    for (const ev of grp) ev.ncols = cols.length;
  }
}

export function renderDashboard({ day, events, allday, wx, ast }) {
  const s = [];
  const HEADER = 96;

  s.push(`<rect x="0" y="0" width="${W}" height="${HEADER}" fill="black"/>`);
  s.push(text("AZI", M + 8, HEADER / 2, 48, { bold: true, fill: 255, anchor: "lm" }));
  s.push(text(`${ZILE[day.wd]} ${day.d} ${LUNI[day.m - 1]}`, W - M - 8, HEADER / 2, 48, { bold: true, fill: 255, anchor: "rm" }));

  // rezumat
  let top = HEADER + 20;
  const n = events.length;
  s.push(text(n === 0 ? "Zi liberă" : `${n} ${n === 1 ? "eveniment" : "evenimente"}`, M, top, 40, { bold: true }));
  if (n) {
    const last = events.reduce((a, e) => (e.end > a ? e.end : a), events[0].end);
    const lastTxt = events.some((e) => e.endsNextDay) ? "24:00" : hhmm(last);
    s.push(text(`${hhmm(events[0].start)} – ${lastTxt}`, W - M, top + 6, 34, { anchor: "ra" }));
  }
  top += 62;

  if (allday.length) {
    let x = M;
    for (const t of allday) {
      const txt = fit(t, 28, true, 420);
      const w = textWidth(txt, 28, true) + 28;
      if (x + w > W - M) break;
      s.push(`<rect x="${x}" y="${top}" width="${w}" height="44" rx="10" fill="white" stroke="black" stroke-width="3"/>`);
      s.push(text(txt, x + 14, top + 22, 28, { bold: true, anchor: "lm" }));
      x += w + 12;
    }
    top += 58;
  }

  // orarul
  const bottom = H - 440;
  let h0 = 7, h1 = 22;
  for (const ev of events) {
    const ls = local(ev.start), le = local(ev.end);
    h0 = Math.min(h0, ls.h);
    h1 = Math.max(h1, ev.endsNextDay ? 24 : le.h + (le.mi ? 1 : 0));
  }
  h1 = Math.min(Math.max(h1, h0 + 1), 24);
  const hourPx = (bottom - top - 30) / (h1 - h0);
  const fh = hourPx > 40 ? 28 : 22;
  const x0 = M + 96;
  const yOf = (date, isEnd) => {
    const l = local(date);
    let hh = l.h + l.mi / 60;
    if (isEnd && hh === 0) hh = 24;
    return top + 14 + (hh - h0) * hourPx;
  };

  for (let h = h0; h <= h1; h++) {
    const y = top + 14 + (h - h0) * hourPx;
    s.push(text(`${String(h).padStart(2, "0")}:00`, M, y, fh, { anchor: "lm" }));
    s.push(`<line x1="${x0}" y1="${y}" x2="${W - M}" y2="${y}" stroke="${g(100)}" stroke-width="1.5" stroke-dasharray="2 6"/>`);
  }

  layoutColumns(events);
  const span = W - M - x0 - 6;
  for (const ev of events) {
    const ya = yOf(ev.start, false);
    const yb = Math.max(ev.endsNextDay ? yOf(ev.end, true) : yOf(ev.end, true), ya + 36);
    const cw = span / ev.ncols;
    const xa = x0 + 6 + ev.col * cw, xb = xa + cw - 6;
    s.push(`<rect x="${xa}" y="${ya + 2}" width="${xb - xa}" height="${yb - ya - 4}" rx="12" fill="black"/>`);
    const hAv = yb - ya - 4;
    const fs = hAv >= 48 ? 32 : Math.max(18, Math.floor(hAv * 0.62));
    const tx = xa + 16;
    const title = fit(ev.title, fs, true, xb - tx - 12);
    if (hAv >= 92) {
      s.push(text(title, tx, ya + 12, fs, { bold: true, fill: 255 }));
      s.push(text(`${hhmm(ev.start)} – ${ev.endsNextDay ? "24:00" : hhmm(ev.end)}`, tx, ya + 12 + fs + 8, 24, { fill: 255 }));
    } else {
      s.push(text(title, tx, (ya + yb) / 2, fs, { bold: true, fill: 255, anchor: "lm" }));
    }
  }

  // panoul Lună & Soare
  let py = bottom + 10;
  s.push(`<rect x="0" y="${py}" width="${W}" height="52" fill="black"/>`);
  s.push(text("LUNA & SOARELE", M + 8, py + 26, 32, { bold: true, fill: 255, anchor: "lm" }));
  if (wx) s.push(text(`Max ${wx.max}°  Min ${wx.min}°`, W - M - 8, py + 26, 30, { bold: true, fill: 255, anchor: "rm" }));
  py += 72;

  const msize = 330;
  const moon = moonPNG(msize, ast.lit, ast.waxing).toString("base64");
  s.push(`<image x="${M}" y="${py}" width="${msize}" height="${msize}" image-rendering="pixelated" href="data:image/png;base64,${moon}"/>`);
  s.push(`<circle cx="${M + msize / 2}" cy="${py + msize / 2}" r="${msize / 2 - 2}" fill="none" stroke="black" stroke-width="2"/>`);

  const tx = M + msize + 30;
  const nameLines = ast.name.length > 12 ? [ast.name.slice(0, ast.name.indexOf(" ")), ast.name.slice(ast.name.indexOf(" ") + 1)] : [ast.name];
  let yy = py + 6;
  for (const ln of nameLines) { s.push(text(ln, tx, yy, 40, { bold: true })); yy += 48; }
  s.push(text(`${Math.round(ast.lit * 100)}% luminată`, tx, yy + 4, 28));
  yy += 56;
  const col2 = tx + 300;
  for (const [label, dt] of [["Lună nouă", ast.nextNew], ["Lună plină", ast.nextFull]].sort((a, b) => a[1] - b[1])) {
    s.push(text(label, tx, yy, 28));
    s.push(text(shortDate(dt), col2, yy, 28, { bold: true, anchor: "ra" }));
    yy += 40;
  }
  s.push(`<line x1="${tx}" y1="${yy + 8}" x2="${col2}" y2="${yy + 8}" stroke="black" stroke-width="2"/>`);

  // soarele
  const sx0 = col2 + 60, sx1 = W - M;
  const arcTop = py + 20, arcBase = py + 150;
  const cx = (sx0 + sx1) / 2, rx = (sx1 - sx0) / 2 - 10, ry = arcBase - arcTop - 20;
  s.push(`<path d="M ${cx - rx} ${arcBase} A ${rx} ${ry} 0 0 1 ${cx + rx} ${arcBase}" fill="none" stroke="black" stroke-width="2" stroke-dasharray="9 7"/>`);
  s.push(`<line x1="${sx0}" y1="${arcBase}" x2="${sx1}" y2="${arcBase}" stroke="black" stroke-width="2"/>`);
  const sy = arcBase - ry;
  s.push(`<circle cx="${cx}" cy="${sy}" r="12" fill="black"/>`);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    s.push(`<line x1="${cx + 18 * Math.cos(a)}" y1="${sy + 18 * Math.sin(a)}" x2="${cx + 26 * Math.cos(a)}" y2="${sy + 26 * Math.sin(a)}" stroke="black" stroke-width="3"/>`);
  }
  yy = arcBase + 18;
  if (ast.rise && ast.set) {
    s.push(text("Răsărit", sx0, yy, 26));
    s.push(text("Apus", sx1, yy, 26, { anchor: "ra" }));
    s.push(text(hhmm(ast.rise), sx0, yy + 34, 46, { bold: true }));
    s.push(text(hhmm(ast.set), sx1, yy + 34, 46, { bold: true, anchor: "ra" }));
    const mins = Math.floor((ast.set - ast.rise) / 60000);
    s.push(text(`${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m de lumină`, (sx0 + sx1) / 2, yy + 104, 28, { anchor: "ma" }));
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="white"/>${s.join("")}</svg>`;
  const rgba = new Resvg(svg, { background: "white", font: { loadSystemFonts: false } }).render();
  const px = rgba.pixels, gray = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
  return encodeGray(gray, W, H);
}
