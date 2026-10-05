#!/usr/bin/env bash
# Stellt den pm2-Prozess des Bots von einer alten, getrennten Kopie (z.B.
# ~/discord-bot) auf das Git-Repo (~/mdr-datenbank/discord-bot) um, damit
# "git pull" + "pm2 restart" kuenftig wirklich den laufenden Code aktualisiert.
#
# Aufruf auf dem Server:   bash ~/mdr-datenbank/discord-bot/scripts/umstellen-auf-repo.sh
# Optional: <alte-kopie> <repo-bot-ordner> <pm2-name> als Argumente.
#
# Ablauf: erst alles Vorbereitende (Sicherung, .env und data/ uebernehmen,
# Abhaengigkeiten installieren), dann erst pm2 umstellen. Startet der Bot aus
# dem Repo nicht sauber, wird automatisch wieder die alte Kopie gestartet.
# Geheimnisse (.env-Werte) werden nie ausgegeben.
set -euo pipefail

OLD="${1:-$HOME/discord-bot}"
NEW="${2:-$HOME/mdr-datenbank/discord-bot}"
APP="${3:-mdrdb-bot}"
TS="$(date +%Y%m%d-%H%M%S)"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nABBRUCH: %s\n' "$*" >&2; exit 1; }

[ -d "$OLD" ] || die "Alte Kopie nicht gefunden: $OLD"
[ -d "$NEW" ] || die "Repo-Ordner nicht gefunden: $NEW"
# pwd -P loest Verknuepfungen (Symlinks) auf - ist die "alte Kopie" nur ein
# Link auf den Repo-Ordner, laeuft der Bot bereits aus dem Repo.
if [ "$(cd "$OLD" && pwd -P)" = "$(cd "$NEW" && pwd -P)" ]; then
  printf '\nNichts umzustellen: %s ist derselbe Ordner wie %s (Verknuepfung).\n' "$OLD" "$NEW"
  printf 'Der Bot laeuft bereits aus dem Repo. Zum Aktualisieren genuegt:\n  cd ~/mdr-datenbank && git pull && pm2 restart %s\n' "$APP"
  exit 0
fi
[ -f "$OLD/.env" ] || die "Keine .env in $OLD gefunden."
command -v pm2 >/dev/null || die "pm2 nicht gefunden."
command -v npm >/dev/null || die "npm nicht gefunden."

say "1/6 Repo aktualisieren"
git -C "$NEW/.." pull --ff-only
printf 'Stand: %s\n' "$(git -C "$NEW/.." log --oneline -1)"

say "2/6 Sicherung der alten Kopie"
cp -a "$OLD" "${OLD}.sicherung-$TS"
printf 'Gesichert nach: %s\n' "${OLD}.sicherung-$TS"

say "3/6 .env uebernehmen (die alte Kopie laeuft produktiv, daher gilt ihre .env)"
if [ -f "$NEW/.env" ]; then
  # Nur Schluessel + "gleich/abweichend" melden, nie Werte.
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    a="$(grep -E "^${key}=" "$OLD/.env" | head -1 | sha256sum | cut -c1-16 || true)"
    b="$(grep -E "^${key}=" "$NEW/.env" | head -1 | sha256sum | cut -c1-16 || true)"
    if [ "$a" = "$b" ]; then printf '  %-28s gleich\n' "$key"; else printf '  %-28s ABWEICHEND (alte Kopie wird uebernommen)\n' "$key"; fi
  done < <(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$OLD/.env")
  # Sicherungskopie ausserhalb des Repo-Ordners (nicht versehentlich committen).
  cp -a "$NEW/.env" "$HOME/.env.mdrdb-bot.vor-umstellung-$TS"
fi
# Ist es ohnehin dieselbe Datei (Verknuepfung/Hardlink), gibt es nichts zu kopieren.
if [ ! "$OLD/.env" -ef "$NEW/.env" ]; then
  cp -a "$OLD/.env" "$NEW/.env"
fi
chmod 600 "$NEW/.env"

say "4/6 data/ (Server-/Kanal-Einstellungen, Registrierungen) uebernehmen"
if [ -d "$NEW/data" ] && [ -n "$(ls -A "$NEW/data" 2>/dev/null)" ]; then
  # Gesichert ausserhalb des Repo-Ordners (data/ ist dort ignoriert, Kopien mit anderem Namen waeren es nicht).
  mv "$NEW/data" "$HOME/mdrdb-bot-data.vor-umstellung-$TS"
  printf '  vorhandenes data/ im Repo-Ordner gesichert als ~/mdrdb-bot-data.vor-umstellung-%s\n' "$TS"
fi
if [ -d "$OLD/data" ]; then
  # Inhalt kopieren ("/." statt Ordner), sonst entsteht data/data, falls data/ schon (leer) existiert.
  mkdir -p "$NEW/data"
  cp -a "$OLD/data/." "$NEW/data/"
  ls -1 "$NEW/data" | sed 's/^/  uebernommen: /'
else
  mkdir -p "$NEW/data"
  echo "  (alte Kopie hatte kein data/ - leer angelegt)"
fi

say "5/6 Abhaengigkeiten installieren"
( cd "$NEW" && { npm ci --omit=dev || npm install --omit=dev; } )

say "6/6 pm2 umstellen"
pm2 delete "$APP" >/dev/null 2>&1 || true
start_ok=0
if pm2 start "$NEW/src/index.js" --name "$APP" --cwd "$NEW"; then
  sleep 8
  if pm2 describe "$APP" 2>/dev/null | grep -qE "status +│ +online"; then start_ok=1; fi
fi

if [ "$start_ok" -ne 1 ]; then
  printf '\nDer Bot startet aus dem Repo NICHT sauber - stelle die alte Kopie wieder her.\n' >&2
  pm2 logs "$APP" --lines 20 --nostream || true
  pm2 delete "$APP" >/dev/null 2>&1 || true
  pm2 start "$OLD/src/index.js" --name "$APP" --cwd "$OLD"
  pm2 save
  die "Zurueckgerollt auf $OLD. Meldung oben (Log) an Claude schicken."
fi

pm2 save
say "Fertig"
pm2 describe "$APP" | grep -E "script path|exec cwd|status|restarts"
pm2 logs "$APP" --lines 5 --nostream || true
printf '\nDie alte Kopie bleibt unveraendert in %s (plus Sicherung %s.sicherung-%s).\n' "$OLD" "$OLD" "$TS"
printf 'Kuenftig reicht:  cd ~/mdr-datenbank && git pull && pm2 restart %s\n' "$APP"
printf 'Hat sich nur der Slash-Befehl geaendert:  cd ~/mdr-datenbank/discord-bot && node deploy-commands.js\n'
