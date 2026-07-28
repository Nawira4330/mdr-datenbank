# Update-Log: MDR Pferdedatenbank

Was sich an der Datenbank geändert hat, neueste Änderungen zuerst. Rein
interne Aufräumarbeiten ohne sichtbaren Effekt stehen hier nicht mit
drin.

---

## 28.07.2026

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
