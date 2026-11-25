#!/usr/bin/env python3
"""
Calendar + Lună & Soare pentru Kindle Paperwhite 10 (1072x1448, vertical).

Imaginea depinde DOAR de: evenimentele din calendar, data zilei, faza lunii,
răsărit/apus și temperaturile max/min. Fără ceas sau „acum”, ca Kindle-ul să
redeseneze ecranul doar când se schimbă ceva cu adevărat.

Variabile de mediu:
  ICS_URLS   - linkuri iCal secrete, separate prin virgulă sau rând nou
  LAT, LON   - coordonate (implicit București)
  DAY_START  - prima oră afișată (implicit 7)
  DAY_END    - ultima oră afișată (implicit 22)
  ROTATE     - 0 (implicit) sau 180 dacă Kindle-ul e montat invers
  OUT        - fișierul rezultat (implicit out/dashboard.png)
  ICS_FILE, NOW, WX_FAKE - doar pentru teste
"""
import os
import sys
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import ephem
import icalendar
import numpy as np
import recurring_ical_events
import requests
from PIL import Image, ImageDraw, ImageFont

TZ = ZoneInfo("Europe/Bucharest")
W, H = 1072, 1448
M = 28

ZILE = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"]
LUNI = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"]

LAT = float(os.environ.get("LAT") or 44.4268)
LON = float(os.environ.get("LON") or 26.1025)

FONT_DIRS = [os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"),
             "/usr/share/fonts/truetype/dejavu"]


def font(size, bold=False):
    names = ["DejaVuSansCondensed-Bold.ttf" if bold else "DejaVuSansCondensed.ttf",
             "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"]
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def short_date(dt):
    return f"{dt.day} {LUNI[dt.month - 1]}"


# ================================================================ calendar

def load_calendars():
    cals = []
    if os.environ.get("ICS_FILE"):
        with open(os.environ["ICS_FILE"], "rb") as f:
            cals.append(icalendar.Calendar.from_ical(f.read()))
    urls = [u.strip() for u in os.environ.get("ICS_URLS", "").replace(",", "\n").splitlines() if u.strip()]
    for url in urls:
        r = requests.get(url, timeout=30)
        r.raise_for_status()  # dacă un calendar pică, NU publicăm o imagine goală
        cals.append(icalendar.Calendar.from_ical(r.content))
    return cals


def to_local(v):
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=TZ)
        return v.astimezone(TZ), False
    return datetime.combine(v, time.min, TZ), True


def events_for(day, cals):
    start = datetime.combine(day, time.min, TZ)
    end = start + timedelta(days=1)
    timed, allday = [], []
    for cal in cals:
        for ev in recurring_ical_events.of(cal).between(start, end):
            if str(ev.get("STATUS", "")).upper() == "CANCELLED":
                continue
            title = str(ev.get("SUMMARY", "(fără titlu)")).strip()
            s, is_all = to_local(ev.decoded("DTSTART"))
            if ev.get("DTEND") is not None:
                e, _ = to_local(ev.decoded("DTEND"))
            else:
                e = s + (timedelta(days=1) if is_all else timedelta(hours=1))
            if is_all:
                allday.append(title)
            else:
                timed.append({"title": title, "start": max(s, start), "end": min(e, end)})
    timed.sort(key=lambda x: (x["start"], x["end"], x["title"]))
    seen, out = set(), []
    for t in timed:
        k = (t["title"], t["start"], t["end"])
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out, sorted(set(allday))


# ================================================================ vreme

def weather(day):
    if os.environ.get("WX_FAKE"):
        return {"max": 9, "min": 1}
    try:
        r = requests.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": LAT, "longitude": LON, "timezone": "Europe/Bucharest",
            "daily": "temperature_2m_max,temperature_2m_min",
            "start_date": day.isoformat(), "end_date": day.isoformat(),
        }, timeout=20)
        d = r.json()["daily"]
        return {"max": round(d["temperature_2m_max"][0]), "min": round(d["temperature_2m_min"][0])}
    except Exception as e:
        print(f"Eroare la vreme: {e}", file=sys.stderr)
        return None


# ================================================================ lună & soare

