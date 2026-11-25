// Server compatibil TRMNL (BYOS) pentru pluginul TRMNL din KOReader.
// Pluginul cere GET /api/display cu antetul access-token = DASH_KEY și primește
// adresa imaginii. „filename” se schimbă doar când se schimbă conținutul,
// deci KOReader redesenează ecranul doar atunci.
import { buildState, stateHash, CalendarUnavailable } from "./lib/state.mjs";

export default async (req) => {
  const key = Netlify.env.get("DASH_KEY");
  if (!key || req.headers.get("access-token") !== key) {
    return Response.json({ status: 500, error: "Device not found" });
  }

  // KOReader trimite dimensiunea ecranului. Dacă e deja pe orizontală, nu mai rotim imaginea.
  const w = parseInt(req.headers.get("png-width") || "0", 10);
  const h = parseInt(req.headers.get("png-height") || "0", 10);
  const orient = w && h && w > h ? "land" : (Netlify.env.get("ROTATE") === "270" ? "land270" : "land90");
  const refresh = parseInt(Netlify.env.get("REFRESH_SECONDS") || "300", 10);

  let st;
  try {
    st = await buildState();
  } catch (e) {
    if (e instanceof CalendarUnavailable) {
      return Response.json({ status: 500, error: "Calendar indisponibil", refresh_rate: 120 });
    }
    throw e;
  }

  const hash = stateHash(st, orient);
  const base = new URL(req.url).origin;
  return Response.json({
    status: 0,
    image_url: `${base}/dashboard.png?k=${encodeURIComponent(key)}&o=${orient}&v=${hash}`,
    filename: `calendar-${hash}.png`,
    refresh_rate: refresh,
  }, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/display" };
