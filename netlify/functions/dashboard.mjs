// Imaginea calendarului, generată la cerere.
// Adresa: https://<site>.netlify.app/dashboard.png?k=<DASH_KEY>[&o=land|land90|land270|port]
//
// Variabile de mediu (Netlify → Project configuration → Environment variables):
//   ICS_URLS    - linkurile secrete iCal din Google Calendar (separate prin virgulă sau rând nou)
//   DASH_KEY    - parola din adresă, ca imaginea să nu fie publică
//   LAT, LON    - opțional, coordonatele pentru vreme și soare (implicit București)
//   ROTATE      - 90 (implicit), 270 sau 0 (vertical) pentru kindle-dash
//   SWITCH_TIME - ora de la care arată ziua de mâine (implicit 21:30)
//   NAME        - numele din salut (implicit Patrick)
import { buildState, renderState, defaultOrient, CalendarUnavailable } from "./lib/state.mjs";

const ORIENTS = new Set(["land", "land90", "land270", "port"]);

export default async (req) => {
  const key = Netlify.env.get("DASH_KEY");
  const url = new URL(req.url);
  if (!key || url.searchParams.get("k") !== key) return new Response("Not found", { status: 404 });

  // compatibilitate: r=0 → vertical, r=90/270 → orizontal rotit
  let orient = url.searchParams.get("o");
  const r = url.searchParams.get("r");
  if (!ORIENTS.has(orient)) orient = r === "0" ? "port" : r === "270" ? "land270" : r === "90" ? "land90" : defaultOrient();

  let st;
  try {
    st = await buildState();
  } catch (e) {
    if (e instanceof CalendarUnavailable) {
      // Kindle-ul primește eroare și păstrează ecranul vechi, în loc să afișeze un calendar gol
      console.error("Calendar indisponibil:", e.message);
      return new Response("Calendar indisponibil", { status: 503 });
    }
    throw e;
  }
  return new Response(renderState(st, orient), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
};

export const config = { path: "/dashboard.png" };
