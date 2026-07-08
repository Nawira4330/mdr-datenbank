# MDR Pferdedatenbank

Webseite zur Verwaltung deiner Pferde aus [Morning Dust Ranch](https://www.morning-dust-ranch.de):
neue Pferde anlegen, bearbeiten, löschen, filtern und alle bestehenden Einträge ansehen.

- **Frontend**: statische Seite (HTML/CSS/JS ohne Build-Schritt) → gehostet über **GitHub Pages**
- **Datenbank**: [Supabase](https://supabase.com) (kostenlos), da GitHub Pages selbst keine Datenbank
  betreiben kann
- **Login**: Benutzername/Passwort über Supabase Auth, damit nicht jede*r Besucher*in
  deiner öffentlichen GitHub-Pages-Seite deine Pferdedaten sehen/ändern kann. Die
  Admin-Person (Projekteigentümer*in) meldet sich stattdessen mit ihrer echten
  E-Mail-Adresse an (siehe "Benutzerkonten anlegen" unten). Alle eingeloggten Konten
  sehen und bearbeiten dieselbe, geteilte Pferdedatenbank - nur das **Anlegen neuer
  Konten** bleibt exklusiv der Admin-Person vorbehalten (im Supabase-Dashboard, nicht
  in der App)
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
4. Dein eigenes Admin-Login anlegen (siehe "Benutzerkonten anlegen" unten) – mit deiner
   echten E-Mail-Adresse.
5. Unter **Project Settings → API** die **Project URL** und den **`anon` `public` Key**
   kopieren.

### Benutzerkonten anlegen

Es gibt bewusst keine öffentliche Registrierung auf der Webseite – neue Konten legst du
selbst im Supabase-Dashboard unter **Authentication → Users → Add user** an:

- **Admin-Zugang (nur für dich)**: E-Mail = deine echte Adresse (z.B.
  `deine-adresse@example.com`), dazu ein Passwort. Auf der Login-Seite meldest du dich
  mit genau dieser E-Mail-Adresse an.
- **Benutzername-Zugang (für andere)**: E-Mail =
  `<gewünschter-benutzername>@benutzer.mdr-datenbank.local` (die Domain ist frei
  erfunden, muss aber genau so geschrieben werden), dazu ein Passwort. Die Person meldet
  sich auf der Login-Seite mit `<gewünschter-benutzername>` (ohne die `@...`-Domain) und
  diesem Passwort an.

Die Webseite erkennt am `@`-Zeichen in der Eingabe, ob es sich um eine echte
E-Mail-Adresse oder einen Benutzernamen handelt, und meldet entsprechend an. Ob danach
der "Verwaltung"-Bereich sichtbar ist, hängt aber **nicht** vom `@`-Zeichen ab, sondern
von einer festen Liste in [`js/auth.js`](js/auth.js) (`ADMIN_EMAILS`) – nur diese
E-Mail-Adresse(n) gelten als Admin. Legst du versehentlich für eine andere Person ein
Konto mit einer echten E-Mail statt der Benutzername-Domain an, sieht diese Person die
Verwaltung trotzdem nicht, solange ihre Adresse nicht in `ADMIN_EMAILS` steht.

## 2. Zugangsdaten eintragen

In [`js/config.js`](js/config.js) die beiden Platzhalter ersetzen:

```js
const SUPABASE_CONFIG = {
  url: 'https://DEIN-PROJEKT.supabase.co',
  anonKey: 'DEIN-ANON-KEY',
};
```

Der `anon`-Key ist dafür gedacht, öffentlich im Frontend zu stehen – der eigentliche
Schutz kommt über die Row-Level-Security-Regeln (nur eingeloggte Konten haben
überhaupt Zugriff, dafür aber auf alle Pferde gemeinsam) und den Login. Der
**`service_role`-Key gehört niemals hierhin**.

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
