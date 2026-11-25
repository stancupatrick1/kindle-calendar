#!/usr/bin/env sh
# Descarcă imaginea (generată pe loc de Netlify) și o afișează DOAR dacă s-a schimbat ceva.
# Înlocuiește SITE și CHEIE cu ale tale.
URL="https://SITE.netlify.app/dashboard.png?k=CHEIE"

DIR="$(dirname "$0")"
NEW="$1.new"

"$DIR/../xh" -d -q -o "$NEW" get "$URL" || { rm -f "$NEW"; exit 1; }

# imagine identică => cod != 0, iar kindle-dash nu redesenează ecranul
if [ -f "$1" ] && cmp -s "$NEW" "$1"; then
  rm -f "$NEW"
  echo "Nimic nou, ecranul rămâne la fel"
  exit 2
fi

mv "$NEW" "$1"
