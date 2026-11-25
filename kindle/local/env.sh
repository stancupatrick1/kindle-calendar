#!/usr/bin/env sh

# Adresa folosită ca să verifice dacă WiFi-ul e conectat înainte de descărcare
export WIFI_TEST_IP=${WIFI_TEST_IP:-1.1.1.1}

# Verifică la fiecare 5 minute, non-stop (recomandat cu Kindle-ul la încărcător).
# Ecranul se redesenează doar când s-a schimbat ceva (vezi fetch-dashboard.sh).
# Pe baterie, pune "*/30 * * * *" ca să țină mai mult.
export REFRESH_SCHEDULE="*/5 * * * *"
export TIMEZONE="Europe/Bucharest"

# Rămâne treaz între actualizări (sigur, ideal la încărcător).
# Pe baterie poți pune false: doarme între verificări și ține mai mult,
# dar trezirea automată e mai puțin testată pe Paperwhite 10.
export NO_SUSPEND=true

# Refresh complet (fără „fantome” pe e-ink) la fiecare 3 schimbări
export FULL_DISPLAY_REFRESH_RATE=3

# Dacă următoarea trezire e la peste o oră, afișează ecranul de „somn”
export SLEEP_SCREEN_INTERVAL=3600

# Avertisment când bateria scade sub 15%
export LOW_BATTERY_REPORTING=true
export LOW_BATTERY_THRESHOLD_PERCENT=15
