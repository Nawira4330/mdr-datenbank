# Update-Log: MDR Pferdedatenbank

Was sich an der Datenbank geändert hat, neueste Änderungen zuerst. Rein
interne Aufräumarbeiten ohne sichtbaren Effekt stehen hier nicht mit
drin.

---

## 08.08.2026 (2)

- **Schlagwort „Gnadenbrot" in „GBH" umbenannt** – gilt auch für bereits
  vergebene Schlagwörter (per Migration nachträglich umbenannt) sowie
  für den Discord-Bot.

---

## 08.08.2026

- **Pferdebild wird jetzt angezeigt**: auf der Ansichtsseite groß über
  den Stammdaten, im Bearbeiten-Formular als kleine Vorschau direkt unter
  dem Bild-URL-Feld - vorher stand dort nur der reine Link.
- **Zuletzt bearbeitet**: neue Spalte in der Übersicht (auch als
  Sortieroption) sowie Anzeige auf der Ansichtsseite, wann ein Pferd
  zuletzt geändert wurde.
- **Alter / Geburtsdatum**: neues Feld „Geburtsdatum“ im
  Bearbeiten-Formular, wird beim automatischen Auslesen aus dem
  kopierten Spieltext direkt mit übernommen. Übersicht und Ansichtsseite
  berechnen und zeigen daraus automatisch das Alter in Spieljahren
  (30 reale Tage = 1 Spieljahr im Spiel).
- **Schlagwort-Filter „Kein Schlagwort“**: findet jetzt auch Pferde ganz
  ohne Schlagwort, nicht nur Pferde mit einem bestimmten Schlagwort.
- **„Nach oben“-Pfeil** in der Übersicht, erscheint sobald gescrollt
  wurde.
- **Ø-Vergleich nach Geschlecht**: die Vergleichsbasis für den
  Ø-Vergleich in der Übersicht lässt sich jetzt zusätzlich nach
  Geschlecht einschränken (wie bereits bei Rasse/ZZL/Besitzer).
- **Durchschnittsrechner nach Schlagwörtern**: der Durchschnittsrechner
  lässt sich jetzt zusätzlich nach Schlagwörtern filtern (Mehrfachauswahl,
  „Kein Schlagwort“ inklusive) – wie beim Schlagwort-Filter in der
  Übersicht.

---

## 04.08.2026

- **Button-Zeilen brechen auf schmalen Handys jetzt um**: die
  Filtern-Leiste (Vorlage laden/Als Vorlage speichern/Zurücksetzen/
  Filtern) sowie die Mehrfachauswahl-Leiste (Schlagwort zuweisen/
  entfernen/Löschen) konnten auf sehr schmalen Bildschirmen (z.B.
  Samsung Galaxy S24 Ultra) über den rechten Rand hinausragen, sodass
  „Filtern“ nicht mehr erreichbar war - brechen jetzt sauber in mehrere
  Zeilen um.
- **Tablet-Ansicht verbessert**: die Übersichtstabelle wechselt jetzt
  schon ab Tablet-Breite (statt erst auf dem Handy) in die übersichtliche
  Listenansicht - vorher waren die Spalten auf einem Tablet stark
  gestaucht und schlecht lesbar.
- **Kopfzeile neu geordnet**: statt vieler einzelner Buttons jetzt drei
  aufklappbare Menüs – „MDR-Planer“ (alle Tools des Zucht-Planers),
  „MDR-DB“ (Anleitung, Update-Log, Verpaarungs-Log) und der eigene
  Benutzername (Einstellungen, Durchschnitt, Verwaltung, Abmelden).
- Neue Staging-Tabelle für **vorgeschlagene Schlagwörter**: der
  Zucht-/Turnierplaner kann (ohne eigenen Login) ein Schlagwort für ein
  Pferd vorschlagen; es erscheint als Hinweis in der Übersicht und wird
  erst per Klick auf ✓ übernommen oder per ✗ verworfen, statt sich
  sofort auf das Pferd auszuwirken.
- Ist beim Anlegen eines vermeintlich neuen Pferds, das sich als
  Dopplung herausstellt (Namensgleichheit/ID-Match), zufällig ein
  Schlagwort angehakt, fragt ein Popup jetzt nach, statt die bereits
  vorhandenen Schlagwörter des gefundenen Datensatzes stillschweigend
  zu überschreiben.
- Neue Mehrfachauswahl-Aktion „🏷️ Schlagwort entfernen“ neben „🏷️
  Schlagwort zuweisen“.
- Schlagwörter (inkl. Zusatztext) jetzt auch im CSV-Export enthalten.
- Filter-Vorlagen speichern jetzt zusätzlich die Sortierung und den
  Ø-Vergleich (An/Aus und Vergleichsbasis) mit.
- Neuer Schnellfilter „Nur meine“ neben dem Besitzer-Filter.

- Neue **Filter-Vorlagen**: Filter-/Sucheinstellungen der Übersicht
  lassen sich unter einem Namen speichern und später per Dropdown
  wieder anwenden. Löschbar über Einstellungen.
- Neue **Schlagwörter** für eigene Pferde: feste Auswahl (Verkauf,
  Reserviert, Bleibt, Zuchttier, Gnadenbrot) mit optionalem Zusatztext
  je Schlagwort, erscheinen als farbige Badges in der Übersicht neben
  dem Namen. Lassen sich in der Übersicht filtern und auch für mehrere
  ausgewählte Pferde auf einmal zuweisen.

