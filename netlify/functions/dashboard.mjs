// Funcție Netlify: generează imaginea calendarului în momentul în care o cere Kindle-ul.
// Adresa: https://<site>.netlify.app/dashboard.png?k=<DASH_KEY>
//
// Variabile de mediu (Netlify → Project configuration → Environment variables):
//   ICS_URLS  - linkurile secrete iCal din Google Calendar (separate prin virgulă sau rând nou)
//   DASH_KEY  - parola din adresă, ca imaginea să nu fie publică
//   LAT, LON  - opțional, coordonatele pentru vreme și soare (implicit București)
import { renderDashboard, eventsFor, astro, local, TZ } from "./lib/render.mjs";

async function weather(lat, lon, day) {
  try {
    const date = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(TZ)}` +
      `&daily=temperature_2m_max,temperature_2m_min&start_date=${date}&end_date=${date}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const d = (await r.json()).daily;
    return { max: Math.round(d.temperature_2m_max[0]), min: Math.round(d.temperature_2m_min[0]) };
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

  const day = local(new Date());
  const { events, allday } = eventsFor(day, icsTexts);
  const [wx] = await Promise.all([weather(lat, lon, day)]);
  const png = renderDashboard({ day, events, allday, wx, ast: astro(day, lat, lon) });

  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
};

export const config = { path: "/dashboard.png" };
