# MDR Discord-Bot (`/mdrdb`)

Discord-Bot fuer die [MDR Pferdedatenbank](../README.md):

- **`/mdrdb pferd`** durchsucht per Autocomplete-Dropdown die Pferdenamen und
  postet Steckbrief (Rasse/Geschlecht/Farbe), Farbgenetik, Leistungswerte
  (GP/Ext/Ext%/Int) und Besitzer in den Chat. Danach oeffnet sich ein
  privates Auswahlmenue, mit dem sich zusaetzlich Eltern, Geschwister/
  Halbgeschwister oder Nachkommen des Pferds oeffentlich in den Kanal posten
  lassen - das Menue bleibt offen, bis "4 - fertig" gewaehlt wird.
- **`/mdrdb-rassen`** (nur Server-Administrator*innen) legt fest, welche
  Rassen auf diesem Server ueberhaupt durchsuchbar sind (Mehrfachauswahl,
  keine Auswahl = keine Einschraenkung, alle Rassen).
- **`/mdrdb-kanal`** (nur Server-Administrator*innen) legt pro Kanal zwei
  unabhaengige Filter fest: Zuchtzulassung (alle / nur ohne ZZL, z.B. fuer
  einen "Fohlen"-Kanal / nur mit ZZL) und Geschlecht (Mehrfachauswahl aus
  Stute/Hengst/Wallach, keine Auswahl = alle Geschlechter - "Stute"
  schliesst automatisch Stutfohlen mit ein, "Hengst" entsprechend
  Hengstfohlen, siehe GENDER_GROUPS in `src/filters.js`). Beide Filter
  lassen sich unabhaengig voneinander setzen und gelten gleichzeitig
  (UND-verknuepft).
- **`/mdrdb-tag`** listet alle Pferde mit einem bestimmten Schlagwort
  (Verkauf/Reserviert/Bleibt/GBH) auf, optional per
  Namensausschnitt eingegrenzt.
- **`/mdrdb-verkaufen`** (nur der/die aktuelle Besitzer*in laut
  Besitzer-Feld, oder der Bot-Owner) markiert ein Pferd mit dem Schlagwort
  "Verkauf" inkl. Kaeufer-Notiz. Aendert **nicht** das Besitzer-Feld - das
  Pferd gehoert bis zur eigentlichen Uebergabe weiter der verkaufenden
  Person.
- **`/mdrdb-besitzer`** (nur der/die aktuelle Besitzer*in, oder der
  Bot-Owner) aendert das Besitzer-Feld eines Pferdes und entfernt dabei
  automatisch ein vorhandenes "Verkauf"-Schlagwort, da der Verkauf damit
  abgeschlossen ist.
- **`/mdrdb hilfe`** zeigt eine Uebersicht aller Befehle.

`/mdrdb-rassen` und `/mdrdb-kanal` sind bewusst eigene Befehle (nicht
Unterbefehle von `/mdrdb`) und ueber `setDefaultMemberPermissions`
(Administrator) registriert - Discord blendet sie damit fuer normale
Mitglieder in der Befehlsliste komplett aus, nicht nur beim Ausfuehren.
Server-Admins koennen das ueber die Server-Einstellungen unter
"Integrationen" bei Bedarf fuer weitere Rollen freigeben; der Bot prueft
die Berechtigung zusaetzlich selbst als zweite Absicherung.

Alle Einschraenkungen gelten sowohl fuer die Autocomplete-Vorschlaege als
auch beim Nachschlagen eines exakt eingetippten Namens - man kann sie also
nicht durch Eintippen eines nicht vorgeschlagenen Namens umgehen. Per
Standard ist nichts eingeschraenkt (alle Pferde sichtbar) - "rassen"/
"kanal" dienen nur dazu, die Anzeige bei Bedarf einzugrenzen. Die
Einstellungen werden lokal in `data/settings.json` gespeichert (nicht in
Supabase, da reine Bot-Konfiguration) und ueberleben einen Neustart des
Bots.

Fuer alle Lese-Befehle greift der Bot mit demselben `anon`-Key wie die
Weboberflaeche zu (siehe
[`../supabase/migration_005_public_read_access.sql`](../supabase/migration_005_public_read_access.sql)).
Nur `/mdrdb-verkaufen` und `/mdrdb-besitzer` schreiben Daten - dafuer nutzt
der Bot den separaten, geheimen `SUPABASE_SERVICE_ROLE_KEY` (siehe Schritt 2
und `src/supabaseServiceClient.js`), NICHT den oeffentlichen `anon`-Key. So
bleibt Schreibzugriff exklusiv ueber den Bot moeglich (mit eigener
Berechtigungspruefung, siehe `requireHorseOwner` in `src/index.js`), ohne
dass jede*r mit dem oeffentlichen `anon`-Key (der bereits im Frontend-Code
der Hauptseite steht) ebenfalls schreiben koennte.