## 29.07.2026

- Bekommt ein Pferd beim Aktualisieren neu die Zuchtzulassung (vorher
  nicht „Ja“, jetzt „Ja“), weist der Banner nach dem Speichern zusätzlich
  darauf hin, das Bild zu aktualisieren.
- Icons bei „Anleitung“ und „Update-Log“ in der Navigation entfernt.

## 28.07.2026

- Diese Update-Log-Seite hinzugefügt.
- Beim Einfügen der **kompletten** Pferdeseite (Strg+A statt nur eines
  Textabschnitts) werden jetzt automatisch auch das **Pferdebild** (als
  Link ins Feld „Bild-URL“) und die **Spiel-ID** erkannt und eingetragen.

## 27.07.2026

- Beim Speichern eines Fohlens wird eine bekannte Flaxen-Trägerschaft
  jetzt automatisch auch bei den Eltern ergänzt, falls dort noch nicht
  vermerkt.

## 25.07.2026

- Erneutes „Automatisch auslesen“ eines bereits gespeicherten Pferds
  mahnt Turnierwerte/Ext% nicht mehr fälschlich als fehlend an, nur weil
  der diesmal eingefügte Text unvollständiger war als vorher.
- Der Banner nach dem Aktualisieren eines Pferds zeigt jetzt zusätzlich,
  **welche Felder sich geändert haben** (z.B. „Geändert: ZZL, Bild,
  Turnierwerte“).

## 21.–23.07.2026

- Eingefügte Bilder (Screenshot/„Bild kopieren“) werden jetzt richtig
  hochgeladen statt nur lokal im Browser gespeichert zu werden.
- Ø-Vergleich in der Übersicht: die Grün/Rot-Markierung berücksichtigt
  jetzt korrekt, dass bei Ext/Int ein *niedrigerer* Wert besser ist.
- Cremello/Perlino/Smoky Cream: die Farbgenetik-Ableitung zeigt „Cr“
  statt „CrCr“, wenn ein Elternteil nachweislich Pearl trägt (sonst
  weiterhin CrCr).
- Neue persönliche Einstellung „**Seitengröße**“ (70–150 %, Standard
  80 %) – ersetzt die vorher feste Verkleinerung aller Seiten.
- Der Ø-Vergleich-Filter in der Übersicht wurde optisch überarbeitet und
  direkt unter die Filtereinstellungen verschoben.

## 20.07.2026

- Neue Einstellung: der Menüpunkt „💞 Verpaarungs-Log“ lässt sich für das
  eigene Konto aus-/einblenden.

## 19.07.2026

- Genetik-Filter: fl/pl (Träger) und flfl/plpl (reinerbig) sind jetzt
  getrennt suchbar.
- Neues **Dopplungs-Check-Popup** beim Anlegen: erkennt die Seite beim
  Speichern eine gleiche Spiel-ID oder identische Leistungswerte,
  fragt sie nach, statt eine Dopplung anzulegen.
- Neue **Einstellungsseite**: bevorzugte Rassen für die Übersicht lassen
  sich pro Konto festlegen.
- Neuer **Ø-Vergleich** in der Übersicht (Grün/Rot-Markierung gegenüber
  dem Durchschnitt).
- Die Genetik-Anzeige ist jetzt nach Kategorie sortiert (Grundfarbe,
  Aufhellungen, Scheckungen, Flaxen).

## 16.–17.07.2026

- Neuer **Durchschnittsrechner** (nach Besitzer/Rasse/ZZL/Geschlecht).
- Neuer **CSV-Export** für die Übersicht.
- Löschen in der Übersicht ist jetzt nur noch für die Admin-Person
  sichtbar.
- Bearbeitungs-/Ansichtsseite in **4 Reiter** aufgeteilt (Stammdaten,
  Genetik, Turnierwerte, Stammbaum).
- Erneutes Auslesen beim Bearbeiten **ergänzt** die vorhandenen Daten
  jetzt, statt sie zu überschreiben.

## 13.–15.07.2026

- Farbgenetik-Ableitung berücksichtigt jetzt auch bekannte Elternwerte
  (z.B. Scheckungsmuster bei Pinto-Fohlen).
- Warnung vor dem Speichern, wenn Ext%, Turnierwerte oder Stammbaum
  fehlen – mit der Möglichkeit, trotzdem zu speichern.
- Neue Seite **Verpaarungs-Log** für Decksprung-Einträge inklusive
  Fohlen-Popup.
- Klickbare Gen-Bestätigung je Locus in der Farbgenetik-Detailansicht
  sowie bei Erbkrankheiten.
- Ausführliche **Anleitung** als eigene Seite hinzugefügt.

## 08.–12.07.2026

- Erste Version der MDR Pferdedatenbank veröffentlicht: Pferde
  anlegen/bearbeiten mit automatischem Auslesen des kopierten
  Spieltexts, Übersicht mit Filtern und sortierbaren Spalten, Design
  passend zur MDR-Startseite, Admin-Verwaltung.
- Farbgenetik-Ableitung nach offizieller MDR-Dokumentation, mobile
  Kartenansicht für die Übersicht, Login per Benutzername.
