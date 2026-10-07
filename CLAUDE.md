# MDR Pferdedatenbank – Hinweise für Claude

Statische Web-App (kein Build-Schritt, GitHub Pages) mit Supabase-Backend. Dazu
`discord-bot/` (Node.js). Schwesterprojekt: `mdr-planer` (Planer-Werkzeuge) –
beide nutzen **dasselbe** Supabase-Projekt und dasselbe Egress-Kontingent.

## Zusammenarbeit
- Antworten auf Deutsch, kurz. Nichts behaupten, was nicht geprüft wurde; Annahmen als solche benennen.
- Tests: `node --test tests/parser.test.js` (reine Funktionen aus `js/parser.js`). Seiten lassen sich mit Playwright/Chromium und einem Supabase-Mock prüfen (CDN-Skript per Route ersetzen).
- In `vm`-Tests sind top-level `let`/`const` nicht von außen setzbar – per `vm.runInContext('name = wert;')` im selben Kontext zuweisen.

## Deploy
- Entwicklung auf dem Arbeitsbranch, dann nach `main` bringen (z.B. temp-Branch von `origin/main`, `git cherry-pick`, `git push origin temp:main`). `main` = live (GitHub Pages).
- Datenbank-Migrationen (`supabase/migration_*.sql`) führt der Nutzer **manuell** im Supabase-SQL-Editor aus – immer dazusagen, wenn eine neu ist (offen: `migration_045_app_settings.sql`, `migration_046_updated_at_nur_bei_echten_aenderungen.sql` (ausgeführt), `migration_047_relatedness_gezielt_markieren.sql`).
- Discord-Bot-Änderungen greifen erst nach `git pull` + Neustart auf dem Server (per SSH, vom Nutzer).
- Edge Function `supabase/functions/recompute-relatedness`: Änderungen greifen erst nach `supabase functions deploy recompute-relatedness` (vom Nutzer, nicht von `main`/GitHub Pages).
- Supabase-Domain ist aus der Claude-Sitzung nicht erreichbar (Netzwerk-Policy) – keine Live-Daten abrufbar; bei Datenfragen den Nutzer um Beispieltext/Screenshot bitten.

## Vorgaben des Nutzers (gelten dauerhaft)
- **Update-Texte** für Mitzüchter: Discord-Formatierung (`#`/`##`, `**fett**`, `-` Listen), im Kopierblock, auf Nachrichten à max. 2000 Zeichen verteilt, **ohne Admin-Themen** (Verwaltung, Migrationen, Cron, Egress, Bot-Technik, Admin-Schalter) und ohne Emojis.
- **Verwaltung**: Prüfungen laufen nur auf Klick auf „Erneut prüfen“, nie automatisch beim Öffnen; beim Öffnen wird keine Pferdeliste geladen.
- **Bilder** werden nicht in den Supabase-Speicher hochgeladen: beim Seiten-Paste bleibt nur der Bildlink aus dem Spieltext in `image_url` (kein Upload).
- Eingefügter Spieltext (`horses.raw_text`) wird gespeichert; global abschaltbar per Admin-Schalter in den Einstellungen (`app_settings.store_raw_text`).
- Discord-Bot: Farbe/Genetik so anzeigen wie die Übersicht (`presentGenesSummary` inkl. Eltern-Bezug) – nicht eigenständig neu erfinden.
- Filter mit Dreifach-Zustand (Klick = nur diese, 2. Klick = ausschließen, 3. = neutral) bei Schlagwörtern, Rassen, Farbwünschen.

## Technische Regeln
- **Egress sparen**: keine `select('*')` für Massenabrufe, explizite Spaltenlisten (ohne `raw_text`); Bestand einmal laden und im Speicher filtern/sortieren.
- Seitenweise Abrufe (`fetchAllRows`) immer mit stabiler Sortierung (macht die Funktion selbst per `id`).
- Geschlecht nie per exaktem Text vergleichen – `genderGroup()` nutzen.
- Stammbaum-Prüfung (`findPedigreeSuspects` in `js/parser.js`): Treffer nur, wenn Name = Rasse-Wert UND Rasse-Feld kein Rasse-Wert, mindestens 2 Treffer je Stammbaum; Rasse-Werte nur aus `horses.breed`, nie aus Vorfahren-Feldern.
- `discord-bot/src/mdrGenetics.js` ist ein manuell synchron zu haltender Port aus `js/parser.js`.
