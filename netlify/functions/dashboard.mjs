// Funcție Netlify: generează imaginea calendarului în momentul în care o cere Kindle-ul.
// Adresa: https://<site>.netlify.app/dashboard.png?k=<DASH_KEY>
//
// Variabile de mediu (Netlify → Project configuration → Environment variables):
//   ICS_URLS  - linkurile secrete iCal din Google Calendar (separate prin virgulă sau rând nou)
//   DASH_KEY  - parola din adresă, ca imaginea să nu fie publică
//   LAT, LON  - opțional, coordonatele pentru vreme și soare (implicit București)
import { renderDashboard, renderLandscape, eventsFor, astro, local, zoned, clothingFor, TZ } from "./lib/render.mjs";

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

export default async (req) => {
  const key = Netlify.env.get("DASH_KEY");
  const url = new URL(req.url);
  if (!key || url.searchParams.get("k") !== key) return new Response("Not found", { status: 404 });

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
    // Kindle-ul primește eroare și păstrează ecranul vechi, în loc să afișeze un calendar gol
    console.error("Calendar indisponibil:", e.message);
    return new Response("Calendar indisponibil", { status: 503 });
  }

  // Ziua afișată: azi; după SWITCH_TIME (implicit 21:30) ziua de mâine.
  // După miezul nopții, „mâine” devine „azi”, deci dimineața ecranul arată din nou ziua curentă.
  const [swH, swM] = (Netlify.env.get("SWITCH_TIME") || "21:30").split(":").map(Number);
  const now = local(new Date());
  const minutes = now.h * 60 + now.mi;
  const diff = minutes >= swH * 60 + (swM || 0) ? 1 : 0;
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

  // orizontal implicit; ROTATE=270 dacă Kindle-ul e montat invers, ROTATE=0 pentru vertical
  const rotate = parseInt(url.searchParams.get("r") || Netlify.env.get("ROTATE") || "90", 10);
  let png;
  if (rotate === 90 || rotate === 270) {
    const weatherRows = [["Azi", wx?.today], ["Mâine", wx?.tomorrow]];
    png = renderLandscape({ day, events, allday, wx, ast, label, outfit, weatherRows, rotate, greeting });
  } else {
    png = renderDashboard({ day, events, allday, wx, outfit, ast, label });
  }

  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
};

export const config = { path: "/dashboard.png" };
