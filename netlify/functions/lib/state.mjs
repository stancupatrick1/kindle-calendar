// Datele comune pentru imagine și pentru /api/display.
import { createHash } from "node:crypto";
import { renderDashboard, renderLandscape, eventsFor, astro, local, zoned, clothingFor, TZ } from "./render.mjs";

async function weather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(TZ)}` +
      `&current=temperature_2m,apparent_temperature` +
      `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max` +
      `&forecast_days=8`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const d = j.daily, c = j.current;
    const day = (i) => ({
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      rain: d.precipitation_probability_max[i] ?? 0,
      feels: Math.round((d.apparent_temperature_max[i] + d.apparent_temperature_min[i]) / 2),
    });
    return { now: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), days: d.time.map((_, i) => day(i)), today: day(0), tomorrow: day(1) };
  } catch {
    return null;
  }
}

export class CalendarUnavailable extends Error {}

export async function buildState() {
  const lat = parseFloat(Netlify.env.get("LAT") || "44.4268");
  const lon = parseFloat(Netlify.env.get("LON") || "26.1025");
  const urls = (Netlify.env.get("ICS_URLS") || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  let icsTexts;
  try {
    icsTexts = await Promise.all(urls.map(async (u) => {
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }));
  } catch (e) {
    throw new CalendarUnavailable(e.message);
  }

  // Ziua afișată: azi; după SWITCH_TIME (implicit 21:30) ziua de mâine.
  // După miezul nopții „mâine” devine „azi”, deci dimineața ecranul arată din nou ziua curentă.
  const [swH, swM] = (Netlify.env.get("SWITCH_TIME") || "21:30").split(":").map(Number);
  const now = local(new Date());
  const diff = now.h * 60 + now.mi >= swH * 60 + (swM || 0) ? 1 : 0;
  const day = diff ? local(zoned(now.y, now.m, now.d + 1, 12)) : now;
  const label = diff ? "MÂINE" : "AZI";

  const name = Netlify.env.get("NAME") || "Patrick";
  const greeting =
    now.h >= 6 && now.h < 12 ? `Bună dimineața, ${name}!` :
    now.h >= 12 && now.h < 18 ? `Bună ziua, ${name}!` :
    diff === 0 && now.h >= 18 ? `Bună seara, ${name}!` :
    `Noapte bună, ${name}!`;

  const { events, allday } = eventsFor(day, icsTexts);
  const wx = await weather(lat, lon);
  const dayWx = wx ? wx.days[diff] : null;
  const outfit = wx ? clothingFor(diff === 0 ? wx.feels : dayWx?.feels) : null;
  const ast = astro(day, lat, lon);
  const weatherRows = [["Azi", wx?.today], ["Mâine", wx?.tomorrow]];
  return { day: { y: day.y, m: day.m, d: day.d, wd: day.wd, h: day.h, mi: day.mi }, events, allday, wx, outfit, ast, label, greeting, weatherRows };
}

// orientare: "land" (orizontal, fără rotire), "land90"/"land270" (orizontal rotit pentru ecran vertical), "port" (vertical)
export function renderState(st, orient) {
  if (orient === "port") return renderDashboard({ ...st, label: st.label });
  const rotate = orient === "land270" ? 270 : orient === "land" ? 0 : 90;
  return renderLandscape({ ...st, rotate });
}

// amprenta conținutului: se schimbă doar când se schimbă ce apare pe ecran
export function stateHash(st, orient) {
  const { wx, ...rest } = st;
  const keep = { ...rest, wx: wx && { now: wx.now, feels: wx.feels, today: wx.today, tomorrow: wx.tomorrow }, orient };
  return createHash("sha1").update(JSON.stringify(keep)).digest("hex").slice(0, 12);
}

export function defaultOrient() {
  const r = Netlify.env.get("ROTATE") || "90";
  return r === "0" ? "port" : r === "270" ? "land270" : "land90";
}