## 1. Discord-Bot-Application anlegen

1. Auf [discord.com/developers/applications](https://discord.com/developers/applications)
   einloggen und **New Application** klicken, einen Namen vergeben (z.B.
   "MDR Datenbank").
2. Im Reiter **Bot** (links) auf **Reset Token** bzw. **Add Bot** klicken, um
   einen Token zu erzeugen, und mit **Copy** kopieren - das ist dein
   `DISCORD_TOKEN`. Diesen Token niemals teilen oder committen.
3. Unter **General Information** die **Application ID** kopieren - das ist
   dein `CLIENT_ID`.
4. Im Reiter **OAuth2 → URL Generator**: Scope **bot** und **applications.commands**
   ankreuzen, bei den Bot-Permissions reicht **Send Messages** und
   **Use Slash Commands** (Embeds werden automatisch mitgesendet). Die
   generierte URL am Ende der Seite oeffnen und den Bot auf deinen Server
   einladen.
5. (Optional, fuer sofortige Verfuegbarkeit waehrend der Einrichtung) Server-ID
   kopieren: in Discord unter Einstellungen → Erweitert → **Entwicklermodus**
   aktivieren, dann Rechtsklick auf den Servernamen → **ID kopieren** - das
   ist deine `GUILD_ID`.

## 2. Einrichten

```powershell
cd discord-bot
npm install
copy .env.example .env
```

`.env` ausfuellen:

- `DISCORD_TOKEN`, `CLIENT_ID`, optional `GUILD_ID` (siehe oben)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` - dieselben Werte wie in
  [`../js/config.js`](../js/config.js) (Supabase-Dashboard → Project
  Settings → API)
- `SUPABASE_SERVICE_ROLE_KEY` (optional, nur fuer `/mdrdb-verkaufen` und
  `/mdrdb-besitzer` noetig) - Supabase-Dashboard → Project Settings → API →
  Abschnitt "Project API keys" → **`service_role`** **secret** (nicht der
  `anon`/`public` Key!). Diesen Wert niemals ins Frontend/GitHub Pages
  einbauen oder committen - er umgeht alle Lese-/Schreibeinschraenkungen
  (RLS) der Datenbank vollstaendig. Ohne diesen Eintrag startet der Bot
  trotzdem, zeigt bei `/mdrdb-verkaufen`/`/mdrdb-besitzer` aber eine
  Fehlermeldung.

## 3. Slash-Command registrieren

```powershell
npm run deploy-commands
```

Mit gesetzter `GUILD_ID` ist `/mdrdb` sofort auf diesem Server verfuegbar,
sonst dauert die globale Registrierung bis zu einer Stunde. Dieser Schritt
muss nach jedem Update der Befehlsstruktur (z.B. neue Unterbefehle) erneut
ausgefuehrt werden.

## 4. Bot starten

```powershell
npm start
```

Der Bot muss dauerhaft laufen, damit `/mdrdb` funktioniert (z.B. auf einem
eigenen Rechner/NAS, einem VPS oder einem Hosting-Dienst wie Railway/Render -
einfach `npm install` und `npm start` dort ausfuehren; `.env` nicht mit
hochladen, sondern die Variablen im jeweiligen Dienst als Umgebungsvariablen
setzen).

## Berechnung pruefen (optional, ohne Discord)

```powershell
node scripts/check-horse.js "Pferdename"
```

Laedt ein echtes Pferd aus Supabase und gibt die berechneten Werte
(GP/Ext/Ext%/Int/Farbgenetik, Eltern-Namen) auf der Konsole aus - zum
Abgleich mit der Detailansicht auf `horse.html` fuer dasselbe Pferd.

## Hinweise zur Datengrundlage

- Alle Kennzahlen (GP/Ext/Ext%/Int/Farbgenetik) werden identisch zur
  Weboberflaeche berechnet (siehe [`../js/list.js`](../js/list.js) und
  [`../js/parser.js`](../js/parser.js)) - `src/mdrGenetics.js` und
  `src/horseStats.js` sind bewusste 1:1-Portierungen dieser Logik und muessen
  bei Aenderungen an der Berechnung im Hauptrepo manuell nachgezogen werden.
- Eltern/Geschwister/Nachkommen werden ueber Namensabgleich im Stammbaum
  ermittelt (Vater = erster, Mutter = zweiter Stammbaum-Eintrag), nicht ueber
  eine feste DB-Relation - siehe Kommentare in `src/pedigree.js`. Das ist
  zuverlaessig, solange Pferdenamen eindeutig sind (per DB-Constraint der
  Fall), aber abhaengig davon, dass der Stammbaum beim Anlegen korrekt erfasst
  wurde.
