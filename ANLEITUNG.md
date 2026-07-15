# Anleitung: MDR Pferdedatenbank

Schritt-für-Schritt-Anleitung für die komplette Webseite: jede Seite, jede
Schaltfläche und jedes Feld, dazu jeweils **welche Daten dahinterstecken**
(Datenbank-Spalte bzw. Berechnung), damit du auch nachvollziehen kannst,
*warum* etwas angezeigt wird.

## Inhalt

1. [Überblick](#1-überblick)
2. [Anmelden](#2-anmelden-loginhtml)
3. [Übersicht](#3-übersicht-indexhtml)
4. [Pferd anlegen/bearbeiten](#4-pferd-anlegenbearbeiten-horsehtml)
5. [Pferd ansehen](#5-pferd-ansehen-viewhtml)
6. [Verpaarungs-Log](#6-verpaarungs-log-verpaarunghtml)
7. [Verwaltung](#7-verwaltung-verwaltunghtml)
8. [Zucht-/Turnierplaner (extern)](#8-zucht-turnierplaner-extern)
9. [Datenmodell-Referenz](#9-datenmodell-referenz)

---

## 1. Überblick

- **Frontend**: reine HTML/CSS/JS-Seiten ohne Build-Schritt, gehostet über
  GitHub Pages.
- **Datenbank**: [Supabase](https://supabase.com) – eine einzige Tabelle
  `horses` (alle Pferde) plus `pairings` (Verpaarungs-Log) und
  `foal_reference_data` (Fohlen-Referenzwerte für den externen
  Zucht-/Turnierplaner). Jede Seite lädt/speichert direkt über
  `js/supabaseClient.js`.
- **Login**: Alle eingeloggten Konten sehen und bearbeiten **dieselbe**,
  geteilte Pferdedatenbank. Nur eine feste Admin-E-Mail-Adresse
  (`js/auth.js`, `ADMIN_EMAILS`) sieht zusätzlich die Seite „Verwaltung“.
- **Text-Parser** (`js/parser.js`): Das Spiel bietet keine offizielle
  Export-Funktion. Fast alle Felder werden daher automatisch aus dem
  kopierten Seitentext der Pferdeseite im Spiel ausgelesen – reine
  Texterkennung, „best effort“. Der komplette Rohtext wird beim Auslesen
  **nicht** dauerhaft gespeichert (nur bis zum Speichern zwischengehalten),
  damit du das Ergebnis vor dem Speichern kontrollieren kannst.

---

## 2. Anmelden (`login.html`)

**Schritt für Schritt:**
1. Benutzername (oder bei der Admin-Person die echte E-Mail-Adresse) und
   Passwort eingeben.
2. „Anmelden“ klicken.

**Was passiert dahinter:** Ein Benutzername wird intern zu
`<benutzername>@benutzer.mdr-datenbank.local` ergänzt (`resolveLoginEmail`
in `js/auth.js`), da Supabase Auth nur E-Mail-Logins kennt. Enthält die
Eingabe ein „@“, wird sie unverändert verwendet (Admin-Zugang). Neue Konten
lassen sich hier **nicht** selbst anlegen – das geht nur über die Seite
„Verwaltung“ bzw. direkt im Supabase-Dashboard.

Ist bereits eine gültige Sitzung vorhanden, leitet die Seite automatisch
zur Übersicht weiter.

---

## 3. Übersicht (`index.html`)

Startseite nach dem Login: Tabelle aller Pferde mit Filtern, Sortierung
und Mehrfachauswahl.

### 3.1 Kopfzeile

- **+ Neues Pferd** → `horse.html` (leeres Formular).
- **💞 Verpaarungs-Log** → `verpaarung.html`.
- **Zucht-/Turnierplaner ↗** → externes, separates Tool (siehe
  [Abschnitt 8](#8-zucht-turnierplaner-extern)).
- **Verwaltung** – nur sichtbar, wenn die eingeloggte E-Mail in
  `ADMIN_EMAILS` steht.
- **Abmelden**.

### 3.2 Hinweis auf fehlende Daten

Direkt unter der Kopfzeile klappt bei Bedarf ein Hinweis auf, welche
**eigenen** Pferde (Besitzer = eingeloggter Benutzername) unvollständige
Daten haben (z.B. weil beim Kopieren aus dem Spiel nicht die ganze Seite
markiert wurde). Die Prüfung läuft über `missingDataLabels()` in
`js/parser.js` und erkennt vier mögliche Lücken:

| Label | Bedingung | Bedeutet |
|---|---|---|
| Ext% | `exterior_genetics.overall.percent` fehlt | Exterieur-Genetik-Tabelle wurde nicht (vollständig) erfasst |
| Stammbaum | kein Vorfahre in `pedigree` gespeichert | Stammbaum-Abschnitt fehlte im kopierten Text |
| Turnierwerte | GP, Begabung oder nicht alle 7 Disziplin-Kategorien (je 4 Einträge) vorhanden | „Alle Disziplinen anzeigen?“ wurde im Spiel vor dem Kopieren nicht aufgeklappt |
| Rasseanteile | `purebred_pct < 100` und `breed_composition` leer | Pferd ist nicht 100% reinrassig, die Aufschlüsselung fehlt noch – **unabhängig davon, ob eine Haupt-Rasse eingetragen ist** |

Über den ✏️-Link in der Liste springst du direkt zum betroffenen Pferd.
Der Hinweiskasten selbst ist einklappbar (Klick auf die Überschrift),
startet aber standardmäßig aufgeklappt.

### 3.3 Flash-Banner

Nach dem Anlegen/Speichern eines Pferds (aus `horse.html`) erscheint hier
einmalig „„Name“ wurde neu angelegt/aktualisiert.“ (aus `sessionStorage`,
verschwindet bei der nächsten Interaktion).

### 3.4 Filter

Drei Filter-Gruppen, kombinierbar; „Filtern“ übernimmt sie, „Zurücksetzen“
leert alle Felder inkl. der beiden Mehrfachauswahl-Dropdowns.

**Suche**
- **Name** – Teiltreffer, case-insensitive (`ilike`).
- **Besitzer**, **Geschlecht** – exakte Auswahl, Optionsliste wird aus den
  tatsächlich vorkommenden Werten befüllt.
- **Rasse** – exakter Treffer auf `breed`; die Option „Rasselos“ deckt
  zusätzlich Pferde mit leerem `breed` ab (`breed.eq.Rasselos,breed.is.null`).
- **ZZL** (Zuchtzulassung) – „Ja“ = `breeding_allowed = true`; „Nein“
  schließt sowohl explizit „Nein“ als auch noch unbekannt (leer) mit ein.

**Genetik & Gesundheit** (Mehrfachauswahl-Dropdowns)
- **Genetik**: alle im Bestand vorkommenden Farbgenetik-Loci (aus `colors`)
  plus feste Zusatzoptionen „Pearl (auch Träger)“, „Flaxen (auch Träger)“,
  „Sabino“, „Roan“, „Tobiano“ (diese drei sind Teilmerkmale des
  Sammel-Locus KIT). Ein Pferd passt, wenn es das sichtbare/dominante Allel
  trägt (z.B. Champagne: Rohwert enthält „Ch“).
- **EKH** (Erbkrankheiten): Auswahl „Keine“ (= `disease_free = true`) oder
  eine der 10 testbaren Krankheiten (CA, HERDA, PSSM, EMH, ASD, HYPP, LFS,
  SCID, GBED, JEB) – ein Pferd passt, wenn der Rohwert nicht rein aus „N“
  besteht **oder** die Krankheit manuell als Träger/betroffen bestätigt
  wurde (siehe [4.5](#erbkrankheiten)).

**Leistungswerte** – GP/Ext/Ext%/Int jeweils „größer als“/„kleiner als“
ein Zahlenwert (siehe Berechnung in [Abschnitt 9](#9-datenmodell-referenz)).

### 3.5 Tabelle

Spalten: Auswahl-Checkbox, 🔗-Link (nur falls `external_id` gesetzt, führt
direkt zur Pferdeseite im Spiel), Name (Link → `view.html`), Geschlecht,
Rasse (leer wird als „Rasselos“ angezeigt), Farbe, Genetik (kompakte
Kurzfassung der vorhandenen Gene), GP, Ext, Ext%, Int, HLP/SLP (nur die
Punktzahl, „-“ bei nicht bestanden), ZZL (Ja/Nein/„-“), EKH (Liste
auffälliger Krankheiten oder „-“), Besitzer, Aktionen (✏️ Bearbeiten,
✗ Löschen).

**Sortieren**: Klick auf eine Spaltenüberschrift (Mauszeiger wird zur
Hand) sortiert danach, erneuter Klick dreht die Richtung um; auf schmalen Bildschirmen
übernehmen die Dropdowns „Sortieren“/Richtung dieselbe Funktion (Kopfzeile
ist dort ausgeblendet). Fehlende Werte landen dabei immer am Ende.

**Mehrfachauswahl**: Checkboxen je Zeile bzw. „Alle auswählen“ blenden eine
Leiste mit „Ausgewählte löschen“ ein (Popup zur Bestätigung, listet alle
betroffenen Namen einzeln auf).

**Löschen** (einzeln über ✗ oder mehrfach über die Auswahl-Leiste) ist
**endgültig** – es gibt keinen Papierkorb.

---

## 4. Pferd anlegen/bearbeiten (`horse.html`)

Dasselbe Formular für Neuanlage (`horse.html`) und Bearbeiten
(`horse.html?id=<uuid>`, per ✏️ aus der Übersicht/Ansicht erreichbar). Beim
Bearbeiten zeigt der Titel „Pferd bearbeiten“, ein „Pferd löschen“-Button
erscheint, und die Pfeile ← / → tauchen auf.

### 4.1 Text automatisch auslesen

**Schritt für Schritt:**
1. Im Spiel die Pferdeseite öffnen, komplette Seite markieren (Strg+A),
   kopieren (Strg+C).
2. Text in das Feld „Text von der Pferdeseite einfügen“ einfügen.
3. „Automatisch auslesen“ klicken.
4. Alle unten befüllten Felder **vor dem Speichern prüfen** – die
   Erkennung ist textmusterbasiert und kann bei Layout-Änderungen im Spiel
   danebenliegen.

`parseHorseText()` (`js/parser.js`) erkennt dabei: Name, Alter/Geschlecht,
Rasse, Reinrassigkeit(-%) inkl. optionaler Rasseanteile-Aufschlüsselung,
Fellfarbe, Besitzer, Erbkrankheiten-Status/-Tabelle, Zuchtzulassung,
HLP/SLP, ICO, Farbgenetik-Tabelle, Exterieur (Genetik + Körperbau),
Interieur, Disziplinen, Eigenschaften, Turnierpotenzial und den Stammbaum.
Ein noch unbenanntes Fohlen (Spielname „Unbekannt“) wird automatisch
`Fohlen_<Besitzer>_<Mutter>x<Vater>` genannt, damit nicht mehrere Fohlen
denselben Platzhalter-Namen bekommen.

Der eingeklappte Zustand des Kastens merkt sich nichts dauerhaft – beim
Bearbeiten eines bestehenden Pferds startet er eingeklappt (meist nicht
mehr gebraucht), lässt sich aber jederzeit wieder aufklappen, um erneut
auszulesen (z.B. nach einem Update im Spiel).

### 4.2 Stammdaten

| Feld | Datenbank-Spalte | Hinweis |
|---|---|---|
| Name * | `name` | Pflichtfeld. Beim Speichern wird case-insensitiv nach einem gleichnamigen Pferd gesucht – gibt es eins, wird **dieses aktualisiert** statt doppelt angelegt (verhindert Dubletten). |
| ID | `external_id` | Frei vergebbare Nummer zur eigenen Zuordnung; wird zusätzlich genutzt, um den 🔗-Link zur Pferdeseite im Spiel zu bauen (`…/index2.php?site=pferd&id=<ID>`). |
| Geschlecht | `gender` | Stute/Hengst/Wallach/Hengstfohlen/Stutfohlen. |
| Rasse | `breed` | Wird beim manuellen Eintippen wie beim Auslesen automatisch normalisiert (Kürzel wie „APH“ → „American Paint Horse“, siehe `normalizeBreed`). **Ist keine Rasse bekannt, trägt das Feld beim Laden/Auslesen automatisch „Rasselos“ ein** statt leer zu bleiben – das ist im Spiel eine echte Ausprägung, keine fehlende Angabe, und passt damit zur Anzeige/den Filtern in der Übersicht. |
| Reinrassigkeit (%) | `purebred_pct` | Steuert die Sichtbarkeit/Pflicht des Rasseanteile-Felds (siehe unten). |
| Rasseanteile | `breed_composition` | Nur sichtbar/relevant, solange die Reinrassigkeit nicht bekanntermaßen 100% ist (`purebred_pct` leer oder < 100 blendet das Feld ein). **Ist das Pferd nachweislich nicht 100% reinrassig und dieses Feld leer, warnt die Seite beim Speichern** (siehe [4.6](#46-speichern)) – unabhängig davon, ob zusätzlich eine Haupt-Rasse eingetragen ist. |
| Fellfarbe | `coat_color` | Freitext; fließt zusätzlich in die automatische Farbgenetik-Ableitung ein (z.B. „Palomino“ → Cream-Hinweis). |
| Erbkrankheiten (Auswahl) | `disease_free` | Grob-Status „frei“/„vorhanden“/unbekannt, unabhängig von der detaillierten Erbkrankheiten-Tabelle weiter unten. |

### 4.3 Verwaltung / Papiere & Zucht / Sonstiges

| Feld | Spalte |
|---|---|
| Besitzer | `owner` |
| Zuchtzulassung | `breeding_allowed` |
| HLP/SLP | `hlp_slp` |
| ICO (%) | `ico` |
| Notizen | `notes` – fließt ebenfalls in die automatische Farbgenetik-Ableitung ein |
| Bild-URL | `image_url` |

### 4.4 Erkannte Detaildaten

Erscheint nach dem Auslesen bzw. beim Laden eines bestehenden Pferds, nur
zur Ansicht (kein eigenes Formular). Reihenfolge und Inhalte:

<a id="erbkrankheiten"></a>**Erbkrankheiten** – zeigt zuerst alle
tatsächlich getesteten Krankheiten mit Rohwert (z.B. „NN/NN“ = frei).
Danach folgt für jede der 10 bekannten Krankheiten, die **nicht** getestet
wurde, eine „Nicht getestet“-Zeile mit einem Klick-Button (z.B. für junge
Fohlen ohne Tierarzt-Test): Klicken zyklisch durch **unbekannt → Träger
(1×) → betroffen/reinerbig (2×) → frei (✗) → zurück zu unbekannt**. Diese
manuelle Bestätigung landet in `disease_gene_overrides` (JSON, pro
Krankheits-Code) und zählt auch im EKH-Filter der Übersicht mit.

**Farbgenetik** – Name der Fellfarbe, dann je Genetik-Locus der Rohwert.
Bei nicht getesteten Loci zeigt die Zeile zusätzlich einen automatischen
Hinweis (aus Fellfarbe-Name/Notiz/Pferdename abgeleitet, z.B. „Palomino“ →
mindestens „Cr“; oder von einem in der Datenbank stehenden, dort
reinerbig getesteten Elternteil übernommen) **und** einen Klick-Button zur
manuellen Bestätigung (gleicher Zyklus wie bei Erbkrankheiten, aber
„vorhanden“/„nicht vorhanden“ statt „Träger“/„betroffen“) – landet in
`color_gene_overrides`. Eine manuelle Bestätigung hat immer Vorrang vor
dem automatischen Hinweis. Loci mit mehreren unabhängigen Merkmalen (KIT:
Tobiano/Sabino/Roan; Agouti: A1/At/Ap; Cream: Cr/Pearl) haben einen
eigenen Button je Merkmal. Am Ende steht eine Zusammenfassung „Vorhandene
Gene“ (getestet + manuell + abgeleitet) – das ist exakt die Kurzfassung,
die auch in der Übersichtsspalte „Genetik“ erscheint.

**Exterieur (Genetik)** – Genotyp je Körperteil plus errechnetem Score
(„X/16“) und daraus dem Exterieur-Gesamtwert in % (das ist der Wert
hinter „Ext%“).

**Exterieur (Körperbau)** – beschreibende Bewertung je Körperteil
(„exzellent“ … „viel zu klein“ usw.) plus Durchschnitt auf einer Skala 1–5
(das ist der Wert hinter „Ext“).

**Interieur (Mentalität)** – analog, Skala 1 (exzellent) bis 4 (schlecht),
Durchschnitt = „Int“.

**Turnierpotenzial** – GP (Gesamtpotenzial), Begabung, und die daraus
abgeleitete Hauptdisziplin-Kategorie (z.B. „Western“ für die Begabung
„Trail“).

**Disziplinen / Eigenschaften** – je Kategorie eine Tabelle mit
Potenzial-% (Disziplinen zusätzlich mit aktuellem Trainingsstand).

**Stammbaum** – Vorfahren in der Reihenfolge des kopierten Texts,
gruppiert in Eltern/Großeltern/Urgroßeltern/weitere Vorfahren. **Wichtig:**
Der Text enthält keine Einrückung, daher lässt sich daraus **keine**
Baumstruktur (wer ist wessen Vater/Mutter) rekonstruieren – nur die reine
Reihenfolge. Die ersten beiden Einträge sind aber laut Spiel immer
zuverlässig Vater, dann Mutter.

### 4.5 Navigation

- **← / →** (nur beim Bearbeiten): speichert das aktuelle Pferd wie der
  normale Speichern-Button und springt danach direkt zum alphabetisch
  vorherigen/nächsten **eigenen** Pferd (Besitzer = eingeloggter
  Benutzername) – zum zügigen Durcharbeiten einer ganzen Liste ohne Umweg
  über die Übersicht.
- **Pferd löschen** (nur beim Bearbeiten) – endgültig, mit
  Bestätigungsdialog.

### 4.6 Speichern

Beim Klick auf „Speichern“ (bzw. bei ← / →) prüft die Seite zuerst, ob
Daten fehlen (siehe die vier Warnungen aus [3.2](#32-hinweis-auf-fehlende-daten)).
Trifft eine davon zu, öffnet ein Popup mit der Liste der fehlenden Punkte
– „Zurück zur Bearbeitung“ bricht ab, „Trotzdem speichern“ speichert
unverändert weiter. Ohne Warnung wird direkt gespeichert. Der Rohtext aus
dem Einfüge-Feld wird dabei **nie** dauerhaft gespeichert (`raw_text` wird
vor dem Schreiben auf `null` gesetzt) – nur das daraus erkannte Ergebnis.

---

## 5. Pferd ansehen (`view.html`)

Reine Lesansicht (alle Felder `readonly`/`disabled`), erreichbar über
einen Klick auf den Namen in der Übersicht.

- **✏️ Bearbeiten** → `horse.html?id=…`.
- **🔗 Zum Pferd** – nur sichtbar, wenn `external_id` gesetzt ist, öffnet
  die Pferdeseite im Spiel in einem neuen Tab.
- **🗑️ Löschen** – wie in der Übersicht, endgültig.
- **← / →** – blättert alphabetisch durch **alle** Pferde (nicht nur die
  eigenen wie beim Bearbeiten), da man beim reinen Ansehen nicht auf den
  eigenen Bestand beschränkt sein soll.
- Zeigt dieselben „Erkannten Detaildaten“ wie das Bearbeiten-Formular
  (siehe [4.4](#44-erkannte-detaildaten)), allerdings ohne Klick-Buttons
  für die Gen-/Erbkrankheiten-Bestätigung (nur Anzeige).

---

## 6. Verpaarungs-Log (`verpaarung.html`)

Protokolliert Decksprünge (Deckhengst × Stute), unabhängig von den
eigentlichen Pferde-Datensätzen.

### 6.1 Neue Verpaarung eintragen

**Schritt für Schritt:**
1. Deckhengst und Stute eintragen (Pflichtfelder, mit Namens-Vorschlägen
   aus der Pferdedatenbank – aber reiner Freitext, auch Pferde außerhalb
   dieser Datenbank sind möglich).
2. Optional Abfohldatum, „Fohlen behalten?“ (Ja/Nein/unbekannt), Besitzer
   (vorbelegt mit dem eigenen Benutzernamen), Notizen.
3. „Eintragen“.

Wird „Fohlen behalten?“ dabei direkt auf Ja **oder** Nein gesetzt (nicht
„unbekannt“), öffnet sich sofort das Fohlen-Popup (siehe 6.3).

### 6.2 Tabelle

Spalten: Deckhengst, Stute, Rasse (aus den Namen der beiden abgeleitet,
falls sie als eigene Pferde in der Datenbank stehen), Abfohldatum,
„Fohlen behalten?“ (zwei Buttons ✓/✗, direkt anklickbar), Notizen,
Besitzer, Aktionen. Sortierbar per Klick auf Deckhengst/Stute/Abfohldatum.
Filter: Besitzer (standardmäßig der eigene Benutzername) und Rasse (client-
seitig über den Namensabgleich, da Deckhengst/Stute keine feste Verknüpfung
zu einem Pferde-Datensatz haben).

**„Fohlen behalten?“ nachträglich setzen/ändern**: Klick auf ✓ oder ✗.
War der Wert vorher unbekannt, öffnet sich danach automatisch das
Fohlen-Popup (z.B. für Verpaarungen, die der externe Zucht-/Turnierplaner
per „Decksprung“-Button automatisch ohne Wert angelegt hat).

**Abfohldatum bearbeiten**: „Bearbeiten“ öffnet eine einfache
Eingabeaufforderung (Format JJJJ-MM-TT, leer = entfernen).

**Löschen**: endgültig, mit Bestätigung.

### 6.3 Fohlen-Popup

Nutzt dasselbe Formular wie „Pferd anlegen“ (identische Felder, siehe
[Abschnitt 4](#4-pferd-anlegenbearbeiten-horsehtml) inkl. Text-Parser und
Rasseanteile-Logik), aber mit eigenem Speichern-Ziel:

- **„Fohlen behalten“ = Ja**: Wird als **echtes neues Pferd** in `horses`
  gespeichert (bzw. ein bestehendes aktualisiert, falls der Name schon
  existiert). Zusätzlich prüft die Seite über den Stammbaum, ob bereits
  ein Pferd mit genau diesem Vater/dieser Mutter existiert (z.B. ein
  vorher automatisch als „Fohlen_…“ angelegtes Fohlen, das jetzt unter
  seinem echten Namen erneut eingetragen wird) – falls ja, fragt ein
  Popup nach, ob es sich um dasselbe Pferd handelt, und aktualisiert dann
  statt neu anzulegen.
- **„Fohlen behalten“ = Nein**: Wird **nicht** als Pferd gespeichert,
  sondern nur als Referenzdatensatz in `foal_reference_data` – reine
  Statistik-Grundlage für die Fohlenwert-Schätzung im externen
  Zucht-/Turnierplaner. Kann jederzeit übersprungen werden.

„Überspringen“ schließt das Popup ohne zu speichern.

---

## 7. Verwaltung (`verwaltung.html`)

Nur für die Admin-Person sichtbar (feste E-Mail-Adresse in
`ADMIN_EMAILS`). Enthält **keine** eigene Funktion, sondern eine
Schritt-für-Schritt-Anleitung, um im Supabase-Dashboard (verlinkt)
Benutzerkonten anzulegen/zu löschen bzw. Passwörter zurückzusetzen – neue
Konten lassen sich aus der Web-App selbst heraus nicht anlegen.

---

## 8. Zucht-/Turnierplaner (extern)

Verlinkt aus Kopfzeile/Übersicht/Verwaltung, führt zu einem **separaten
Repository** (`mdr-planer`). Greift rein lesend (kein Login) auf dieselbe
Supabase-Datenbank zu und wird von dieser Anleitung nicht mit abgedeckt –
siehe dessen eigene Dokumentation.

---

## 9. Datenmodell-Referenz

Die vier „Leistungswerte“-Spalten in Übersicht/Filter existieren **nicht**
als eigene Datenbank-Spalten, sondern werden bei jedem Laden aus den
gespeicherten JSON-Feldern neu berechnet (`computeDerived()` in
`js/list.js`, dieselbe Logik wie in `js/horseForm.js`):

| Anzeige | Berechnung |
|---|---|
| **GP** | `tournament_potential.Gesamtpotenzial`, direkt aus dem Turnierpotenzial-Textblock übernommen |
| **Ext** | Durchschnitt der Körperbau-Bewertungen (`exterior_descriptive`) auf der Skala 1 (exzellent) – 5 (viel zu …) |
| **Ext%** | `exterior_genetics.overall.percent` – errechnet aus den 16-Zeichen-Genotypen je Körperteil |
| **Int** | Durchschnitt der Mentalitäts-Bewertungen (`temperament`) auf der Skala 1 (exzellent) – 4 (schlecht) |
| **Genetik** (Übersichtsspalte) | Kurzfassung aller vorhandenen Gene aus `presentGenesSummary()`: getestete Loci + manuelle Bestätigungen (`color_gene_overrides`) + aus Fellfarbe/Notiz/Name abgeleitete Hinweise |

Alle übrigen Anzeige-Felder entsprechen 1:1 einer Spalte der `horses`-
Tabelle (siehe `supabase/schema.sql`); die wichtigsten stehen bereits in
den Tabellen weiter oben bei den jeweiligen Formularfeldern.