def astro(day):
    noon_utc = datetime.combine(day, time(12), TZ).astimezone(timezone.utc)
    moon = ephem.Moon(noon_utc)
    lit = moon.moon_phase  # fracțiune luminată 0..1
    nxt_new = ephem.next_new_moon(noon_utc).datetime().replace(tzinfo=timezone.utc).astimezone(TZ)
    nxt_full = ephem.next_full_moon(noon_utc).datetime().replace(tzinfo=timezone.utc).astimezone(TZ)
    waxing = nxt_full < nxt_new

    obs = ephem.Observer()
    obs.lat, obs.lon = str(LAT), str(LON)
    obs.horizon = "-0:34"
    obs.pressure = 0
    obs.date = datetime.combine(day, time.min, TZ).astimezone(timezone.utc)
    sun = ephem.Sun()
    try:
        rise = obs.next_rising(sun).datetime().replace(tzinfo=timezone.utc).astimezone(TZ)
        sett = obs.next_setting(sun).datetime().replace(tzinfo=timezone.utc).astimezone(TZ)
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        rise = sett = None

    if lit < 0.03:
        name = "Lună nouă"
    elif lit > 0.97:
        name = "Lună plină"
    elif abs(lit - 0.5) < 0.06:
        name = "Primul pătrar" if waxing else "Ultimul pătrar"
    elif lit < 0.5:
        name = "Semilună crescătoare" if waxing else "Semilună descrescătoare"
    else:
        name = "Lună crescătoare" if waxing else "Lună descrescătoare"

    return {"lit": lit, "waxing": waxing, "name": name,
            "new": nxt_new, "full": nxt_full, "rise": rise, "set": sett}


def moon_image(size, lit, waxing):
    """Lună desenată procedural (mări, cratere, textură) + fază, apoi dithering."""
    rng = np.random.default_rng(42)  # mereu aceeași textură => aceeași imagine
    n = size
    yy, xx = np.mgrid[0:n, 0:n]
    x = (xx - n / 2 + 0.5) / (n / 2)
    y = (yy - n / 2 + 0.5) / (n / 2)
    r2 = x ** 2 + y ** 2
    inside = r2 <= 1

    b = np.full((n, n), 0.80)
    # mările lunare (poziții aproximative, cum se văd din emisfera nordică)
    maria = [(-0.35, -0.42, 0.26, 0.22), (0.18, -0.36, 0.16, 0.15), (0.32, -0.06, 0.19, 0.17),
             (0.66, -0.26, 0.11, 0.09), (0.52, 0.22, 0.15, 0.17), (0.30, 0.32, 0.08, 0.08),
             (-0.15, 0.42, 0.17, 0.12), (-0.62, 0.02, 0.24, 0.42), (-0.42, 0.50, 0.08, 0.07),
             (0.00, -0.70, 0.42, 0.06), (-0.05, -0.05, 0.10, 0.10)]
    for cx, cy, sx, sy in maria:
        b -= 0.70 * np.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))
    # textură fractală
    tex = np.zeros((n, n))
    for k, amp in [(8, 0.10), (16, 0.07), (32, 0.05), (64, 0.04)]:
        g = rng.random((k, k))
        tex += amp * np.array(Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)) / 255
    b += tex - 0.13
    # cratere mici
    for _ in range(40):
        cx, cy = rng.uniform(-0.9, 0.9, 2)
        rr = rng.uniform(0.02, 0.06)
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        b -= 0.12 * np.exp(-((d - rr) / (rr * 0.35)) ** 2)
        b += 0.10 * np.exp(-((d - rr * 1.25) / (rr * 0.3)) ** 2)
    # Tycho, cu raze
    d = np.sqrt((x + 0.12) ** 2 + (y - 0.70) ** 2)
    b += 0.35 * np.exp(-(d / 0.04) ** 2)
    ang = np.arctan2(y - 0.70, x + 0.12)
    b += 0.07 * np.exp(-d / 0.5) * (np.cos(ang * 9) > 0.85)
    # întunecare spre margine
    b *= 0.78 + 0.22 * np.sqrt(np.clip(1 - r2, 0, 1))

    # faza: terminatorul e o elipsă
    e = 1 - 2 * lit
    half = np.sqrt(np.clip(1 - y ** 2, 0, 1))
    litmask = (x >= e * half) if waxing else (x <= -e * half)
    gray = np.where(litmask, np.clip(b, 0, 1) * 255, 45)  # partea umbrită: aproape neagră
    gray = np.where(inside, gray, 255).astype(np.uint8)

    img = Image.fromarray(gray, "L").convert("1").convert("L")  # dithering Floyd–Steinberg
    dd = ImageDraw.Draw(img)
    dd.ellipse([1, 1, n - 2, n - 2], outline=0, width=2)
    return img


