# MDR Pferdedatenbank

Webseite zur Verwaltung deiner Pferde aus [Morning Dust Ranch](https://www.morning-dust-ranch.de):
neue Pferde anlegen, bearbeiten, löschen, filtern und alle bestehenden Einträge ansehen.

- **Frontend**: statische Seite (HTML/CSS/JS ohne Build-Schritt) → gehostet über **GitHub Pages**
- **Datenbank**: [Supabase](https://supabase.com) (kostenlos), da GitHub Pages selbst keine Datenbank
  betreiben kann
- **Login**: E-Mail/Passwort über Supabase Auth, damit nicht jede*r Besucher*in deiner
  öffentlichen GitHub-Pages-Seite deine Pferdedaten sehen/ändern kann
- **Text-Import**: Pferdeseite im Spiel markieren (Strg+A), kopieren (Strg+C), in das
  Formular einfügen, "Automatisch auslesen" klicken – die erkannten Werte (Name,
  Geschlecht, Farbe, Stammbaum, Exterieur, Interieur, Disziplin- und Eigenschaftswerte
  usw.) werden ins Formular übernommen und können vor dem Speichern geprüft/korrigiert
  werden

## 1. Supabase-Projekt einrichten

1. Kostenloses Konto/Projekt auf [supabase.com](https://supabase.com) anlegen.
2. Im Projekt links auf **SQL Editor** → **New query**, den kompletten Inhalt von
   [`supabase/schema.sql`](supabase/schema.sql) einfügen und ausführen. Das legt die
   Tabelle `horses` inklusive Zugriffsregeln (Row Level Security) an.
3. Unter **Authentication → Providers** ist "Email" standardmäßig aktiv – das reicht.
4. Unter **Authentication → Users → Add user** dein eigenes Login anlegen (E-Mail +
   Passwort). Es gibt bewusst keine öffentliche Registrierung auf der Webseite, damit
   sich niemand sonst selbst ein Konto anlegen kann.
5. Unter **Project Settings → API** die **Project URL** und den **`anon` `public` Key**
   kopieren.

## 2. Zugangsdaten eintragen

In [`js/config.js`](js/config.js) die beiden Platzhalter ersetzen:

```js
const SUPABASE_CONFIG = {
  url: 'https://DEIN-PROJEKT.supabase.co',
  anonKey: 'DEIN-ANON-KEY',
};
```

Der `anon`-Key ist dafür gedacht, öffentlich im Frontend zu stehen – der eigentliche
Schutz kommt über die Row-Level-Security-Regeln (jede*r sieht nur die eigenen Pferde)
und den Login. Der **`service_role`-Key gehört niemals hierhin**.

## 3. Auf GitHub veröffentlichen

1. Neues (privates oder öffentliches) Repository auf GitHub anlegen.
2. Dieses Projektverzeichnis committen und pushen.
3. Im Repo unter **Settings → Pages** als Quelle den `main`-Branch (Ordner `/`) wählen.
4. Nach ein bis zwei Minuten ist die Seite unter der von GitHub angezeigten URL
   erreichbar.

## 4. Lokal testen (optional)

Ein einfacher lokaler Server liegt in `.claude/serve.ps1` (reines PowerShell, kein
Node/Python nötig):

```powershell
powershell -File .claude/serve.ps1
```

Danach `http://localhost:8080` im Browser öffnen.

## Benutzung

- **Anmelden** mit dem in Supabase angelegten Konto.
- **+ Neues Pferd**: Text von der Pferdeseite einfügen und automatisch auslesen lassen,
  oder alle Felder manuell ausfüllen.
- **Übersicht**: Tabelle aller Pferde mit Filtern nach Name, Rasse, Geschlecht, Ordner,
  Fellfarbe, Besitzer, Zuchtzulassung und Wert; Spaltenüberschriften klicken zum
  Sortieren.
- **Bearbeiten/Löschen**: über die Aktionen in der Tabelle bzw. auf der Detailseite.

## Grenzen des Text-Parsers

Das Spiel bietet keine offizielle Export-Funktion – der Parser (`js/parser.js`) liest
daher den sichtbaren Seitentext anhand von Textmustern aus. Das funktioniert für alle
gängigen Felder inkl. Erbkrankheiten, Farbgenetik, Exterieur, Interieur,
Disziplin-/Eigenschaftswerte und Turnierpotenzial zuverlässig. Eine Ausnahme ist der
**Stammbaum**: Da die Abstammungs-Hierarchie im kopierten Text nicht mehr erkennbar ist
(keine Einrückung), wird er nur als unsortierte Liste aller im Text gefundenen Vorfahren
gespeichert, nicht als Baum mit Vater/Mutter-Zuordnung.

Der komplette eingefügte Text wird immer zusätzlich als Rohtext gespeichert – falls das
Spiel sein Seitenlayout mal ändert und der Parser etwas falsch erkennt, geht nichts
verloren und `js/parser.js` kann entsprechend angepasst werden.
