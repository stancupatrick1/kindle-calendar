// Funcție Netlify: generează imaginea calendarului în momentul în care o cere Kindle-ul.
// Adresa: https://<site>.netlify.app/dashboard.png?k=<DASH_KEY>
//
// Variabile de mediu (Netlify → Project configuration → Environment variables):
//   ICS_URLS  - linkurile secrete iCal din Google Calendar (separate prin virgulă sau rând nou)
//   DASH_KEY  - parola din adresă, ca imaginea să nu fie publică
//   LAT, LON  - opțional, coordonatele pentru vreme și soare (implicit București)
import { renderDashboard, eventsFor, astro, local, zoned, clothingFor, TZ } from "./lib/render.mjs";

async function weather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(TZ)}` +
      `&current=temperature_2m,apparent_temperature` +
      `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max` +
      `&forecast_days=2`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const d = j.daily, c = j.current;
    const day = (i) => ({
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      rain: d.precipitation_probability_max[i] ?? 0,
      feels: Math.round((d.apparent_temperature_max[i] + d.apparent_temperature_min[i]) / 2),
    });
    return { now: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), today: day(0), tomorrow: day(1) };
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

  // după ora SWITCH_HOUR (implicit 20:00) se afișează ziua de mâine
  const switchHour = parseInt(Netlify.env.get("SWITCH_HOUR") || "20", 10);
  const now = local(new Date());
  const showTomorrow = now.h >= switchHour;
  const day = showTomorrow ? local(zoned(now.y, now.m, now.d + 1, 12)) : now;

  const { events, allday } = eventsFor(day, icsTexts);
  const wx = await weather(lat, lon);
  const outfit = wx ? clothingFor(showTomorrow ? wx.tomorrow.feels : wx.feels) : null;
  const png = renderDashboard({
    day, events, allday, wx, outfit, ast: astro(day, lat, lon), label: showTomorrow ? "MÂINE" : "AZI",
  });

  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
};

export const config = { path: "/dashboard.png" };