# ================================================================ desen

def fit(draw, text, f, max_w):
    if draw.textlength(text, font=f) <= max_w:
        return text
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1]
    return text.rstrip() + "…"


def layout_columns(evs):
    groups, cur, cur_end = [], [], None
    for ev in evs:
        if cur and ev["start"] >= cur_end:
            groups.append(cur)
            cur, cur_end = [], None
        cur.append(ev)
        cur_end = ev["end"] if cur_end is None else max(cur_end, ev["end"])
    if cur:
        groups.append(cur)
    for g in groups:
        cols = []
        for ev in g:
            for i, last_end in enumerate(cols):
                if ev["start"] >= last_end:
                    ev["col"], cols[i] = i, ev["end"]
                    break
            else:
                ev["col"] = len(cols)
                cols.append(ev["end"])
        for ev in g:
            ev["ncols"] = len(cols)


def dashed_line(d, x0, x1, y, fill=100, step=8):
    for xx in range(int(x0), int(x1), step):
        d.line([xx, y, xx + 1, y], fill=fill)


def render(day, events, allday, wx, ast):
    img = Image.new("L", (W, H), 255)
    d = ImageDraw.Draw(img)
    HEADER = 96

    # ---- bara de sus
    d.rectangle([0, 0, W, HEADER], fill=0)
    d.text((M + 8, HEADER // 2), "AZI", font=font(48, True), fill=255, anchor="lm")
    d.text((W - M - 8, HEADER // 2), f"{ZILE[day.weekday()]} {day.day} {LUNI[day.month - 1]}",
           font=font(48, True), fill=255, anchor="rm")

    # ---- rezumat + evenimente pe toată ziua
    top = HEADER + 20
    n = len(events)
    summary = "Zi liberă" if n == 0 else f"{n} {'eveniment' if n == 1 else 'evenimente'}"
    d.text((M, top), summary, font=font(40, True), fill=0)
    if events:
        d.text((W - M, top + 6), f"{events[0]['start']:%H:%M} – {max(e['end'] for e in events):%H:%M}",
               font=font(34), fill=0, anchor="ra")
    top += 62
    if allday:
        fa = font(28, True)
        x = M
        for t in allday:
            txt = fit(d, t, fa, 420)
            w = d.textlength(txt, font=fa) + 28
            if x + w > W - M:
                break
            d.rounded_rectangle([x, top, x + w, top + 44], radius=10, outline=0, width=3)
            d.text((x + 14, top + 22), txt, font=fa, fill=0, anchor="lm")
            x += w + 12
        top += 58

    # ---- orarul
    BOTTOM_PANEL = 440
    bottom = H - BOTTOM_PANEL
    h0 = int(os.environ.get("DAY_START", 7))
    h1 = int(os.environ.get("DAY_END", 22))
    for ev in events:
        h0 = min(h0, ev["start"].hour)
        h1 = max(h1, ev["end"].hour + (1 if ev["end"].minute else 0))
    h1 = min(max(h1, h0 + 1), 24)
    hour_px = (bottom - top - 30) / (h1 - h0)
    fh = font(28 if hour_px > 40 else 22)
    x0 = M + 96

    def y_of(dt):
        hh = dt.hour + dt.minute / 60
        if dt.date() > day:
            hh = 24
        return top + 14 + (hh - h0) * hour_px

    for h in range(h0, h1 + 1):
        y = top + 14 + (h - h0) * hour_px
        d.text((M, y), f"{h:02d}:00", font=fh, fill=0, anchor="lm")
        dashed_line(d, x0, W - M, y)

    layout_columns(events)
    span = W - M - x0 - 6
    for ev in events:
        ya, yb = y_of(ev["start"]), y_of(ev["end"])
        yb = max(yb, ya + 36)
        cw = span / ev["ncols"]
        xa = x0 + 6 + ev["col"] * cw
        xb = xa + cw - 6
        d.rounded_rectangle([xa, ya + 2, xb, yb - 2], radius=12, fill=0)
        h_av = yb - ya - 4
        fs = 32 if h_av >= 48 else max(18, int(h_av * 0.62))
        ft = font(fs, True)
        tx = xa + 16
        title = fit(d, ev["title"], ft, xb - tx - 12)
        if h_av >= 92:
            d.text((tx, ya + 12), title, font=ft, fill=255)
            d.text((tx, ya + 12 + fs + 8), f"{ev['start']:%H:%M} – {ev['end']:%H:%M}", font=font(24), fill=255)
        else:
            d.text((tx, (ya + yb) / 2), title, font=ft, fill=255, anchor="lm")

    # ---- panoul Lună & Soare
    py = bottom + 10
    d.rectangle([0, py, W, py + 52], fill=0)
    d.text((M + 8, py + 26), "LUNA & SOARELE", font=font(32, True), fill=255, anchor="lm")
    if wx:
        d.text((W - M - 8, py + 26), f"Max {wx['max']}°  Min {wx['min']}°",
               font=font(30, True), fill=255, anchor="rm")
    py += 72

    msize = 330
    img.paste(moon_image(msize, ast["lit"], ast["waxing"]), (M, py))

    # text lună
    tx = M + msize + 30
    name_lines = ast["name"].split(" ", 1) if len(ast["name"]) > 12 else [ast["name"]]
    yy = py + 6
    for ln in name_lines:
        d.text((tx, yy), ln, font=font(40, True), fill=0)
        yy += 48
    d.text((tx, yy + 4), f"{round(ast['lit'] * 100)}% luminată", font=font(28), fill=0)
    yy += 56
    col2 = tx + 300
    for label, dt in sorted([("Lună nouă", ast["new"]), ("Lună plină", ast["full"])], key=lambda t: t[1]):
        d.text((tx, yy), label, font=font(28), fill=0)
        d.text((col2, yy), short_date(dt), font=font(28, True), fill=0, anchor="ra")
        yy += 40
    d.line([tx, yy + 8, col2, yy + 8], fill=0, width=2)

    # soare (arc static, ca în original)
    sx0, sx1 = col2 + 60, W - M
    arc_top, arc_base = py + 20, py + 150
    cx = (sx0 + sx1) / 2
    rx, ry = (sx1 - sx0) / 2 - 10, arc_base - arc_top - 20
    pts = [(cx + rx * np.cos(t), arc_base - ry * np.sin(t)) for t in np.linspace(np.pi, 0, 40)]
    for i in range(0, len(pts) - 1, 2):
        d.line([pts[i], pts[i + 1]], fill=0, width=2)
    d.line([sx0, arc_base, sx1, arc_base], fill=0, width=2)
    sy = arc_base - ry
    d.ellipse([cx - 12, sy - 12, cx + 12, sy + 12], fill=0)
    for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        d.line([cx + 18 * np.cos(a), sy + 18 * np.sin(a), cx + 26 * np.cos(a), sy + 26 * np.sin(a)], fill=0, width=3)

    yy = arc_base + 18
    if ast["rise"] and ast["set"]:
        d.text((sx0, yy), "Răsărit", font=font(26), fill=0)
        d.text((sx1, yy), "Apus", font=font(26), fill=0, anchor="ra")
        d.text((sx0, yy + 34), f"{ast['rise']:%H:%M}", font=font(46, True), fill=0)
        d.text((sx1, yy + 34), f"{ast['set']:%H:%M}", font=font(46, True), fill=0, anchor="ra")
        mins = int((ast["set"] - ast["rise"]).total_seconds() // 60)
        d.text(((sx0 + sx1) / 2, yy + 104), f"{mins // 60}h {mins % 60:02d}m de lumină",
               font=font(28), fill=0, anchor="ma")
    return img


def main():
    now = datetime.now(TZ)
    if os.environ.get("NOW"):
        now = datetime.fromisoformat(os.environ["NOW"]).replace(tzinfo=TZ)
    day = now.date()

    cals = load_calendars()
    events, allday = events_for(day, cals)
    img = render(day, events, allday, weather(day), astro(day))

    rot = int(os.environ.get("ROTATE") or 0)
    if rot:
        img = img.rotate(rot, expand=True)
    out = os.environ.get("OUT", "out/dashboard.png")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    img.save(out)
    print(f"Salvat {out}, {len(events)} evenimente azi")


if __name__ == "__main__":
    main()
