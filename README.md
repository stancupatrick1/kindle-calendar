# Calendar + Lună & Soare pe Kindle Paperwhite 10

O funcție Netlify (`netlify/functions/dashboard.mjs`) generează imaginea **în momentul
în care o cere Kindle-ul**: sus orarul din Google Calendar, jos faza lunii,
răsăritul/apusul și temperaturile. Kindle-ul (jailbreak + kindle-dash) verifică la
câteva minute și redesenează ecranul doar dacă imaginea s-a schimbat.

## Setări pe Netlify (Environment variables, scope: Functions)
- `ICS_URLS` – linkul secret iCal din Google Calendar (mai multe: separate prin virgulă)
- `DASH_KEY` – un șir aleator; imaginea se vede doar cu `?k=DASH_KEY`
- `LAT`, `LON` – opțional, implicit București

Adresa imaginii: `https://SITE.netlify.app/dashboard.png?k=DASH_KEY`

## Kindle
Folderul `kindle/` conține `local/env.sh`, `local/fetch-dashboard.sh` (pui adresa de mai sus)
și extensia KUAL. Copiază-le peste un release de github.com/pascalw/kindle-dash.
