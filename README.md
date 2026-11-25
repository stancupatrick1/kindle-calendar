# Calendar + Lună & Soare pe Kindle Paperwhite 10

GitHub generează la fiecare 15 minute o imagine: sus orarul din Google Calendar,
jos faza lunii, răsăritul/apusul și temperaturile. Kindle-ul (cu jailbreak și
kindle-dash) verifică la fiecare 30 de minute și redesenează ecranul DOAR dacă
s-a schimbat ceva: eveniment nou/modificat/șters, zi nouă sau prognoză nouă.

## 1. GitHub (o singură dată, de pe calculator)

1. Fă-ți cont pe github.com și creează un repository **public** nou (de ex. `calendar`).
   GitHub Pages e gratuit doar pentru repo-uri publice. Codul e public, dar imaginea
   are un nume secret, iar linkul calendarului stă ascuns în „Secrets”.
2. Urcă toate fișierele din acest folder (Add file → Upload files), inclusiv folderul `.github`.
3. **Settings → Secrets and variables → Actions → New repository secret:**
   - `ICS_URLS`: linkul secret iCal din Google Calendar. Pentru mai multe calendare,
     pune câte unul pe rând.
   - `IMAGE_NAME`: un șir lung, aleator (de ex. `k7f3q9xw2m8p`). Ăsta e „parola” imaginii.
4. Tot acolo, la tab-ul **Variables**, opțional:
   - `LAT` / `LON`: coordonatele orașului tău (implicit București)
   - `ROTATE`: `0` (implicit, vertical) sau `180` dacă ai montat Kindle-ul invers
5. **Settings → Pages → Source: GitHub Actions.**
6. **Actions → „Actualizează calendarul” → Run workflow.** După ~1 minut, deschide
   `https://USER.github.io/REPO/IMAGE_NAME.png` în browser. Trebuie să vezi calendarul.

## 2. Kindle

1. Descarcă ultimul release de pe github.com/pascalw/kindle-dash și dezarhivează-l.
2. Copiază peste el fișierele din folderul `kindle/local` de aici.
3. În `local/fetch-dashboard.sh` înlocuiește `USER`, `REPO`, `NUME_SECRET` cu ale tale.
4. Conectează Kindle-ul prin USB și copiază tot folderul ca `dashboard` în rădăcina Kindle-ului.
5. Pornește-l din KUAL, sau prin SSH cu `/mnt/us/dashboard/start.sh`.
   Ca să revii la Kindle-ul normal, repornește-l (ține apăsat butonul de pornire).

## Bine de știut

- GitHub oprește programările automate dacă repo-ul nu are nicio modificare
  timp de 60 de zile. Primești un email și le repornești dintr-un click.
- Un eveniment adăugat apare pe ecran în cel mult ~45 de minute: până la 15 min
  pentru GitHub (uneori mai mult, GitHub mai întârzie) plus până la 30 min pentru Kindle.
- Imaginea nu are ceas sau „acum” tocmai ca să nu se schimbe singură; așa Kindle-ul
  redesenează rar și bateria ține mult.
- Pentru test local: `pip install -r requirements.txt`, apoi `ICS_URLS="..." python render.py`.
