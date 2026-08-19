# Update-Log: MDR Pferdedatenbank

Was sich an der Datenbank geändert hat, neueste Änderungen zuerst. Rein
interne Aufräumarbeiten ohne sichtbaren Effekt stehen hier nicht mit
drin.

---

## 19.08.2026

- **Bugfix: "Geändert: Eigenschaften" beim Speichern, obwohl nur im
  Spiel weitertrainiert wurde**: "Eigenschaften" (Grundlagen/Gangarten)
  speicherte bisher zusätzlich zum Potenzial auch den aktuellen
  Trainingsstand mit ("current") - der wird nirgends angezeigt, ändert
  sich aber durch bloßes Training im Spiel, ohne dass sich am Pferd aus
  Zuchtsicht etwas geändert hätte. Wird jetzt gar nicht mehr gespeichert,
  nur noch das Potenzial. Beim ersten erneuten Speichern eines bereits
  vorhandenen Pferds erscheint "Eigenschaften" dadurch einmalig noch in
  der Geändert-Liste (die alten Datensätze verlieren dann das
  "current"-Feld) - danach nicht mehr, solange sich das Potenzial nicht
  wirklich ändert.

## 17.08.2026

- **Spiel-Link in den Alters-Hinweisen** (Fohlen-Stall/"3 Jahre alt
  geworden"/über 25 Jahre, siehe [3.2](#32-hinweis-auf-fehlende-daten)):
  jeder Eintrag zeigt jetzt neben dem ✏️-Bearbeiten-Button zusätzlich den
  🔗-Button zur Pferdeseite im Spiel (nur falls eine ID hinterlegt ist).
- **Bugfix: "Geändert: ..."-Hinweis beim Speichern zeigte manchmal
  Felder, die gar nicht wirklich geändert wurden** - nur erneut erfasst
  (z.B. Turnierwerte/Disziplinen/Eigenschaften/Körperbau per erneut
  eingefügtem Kopiertext). Der Vergleich verglich JSONB-Felder bisher als
  reinen Text, der schon bei anderer Schlüssel-Reihenfolge (gleicher
  Inhalt!) als "geändert" galt. Vergleicht jetzt strukturell statt als
  Text - Objekt-Schlüssel unabhängig von ihrer Reihenfolge, Listen
  weiterhin in ihrer Reihenfolge (dort ist die Position echte Information,
  z.B. beim Stammbaum).
- **Standard-Filtervorlage + Sortierung merken**: In den Einstellungen
  lässt sich jetzt eine gespeicherte Filter-Vorlage als Standard beim
  Öffnen der Übersicht festlegen (inkl. der dazugehörigen Sortierung)
  - Migration `migration_028_default_filter_preset.sql` einmalig im
    Supabase-Dashboard ausführen, sonst zeigt die Einstellungen-Seite
    vorübergehend nur Standardwerte und "Speichern" schlägt fehl.
  - Ohne Standard-Vorlage merkt sich die Übersicht jetzt trotzdem die
    zuletzt manuell gewählte Sortierung geräte-lokal und startet beim
    nächsten Öffnen direkt damit, statt immer auf "Name aufsteigend"
    zurückzufallen.
  - "Zuletzt bearbeitet" startet beim ersten Klick jetzt absteigend
    (neuste Änderungen zuerst) statt aufsteigend - ein weiterer Klick
    zeigt die ältesten Änderungen zuerst.
- **Bugfix: manuell bestätigte "nicht vorhanden"-Gene wurden bei manchen
  Pferden ignoriert** (z.B. "4Leafs Prisma Phantom Rose"): war ein
  Genort wie Cream/KIT/Agouti manuell auf "nicht vorhanden" gesetzt (z.B.
  Pearl explizit ausgeschlossen), aber die Fellfarbe legt gleichzeitig ein
  reinerbiges Merkmal desselben Genorts nahe (z.B. "Perlino Champagne" =
  Champagne+Pearl laut Spiel-Dokumentation), wurde der widersprüchliche,
  automatisch abgeleitete Eintrag trotzdem zusätzlich angezeigt, statt vom
  manuellen "nicht vorhanden" unterdrückt zu werden - betraf auch die
  Vererbungs-Anzeige bei Nachkommen dieser Pferde.

## 12.08.2026

- **Massenerfassung: Sitzungs-Übersicht als Karte, direkter Abschluss-
  Button**: die bisherige reine Textzeile "Diese Sitzung bereits
  erfasst: ..." ist jetzt eine Karte mit großer Anzahl und einer Liste
  aller bisher in dieser Sitzung erfassten Pferde, jeweils als direkter
  Link zum Pferd. Neuanlagen bekommen einen grünen Haken, Nachträge zu
  bereits bestehenden Pferden (z.B. Name-/ID-Treffer) ein blaues
  "aktualisiert"-Abzeichen. Ein neuer Button "Fertig / Zur Übersicht"
  beendet die Sitzung direkt von dieser Karte aus - vorher musste dafür
  noch ein weiteres, eigentlich leeres Pferd über den normalen
  "Speichern"-Button abgeschlossen werden.
- **Automatisches Auslesen beim Einfügen**: Text ins Feld "Text von der
  Pferdeseite einfügen" einfügen liest die Felder jetzt direkt aus,
  ohne zusätzlichen Klick auf "Automatisch auslesen" - der Button bleibt
  für manuelle Korrekturen/erneutes Auslesen weiterhin nutzbar.
- **Ø-Vergleich: Durchschnittswerte sichtbar, Toleranz an/abschaltbar
  und eigener Grünton**: unter den Basis-Dropdowns im „Ø-Vergleich
  anzeigen“-Bereich stehen jetzt die berechneten Durchschnittswerte
  selbst (z.B. „Ø GP: 367 (±5)“), inkl. der jeweils wirksamen
  [Toleranz](#9-einstellungen) in Klammern. Eine neue Checkbox „Toleranz
  berücksichtigen“ schaltet die Toleranz für die Färbung testweise ganz
  ab, ohne die hinterlegten Werte in den Einstellungen zu löschen.
  Pferde, die nur wegen der Toleranz noch als akzeptabel gelten
  (schlechter als der Durchschnitt, aber innerhalb der Toleranz),
  wurden bisher ungefärbt dargestellt - sie bekommen jetzt einen
  eigenen, helleren Grünton (bei den einzelnen Werten wie beim Namen),
  damit sie sich sowohl von echt überdurchschnittlichen als auch von
  wirklich unterdurchschnittlichen Pferden unterscheiden lassen.

## 11.08.2026

- **Massenerfassung beim Neuanlegen**: neuer Button „Speichern &
  nächstes Pferd“ - speichert das aktuelle Pferd und leert das Formular
  direkt für die nächste Neuanlage, statt zur Übersicht zurückzuspringen.
  Zeigt darunter, welche Pferde in der aktuellen Sitzung schon erfasst
  wurden, und listet am Ende alle in dieser Sitzung neu angelegten
  Pferde im Banner der Übersicht auf.
- **„Unvollständige Daten“-Hinweis bei Nachträgen korrigiert**: wurde
  ein vermeintlich neues Pferd tatsächlich mit einem bereits bestehenden
  Pferd zusammengeführt (Name-/ID-Treffer), meldete das Popup Felder wie
  „Turnierwerte“ fälschlich als fehlend, obwohl sie im bestehenden
  Datensatz längst erfasst waren - nur weil der diesmal eingefügte
  (kürzere) Text sie nicht enthielt. Die Prüfung berücksichtigt jetzt den
  bereits bestehenden Datensatz mit.
- **"3 Jahre alt geworden"-Hinweis verschwindet jetzt gezielter**:
  bisher blieb er das ganze 4. Spieljahr über stehen. Jetzt verschwindet
  er, sobald das Pferd danach erneut gespeichert wird (z.B. nach dem
  Bild-Update), und erscheint gar nicht erst bei Pferden, die schon bei
  der Ersteingabe über 3 Jahre alt waren.

- **Ø-Vergleich Toleranz einstellbar** (Einstellungen): pro Wert
  (GP/Ext/Ext%/Int) lässt sich festlegen, wie viel schlechter als der
  Durchschnitt ein Pferd noch sein darf, ohne in der Übersicht rot
  markiert zu werden - für eine großzügigere Auswahl.
- **Schlagwort "Zuchttier" entfernt** (inkl. Migration für bereits
  vergebene Schlagwörter) - ein Ersatz-Schlagwort für Pferde, die auf
  ihr nächstes Fohlen warten, kommt noch.
- **Zeilenhöhen in der Übersichtstabelle vereinheitlicht**: Name, Rasse,
  Farbe, Besitzer und Genetik-Code wurden bei langen Werten (mehrere
  Schlagwörter, lange Rassen-/Farbnamen) mehrzeilig und machten dadurch
  einzelne Zeilen höher als andere, wodurch die Trennlinien "verrutscht"
  wirkten. Diese Spalten werden jetzt einzeilig mit "…" abgekürzt (voller
  Wert per Tooltip beim Draufhalten oder auf der Pferdeseite), die
  Tabelle hat außerdem eine Mindestbreite und scrollt darunter
  horizontal statt Spalten zusammenzustauchen. Zeilen sind dadurch jetzt
  durchgehend exakt gleich hoch.

---

## 10.08.2026

- **Trennlinien in der Desktop-Tabelle korrigiert**: bei Zeilen mit
  mehreren Schlagwörtern (die den Namen umbrechen und die Zeile höher
  machen) schwebten Kästchen und Mini-Bild mittig statt oben, wodurch
  die untere Trennlinie verrutscht wirkte.
- **Aktionen-Spalte in der Übersicht verkleinert**: Spaltenüberschrift
  entfernt (nur noch die ✏️/✗-Icons), Spalte selbst schmaler.
- **ID-Treffer beim Anlegen wird jetzt still ergänzt statt nachzufragen**:
  gibt es bereits ein Pferd mit exakt derselben Spiel-ID (auch unter
  anderem Namen), wird der bestehende Datensatz automatisch aktualisiert
  – wie beim Namenstreffer, ohne Rückfrage-Popup. Leer gelassene Felder
  überschreiben dabei keine bereits vorhandenen Werte.

---

## 09.08.2026

- **Alters-Hinweise in der Übersicht**: neuer Hinweiskasten für Pferde,
  die 3 Jahre alt geworden sind (Erinnerung, das Pferdebild zu
  aktualisieren, da sich das im Spiel meist ändert). Pferde über 25
  Jahren bekommen zusätzlich automatisch das Schlagwort „GBH“ zugewiesen
  und werden dazu ebenfalls als Hinweis aufgelistet.
- **Fehler beim Alter junger Fohlen behoben**: durch eine zu frühe
  Rundung in der Altersberechnung wurde ein Fohlen in den ersten Tagen
  fälschlich mit „0 Monate“ statt „1 Monat“ angezeigt.
- **Spaltenüberschriften der Übersicht brechen nicht mehr mitten im Wort
  um**: bei schmaleren Bildschirmbreiten (z.B. „Bild“, „Geschlecht“)
  wurden Wörter teils mitten im Buchstaben getrennt statt ordentlich zu
  umbrechen.
- **Mini-Bild in der Übersicht zeigt jetzt das ganze Pferd**: vorher
  wurde es im 40x40-Quadrat an den Seiten beschnitten, jetzt bleibt das
  komplette Bild sichtbar (ggf. mit etwas Rand statt Beschnitt).
- **Neuer Hinweis „X Fohlen ist/sind 6 Monate alt“**: erinnert daran,
  dass Fohlen ab 6 Monaten einen eigenen Stall brauchen.

---

## 08.08.2026 (3)

- **Mini-Bild in der Übersicht**: Pferde mit hinterlegter Bild-URL zeigen
  jetzt ein kleines Vorschaubild ganz links in der Tabelle (Klick öffnet
  die Ansichtsseite).

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
