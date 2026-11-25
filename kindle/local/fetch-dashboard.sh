#!/usr/bin/env sh
# Descarcă imaginea și o afișează DOAR dacă s-a schimbat ceva
# (eveniment nou/modificat, zi nouă, fază a lunii, prognoză).
# Înlocuiește USER, REPO și NUME_SECRET.
URL="https://USER.github.io/REPO/NUME_SECRET.png"

DIR="$(dirname "$0")"
NEW="$1.new"

"$DIR/../xh" -d -q -o "$NEW" get "$URL" || { rm -f "$NEW"; exit 1; }

# imagine identică => ieșim cu cod != 0, iar kindle-dash nu redesenează ecranul
if [ -f "$1" ] && cmp -s "$NEW" "$1"; then
  rm -f "$NEW"
  echo "Nimic nou în calendar, ecranul rămâne la fel"
  exit 2
fi

mv "$NEW" "$1"
