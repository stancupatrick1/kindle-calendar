# Verifică la fiecare 30 de minute, non-stop.
# Ecranul se redesenează doar când s-a schimbat ceva (vezi fetch-dashboard.sh).
export REFRESH_SCHEDULE="*/30 * * * *"
export TIMEZONE="Europe/Bucharest"

# Refresh complet (fără „fantome” pe e-ink) la fiecare 3 schimbări
export FULL_DISPLAY_REFRESH_RATE=3

# Avertisment când bateria scade sub 15%
export LOW_BATTERY_REPORTING=true
export LOW_BATTERY_THRESHOLD_PERCENT=15
