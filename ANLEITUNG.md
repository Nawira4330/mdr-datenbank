# Anleitung: MDR Pferdedatenbank

Diese Anleitung erklärt Schritt für Schritt, wie du die Pferdedatenbank
benutzt – jede Seite, jeden Button und jedes Feld, dazu jeweils *wofür*
es gedacht ist und *wann* du es brauchst.

## Inhalt

1. [Über diese Datenbank](#1-über-diese-datenbank)
2. [Anmelden](#2-anmelden)
3. [Übersicht (Pferdeliste)](#3-übersicht-pferdeliste)
4. [Pferd anlegen oder bearbeiten](#4-pferd-anlegen-oder-bearbeiten)
5. [Pferd ansehen](#5-pferd-ansehen)
6. [Verpaarungs-Log](#6-verpaarungs-log)
7. [Verwaltung](#7-verwaltung)
8. [Durchschnittsrechner](#8-durchschnittsrechner)
9. [Einstellungen](#9-einstellungen)
10. [Zucht-/Turnierplaner](#10-zucht-turnierplaner)
11. [Häufige Fragen](#11-häufige-fragen)

---

## 1. Über diese Datenbank

Diese Webseite ist die gemeinsame Pferdedatenbank unserer Zuchtgemeinschaft.
Alle angemeldeten Mitglieder sehen und bearbeiten dieselbe Liste – es gibt
keine getrennten „eigenen Datenbanken“ pro Person. Jede und jeder kann
grundsätzlich alle Pferde sehen, auch die von anderen; manche Hinweise
(z.B. „fehlende Daten“) zeigt dir die Seite aber nur zu deinen eigenen
Pferden an, damit du nicht von fremden Baustellen abgelenkt wirst.

Fast alle Angaben zu einem Pferd musst du nicht von Hand eintippen: du
kopierst einfach die Pferdeseite aus dem Spiel und die Datenbank liest
daraus automatisch alles Wichtige aus. Weil das Spiel dafür keine
offizielle Funktion anbietet, ist diese Erkennung „best effort“ – schau
dir die erkannten Felder vor dem Speichern immer kurz an.

---

## 2. Anmelden

**Schritt für Schritt:**
1. Deinen Benutzernamen (den du von der Zuchtgemeinschaft bekommen hast)
   und dein Passwort eingeben.
2. Auf „Anmelden“ klicken.

Bist du bereits angemeldet, wenn du die Seite öffnest, wirst du
automatisch direkt zur Übersicht weitergeleitet. Neue Zugänge kannst du
dir hier nicht selbst anlegen – wende dich dafür an die Person mit
Verwaltungszugriff.

---

## 3. Übersicht (Pferdeliste)

Das ist die Startseite nach dem Anmelden: eine Tabelle mit allen Pferden,
dazu Filter, Sortierung und die Möglichkeit, mehrere Pferde auf einmal
auszuwählen.

### 3.1 Kopfzeile

Oben rechts findest du auf jeder Seite dieselben drei Menüs zum
Aufklappen (Klick auf den Namen), dazu links den jeweils
seitenpassenden ersten Knopf (z.B. „+ Neues Pferd“ auf der Übersicht,
sonst „← Zur Übersicht“):

- **MDR-Planer** – Links zu unserem separaten Zucht-Planungs-Tool
  (öffnen jeweils in einem neuen Tab, siehe
  [Abschnitt 10](#10-zucht-turnierplaner)): alle Tools, Zuchtplaner,
  Turnierplaner, Zuchtbuch, Fohlen-Tracker, Verwandtschaftsmatrix.
- **MDR-DB** – Anleitung (diese Seite), Update-Log sowie 💞
  Verpaarungs-Log (siehe [Abschnitt 6](#6-verpaarungs-log)) – Letzteres
  nur, wenn du es nicht unter [Einstellungen](#9-einstellungen)
  ausgeblendet hast.
- **Dein Benutzername** – ⚙️ Einstellungen (siehe
  [Abschnitt 9](#9-einstellungen)), 📊 Durchschnitt (siehe
  [Abschnitt 8](#8-durchschnittsrechner)), 🛠️ Verwaltung (nur mit
  Verwaltungszugriff, siehe [Abschnitt 7](#7-verwaltung)) sowie
  „Abmelden“.

### 3.2 Hinweis auf fehlende Daten

Direkt unter der Kopfzeile erscheint bei Bedarf ein gelber Hinweiskasten,
der dir zeigt, welche **deiner eigenen** Pferde noch unvollständige
Angaben haben – zum Beispiel, weil beim Kopieren aus dem Spiel nicht die
komplette Seite markiert wurde. Folgende Lücken werden erkannt:

| Hinweis | Bedeutet |
|---|---|
| Ext% | Der genetische Exterieur-Wert fehlt oder konnte nicht berechnet werden. |
| Stammbaum | Es wurden keine Vorfahren gespeichert – der Stammbaum-Abschnitt fehlte vermutlich im kopierten Text. |
| Turnierwerte | Gesamtpotenzial, Begabung oder nicht alle Disziplinen wurden erfasst – meist, weil „Alle Disziplinen anzeigen?“ im Spiel vor dem Kopieren nicht aufgeklappt war. |
| Rasseanteile | Das Pferd ist laut Reinrassigkeit-Wert nicht zu 100% reinrassig, aber die Aufschlüsselung der Rasseanteile fehlt noch – das gilt auch, wenn schon eine Hauptrasse eingetragen ist. |

Über den ✏️-Stift in der Liste springst du direkt zum betroffenen Pferd,
um die Lücke zu schließen. Der Hinweiskasten lässt sich einklappen (Klick
auf die Überschrift), ist beim Öffnen der Seite aber immer erst
aufgeklappt.

**Vorgeschlagene Schlagwörter**: Darunter kann ein ähnlicher Hinweiskasten
erscheinen, wenn z.B. der [Zucht-/Turnierplaner](#10-zucht-turnierplaner)
ein Schlagwort für ein Pferd vorschlägt (aus Zuchtbuch, Fohlen-Tracker
oder Verwandtschaftsmatrix). Diese Vorschläge werden **nicht automatisch**
übernommen, sondern nur zwischengespeichert – du siehst pro Vorschlag das
Schlagwort, das betroffene Pferd und optional woher der Vorschlag kommt,
und entscheidest per ✓ (übernehmen, ins Pferd eintragen) oder ✗ (verwerfen,
ohne Wirkung löschen). Dieser Kasten ist für alle Konten sichtbar, nicht
nur für die eigenen Pferde.

**Alters-Hinweise**: Drei weitere Hinweiskästen, ebenfalls nur für deine
eigenen Pferde und auf dem [Geburtsdatum](#42-stammdaten) basierend:

- **„X Fohlen ist/sind 6 Monate alt“** – Fohlen brauchen ab 6 Monaten
  einen eigenen Stall, dieser Hinweis erinnert daran. Verschwindet von
  selbst wieder, sobald das Fohlen 7 Monate alt wird.
- **„X Pferd(e) ist/sind 3 Jahre alt geworden“** – im Spiel ändert sich
  das Pferdebild meist mit 3 Jahren, dieser Hinweis erinnert daran, das
  Bild zu prüfen und ggf. zu aktualisieren. Er verschwindet, sobald du
  das Pferd danach erneut speicherst (z.B. nach dem Bild-Update) oder
  spätestens wenn es 4 wird. War ein Pferd bei der Ersteingabe bereits
  über 3 Jahre alt, erscheint der Hinweis für dieses Pferd gar nicht
  erst.
- **„X Pferd(e) über 25 Jahre – automatisch mit „GBH“ markiert“** –
  Pferde über 25 Jahren bekommen automatisch das Schlagwort „GBH“
  zugewiesen (falls noch nicht vorhanden), dieser Kasten listet sie zur
  Bestätigung auf.

### 3.3 Meldung nach dem Speichern

Nachdem du ein Pferd angelegt oder gespeichert hast, siehst du beim
nächsten Blick auf die Übersicht kurz eine Meldung wie „„Name“ wurde neu
angelegt/aktualisiert.“ Sie verschwindet von selbst, sobald du irgendwo
klickst oder etwas änderst.

### 3.4 Filtern und Suchen

Es gibt drei Filter-Bereiche, die sich beliebig kombinieren lassen. Mit
„Filtern“ wendest du sie an, mit „Zurücksetzen“ leerst du alle Felder auf
einmal.

**Filter-Vorlagen**: Häufig genutzte Filterkombinationen lassen sich
als Vorlage speichern – „💾 Als Vorlage speichern“ fragt nach einem
Namen und merkt sich den kompletten aktuellen Stand aller Filter-/
Suchfelder, der Sortierung sowie des Ø-Vergleichs (An/Aus und
Vergleichsbasis) für dein Konto. Speicherst du erneut unter demselben
Namen, wird die Vorlage überschrieben. Über das Dropdown „Vorlage
laden…“ wendest du eine gespeicherte Vorlage sofort an. Löschen geht
nur über [Einstellungen](#9-einstellungen), nicht direkt in der
Übersicht.

**Suche**
- **Name** – findet auch Teiltreffer, Groß-/Kleinschreibung spielt keine
  Rolle.
- **Besitzer**, **Geschlecht**, **Rasse** – Auswahllisten mit den
  tatsächlich vorkommenden Werten, standardmäßig auf „Alle“ gestellt;
  „Rasselos“ zeigt gezielt Pferde ohne eingetragene Rasse. Der Button
  „Nur meine“ neben Besitzer setzt den Filter direkt auf dein eigenes
  Konto. Hast du unter
  [Einstellungen](#9-einstellungen) bevorzugte Rassen ausgewählt, listet
  der Rasse-Filter nur noch diese als Optionen auf – „Alle (auch
  außerhalb meiner Auswahl)“ hebt das für den Moment wieder auf und zeigt
  alle Pferde unabhängig von deiner Auswahl.
- **ZZL** (Zuchtzulassung) – „Ja“ zeigt nur zugelassene Pferde; „Nein“
  zeigt sowohl ausdrücklich nicht zugelassene als auch noch nicht
  entschiedene Pferde.
- **Schlagwörter** – wähle ein oder mehrere Schlagwörter aus (siehe
  [4.3](#43-weitere-angaben)); die Liste zeigt Pferde, die **mindestens
  eines** der ausgewählten Schlagwörter tragen. „Kein Schlagwort“ zeigt
  stattdessen gezielt Pferde ganz ohne Schlagwort.

**Genetik & Gesundheit**
- **Genetik** – wähle ein oder mehrere Merkmale aus (z.B. Champagne,
  Tobiano, Pearl); die Liste zeigt dir nur Pferde, die dieses Merkmal
  sichtbar/nachweislich tragen.
- **EKH** (Erbkrankheiten) – „Keine“ zeigt nachweislich freie Pferde,
  oder wähle eine bestimmte Krankheit, um Träger/betroffene Pferde zu
  finden (auch, wenn das nur manuell vermerkt statt beim Tierarzt
  getestet wurde, siehe [4.4](#44-erkannte-daten-ansehen)).

**Leistungswerte** – filtere nach GP, Ext, Ext% oder Int, jeweils
„größer als“ oder „kleiner als“ ein Wert deiner Wahl.

### 3.5 Die Tabelle

Von links nach rechts: Auswahl-Kästchen, Mini-Bild (nur wenn eine
Bild-URL hinterlegt ist – Klick öffnet die Ansichtsseite), 🔗-Link (nur
wenn eine Spiel-ID hinterlegt ist – öffnet die Pferdeseite direkt im
Spiel), Name
(klicken öffnet die Ansichtsseite, siehe [Abschnitt 5](#5-pferd-ansehen))
mit den zugewiesenen Schlagwörtern als farbige Badges direkt daneben,
Geschlecht, Rasse, Farbe, Genetik (kurze Zusammenfassung der bekannten
Gene), GP, Ext, Ext%, Int, HLP/SLP, ZZL, EKH, Besitzer, Alter (berechnet
aus dem Geburtsdatum, siehe [4.2](#42-stammdaten) – 30 reale Tage
entsprechen dabei 1 Spieljahr) und Zuletzt bearbeitet, sowie Aktionen
(✏️ Bearbeiten immer, ✗ Löschen nur mit Verwaltungszugriff).

**Sortieren**: Klick auf eine Spaltenüberschrift sortiert die Liste
danach, ein weiterer Klick dreht die Richtung um. Auf dem Handy gibt es
dafür stattdessen ein Dropdown-Menü „Sortieren“ oberhalb der Liste.

**Nach oben**: Sobald du in einer langen Liste gescrollt hast, erscheint
unten rechts ein ↑-Button, der dich direkt wieder an den Anfang bringt.

**Pferde auswählen**: Die Kästchen links dienen drei Zwecken:
- **CSV-Export** (siehe unten) – für alle nutzbar.
- **Mehreren Pferden auf einmal Schlagwörter zuweisen oder entfernen** –
  Kästchen anhaken (oder „Alle auswählen“), es erscheint eine Leiste mit
  „🏷️ Schlagwort zuweisen“ und „🏷️ Schlagwort entfernen“; beide öffnen
  ein Popup zur Auswahl. „Zuweisen“ ergänzt die gewählten Schlagwörter
  bei allen ausgewählten Pferden, ohne bereits vorhandene zu entfernen;
  „Entfernen“ löscht die gewählten Schlagwörter dort, wo sie vorkommen,
  andere Schlagwörter bleiben unangetastet. Ein Zusatztext (siehe
  [4.3](#43-weitere-angaben)) lässt sich dabei nicht mitgeben – dafür das
  Pferd einzeln bearbeiten.
- **Mehrere Pferde auf einmal löschen** – über dieselbe Leiste,
  „Ausgewählte löschen“; dieser Button ist nur mit Verwaltungszugriff
  sichtbar.

**CSV-Export**: Der Button „📄 CSV exportieren“ oberhalb der Tabelle
speichert eine Excel-taugliche Datei mit Name, Geschlecht, Rasse (inkl.
Rasseanteile), Farbe/Genetik, GP, Ext, Ext%, Int, Besitzer,
Schlagwörtern (inkl. Zusatztext) und dem vollständigen Spiel-Link. Sind
über die Kästchen einzelne Pferde ausgewählt, werden nur diese
exportiert – ohne Auswahl exportiert der Button stattdessen alle gerade
sichtbaren (gefilterten) Pferde.

**Wichtig**: Löschen (einzeln über ✗ oder mehrfach über die
Auswahl-Leiste) ist **endgültig** und lässt sich nicht rückgängig
machen.

**Ø-Vergleich anzeigen**: Die Checkbox unterhalb der Trefferanzahl
markiert bei jedem Pferd die Spalten GP, Ext, Ext% und Int grün (besser
als Durchschnitt) oder rot (schlechter) – der Name wird ebenfalls
eingefärbt, je nachdem, bei mehr Werten das Pferd besser oder schlechter
als der Durchschnitt abschneidet. Bei **GP** und **Ext%** ist ein
höherer Wert besser (grün = darüber); bei **Ext** und **Int** ist es
umgekehrt ein **niedrigerer** Wert (Skala 1 = exzellent … 4/5 =
schlecht, grün = darunter). Beim Anhaken erscheint ein zusätzliches
Dropdown-Menü mit **Rasse**, **ZZL**, **Besitzer** und **Geschlecht**
(Basis) – damit
legst du fest, welche Pferde in die Durchschnittsberechnung einfließen
(unabhängig davon, welche Pferde die Filter oben gerade anzeigen). Ein
leerer Wert (Fehlanzeige) bei GP/Ext/Ext%/Int bleibt unmarkiert.

---

## 4. Pferd anlegen oder bearbeiten

Neue Pferde und bereits vorhandene Pferde benutzen dasselbe Formular.
Beim Bearbeiten eines bestehenden Pferds siehst du zusätzlich einen
„Pferd löschen“-Button und die Pfeile ← / → oben neben den Stammdaten.

Das Formular ist in **4 Reiter** aufgeteilt, zwischen denen du oben
beliebig hin- und herklicken kannst (bereits eingetragene Werte bleiben
beim Wechseln erhalten):

- **Stammdaten** – Stammdaten, Verwaltung, Papiere & Zucht, Sonstiges
  (siehe [4.2](#42-stammdaten)/[4.3](#43-weitere-angaben)).
- **Genetik** – Erbkrankheiten, Farbgenetik, Exterieur (Genetik),
  Exterieur (Körperbau), Interieur (siehe [4.4](#44-erkannte-daten-ansehen)).
- **Turnierwerte** – Turnierpotenzial, Disziplinen, Eigenschaften.
- **Stammbaum** – die Vorfahren.

### 4.1 Text automatisch auslesen

Der schnellste Weg, ein Pferd einzutragen:

1. Im Spiel die Pferdeseite öffnen, die komplette Seite markieren
   (Strg+A) und kopieren (Strg+C).
2. Den Text in das Feld „Text von der Pferdeseite einfügen“ einfügen.
3. Auf „Automatisch auslesen“ klicken.
4. Alle darunter befüllten Felder **kurz prüfen**, bevor du speicherst –
   die automatische Erkennung ist textbasiert und kann bei
   Layout-Änderungen im Spiel danebenliegen.

Dabei werden automatisch erkannt: Name, Alter/Geschlecht, Rasse,
Reinrassigkeit (inklusive Rasseanteile, falls im Spiel vorher
aufgeklappt), Fellfarbe, Besitzer, Erbkrankheiten-Status, Zuchtzulassung,
HLP/SLP, ICO, die komplette Farbgenetik-Tabelle, Exterieur, Interieur,
Disziplinen, Eigenschaften, Turnierpotenzial und der Stammbaum. Ein noch
unbenanntes Fohlen wird automatisch nach dem Muster
„Fohlen_Mutter X Vater“ benannt, damit nicht mehrere Fohlen denselben
Platzhalter-Namen bekommen und sich versehentlich überschreiben.

Markierst und kopierst du dabei die **komplette** Seite (Strg+A statt nur
einen Textabschnitt), werden beim Einfügen zusätzlich automatisch das
Pferdebild (als Link ins Feld „Bild-URL“) und die Spiel-ID (aus dem
Dateinamen des Bilds, ins Feld „ID“) erkannt – ganz ohne eigenen Klick,
direkt beim Einfügen in den Text-Kasten.

Dieser Einfügekasten ist einklappbar. Beim Bearbeiten eines bereits
vorhandenen Pferds startet er automatisch eingeklappt (du brauchst ihn ja
meist nicht mehr), lässt sich aber jederzeit wieder aufklappen, wenn du
z.B. nach einem Update im Spiel erneut auslesen willst.

### 4.2 Stammdaten

- **Name** (Pflichtfeld) – trägst du einen Namen ein, der schon existiert
  (Groß-/Kleinschreibung egal), wird automatisch **das bestehende Pferd
  aktualisiert** statt versehentlich ein zweites angelegt.
- **ID** – eine frei wählbare Nummer zur eigenen Zuordnung. Trägst du
  hier die Spiel-ID ein, entsteht daraus automatisch der 🔗-Link zur
  Pferdeseite im Spiel (in der Übersicht und auf der Ansichtsseite). Du
  kannst hier auch die komplette Spiel-Adresse (die ganze URL) einfügen –
  beim Speichern wird automatisch nur die Nummer daraus übernommen.
  Trägst du eine ID ein, die bei einem anderen (auch anders benannten)
  Pferd bereits hinterlegt ist, wird genau wie beim Namenstreffer
  automatisch **das bestehende Pferd aktualisiert und ergänzt** statt
  ein zweites angelegt – unabhängig davon, ob im aktuellen Formular alle
  Felder ausgefüllt sind. Leer gelassene Felder überschreiben dabei
  keine bereits vorhandenen Werte.
- **Geschlecht**.
- **Rasse** – wird beim Eintippen wie beim automatischen Auslesen
  automatisch ausgeschrieben (z.B. wird aus dem Kürzel „APH“
  automatisch „American Paint Horse“). Ist keine Rasse bekannt, trägt
  das Feld automatisch „Rasselos“ ein, statt leer zu bleiben.
- **Reinrassigkeit (%)** – bestimmt, ob das Feld „Rasseanteile“
  überhaupt angezeigt wird.
- **Rasseanteile** – erscheint, solange die Reinrassigkeit nicht sicher
  bei 100% liegt (leeres Feld zählt dabei als „noch unklar“ und blendet
  es vorsorglich ein). Ist ein Pferd nachweislich nicht zu 100%
  reinrassig und dieses Feld leer, warnt dich die Seite beim Speichern
  (siehe [4.6](#46-speichern)) – ganz unabhängig davon, ob zusätzlich
  schon eine Hauptrasse eingetragen ist.
- **Fellfarbe** – wird auch benutzt, um automatisch auf mögliche Gene zu
  schließen (z.B. deutet „Palomino“ auf das Cream-Gen hin).
- **Geburtsdatum** – wird beim automatischen Auslesen aus der
  „Geburtstag:“-Zeile im kopierten Spieltext übernommen, lässt sich aber
  auch von Hand eintragen/ändern. Daraus berechnen Übersicht und
  Ansichtsseite automatisch das Alter in Spieljahren (30 reale Tage =
  1 Spieljahr, genau wie im Spiel selbst).
- **Erbkrankheiten** (Auswahl frei/vorhanden/unbekannt) – ein grober
  Gesamtstatus, unabhängig von der ausführlichen Krankheiten-Tabelle
  weiter unten.

### 4.3 Weitere Angaben

- **Verwaltung**: Besitzer.
- **Papiere & Zucht**: Zuchtzulassung, HLP/SLP, ICO.
- **Sonstiges**: Notizen (fließen ebenfalls in die automatische
  Gen-Erkennung ein), Bild-URL – hier kannst du entweder eine bestehende
  Bild-Adresse eintippen, oder direkt ein Bild einfügen (z.B. per
  Screenshot oder „Bild kopieren“ aus dem Browser, dann Strg+V in das
  Feld) – es wird dann automatisch hochgeladen und die entstehende
  Adresse ins Feld eingetragen. Direkt darunter erscheint eine kleine
  Bildvorschau, sobald eine Adresse eingetragen ist.
- **Schlagwörter**: eine feste Liste (Verkauf, Reserviert, Bleibt, GBH),
  kein freies Textfeld – haken an, was zutrifft,
  mehrere gleichzeitig sind möglich. Zu jedem angehakten Schlagwort lässt
  sich optional ein kurzer Zusatztext eintragen (z.B. bei „Reserviert“,
  wer reserviert hat) – erscheint dann z.B. als „Reserviert: für Lisa“.
  Die Schlagwörter erscheinen als farbige Badges in der Übersicht neben
  dem Namen, lassen sich dort filtern (siehe [3.4](#34-filtern-und-suchen))
  und auch für mehrere ausgewählte Pferde auf einmal zuweisen (siehe
  [3.5](#35-die-tabelle)).

### 4.4 Erkannte Daten ansehen

Sobald ein Pferd Daten hat (nach dem Auslesen oder beim Öffnen eines
bestehenden Pferds), zeigen die Reiter „Genetik“, „Turnierwerte“ und
„Stammbaum“ alle erkannten Detailwerte – reine Anzeige, kein eigenes
Formular:

**Erbkrankheiten** – zeigt zuerst alle tatsächlich getesteten Krankheiten
mit ihrem Ergebnis. Für jede der bekannten Krankheiten, die noch **nicht**
getestet wurde (z.B. bei einem jungen Fohlen ohne Tierarzt-Test),
erscheint stattdessen eine „Nicht getestet“-Zeile mit einem Klick-Button.
Jeder Klick wechselt den Zustand weiter: **unbekannt → Träger → betroffen
→ frei → wieder unbekannt**. So kannst du eine begründete Vermutung
festhalten, auch ohne offiziellen Test – sie zählt dann auch im
EKH-Filter der Übersicht mit.

**Farbgenetik** – zeigt den Namen der Fellfarbe und darunter jeden
Genort mit seinem bekannten Wert. Ist ein Genort noch nicht getestet,
zeigt die Zeile zusätzlich einen automatischen Hinweis (abgeleitet aus
Fellfarbe, Notiz oder Pferdename – z.B. deutet „Palomino“ auf das
Cream-Gen hin; oder übernommen von einem Elternteil, das für dieses Gen
bereits reinerbig in der Datenbank steht) **und** einen Klick-Button zur
manuellen Bestätigung, genau wie bei den Erbkrankheiten. Eine manuelle
Bestätigung geht dabei immer vor dem automatischen Hinweis. Bei Genorten
mit mehreren möglichen Ausprägungen (z.B. Scheckung: Tobiano/Sabino/Roan,
oder Agouti: die drei Braun-Varianten, oder Cream/Pearl) gibt es für
jede Ausprägung einen eigenen Button. Ganz unten steht eine
Zusammenfassung „Vorhandene Gene“ – genau die, die auch in der
Übersichtsspalte „Genetik“ erscheint.

**Exterieur (Genetik)** – der genetische Wert je Körperteil, daraus
ergibt sich der Gesamtwert „Ext%“.

**Exterieur (Körperbau)** – die beschreibende Bewertung je Körperteil
(„exzellent“, „passabel“ usw.), daraus ergibt sich der Durchschnittswert
„Ext“.

**Interieur (Mentalität)** – genauso, ergibt den Wert „Int“.

**Turnierpotenzial** – Gesamtpotenzial, Begabung und die dazu passende
Hauptdisziplin.

**Disziplinen / Eigenschaften** – die Potenzial-Werte je Disziplin bzw.
Eigenschaft.

**Stammbaum** – die Vorfahren in der Reihenfolge, wie sie im Spieltext
standen, gruppiert nach Eltern/Großeltern/Urgroßeltern/weitere Vorfahren.
Die ersten beiden Einträge sind dabei immer zuverlässig Vater, dann
Mutter.

### 4.5 Zwischen Pferden wechseln

Beim Bearbeiten eines bestehenden Pferds erscheinen links und rechts
neben den Stammdaten zwei Pfeile:

- **← / →** – speichert das aktuelle Pferd (wie der normale
  Speichern-Button) und springt danach direkt zum alphabetisch
  vorherigen/nächsten **eigenen** Pferd. So kannst du eine ganze Liste
  am Stück durcharbeiten, ohne jedes Mal über die Übersicht zu gehen.

„Pferd löschen“ entfernt das Pferd endgültig (mit Sicherheitsabfrage).

### 4.6 Speichern

Beim Klick auf „Speichern“ (oder auf ← / →) prüft die Seite zuerst, ob
noch Angaben fehlen (siehe die vier Hinweise aus
[3.2](#32-hinweis-auf-fehlende-daten)). Fehlt etwas, öffnet sich ein
Popup mit der Liste der fehlenden Punkte: „Zurück zur Bearbeitung“
bricht ab, „Trotzdem speichern“ speichert unverändert weiter. Fehlt
nichts, wird direkt gespeichert. Der ursprünglich eingefügte Spieltext
selbst wird dabei **nicht** dauerhaft gespeichert – nur das daraus
erkannte Ergebnis.

Sind Ext%/Turnierwerte/Stammbaum bei einem bereits gespeicherten Pferd
schon bekannt, verlangt ein erneutes „Automatisch auslesen“ sie nicht
nochmal: fehlt ein Wert im diesmal eingefügten Text (z.B. weil nur ein
Teil der Seite kopiert wurde), bleibt der bisherige, bereits bekannte
Wert erhalten statt zu verschwinden – das Popup erscheint dann für diese
Angabe nicht erneut.

**Massenerfassung**: Beim Neuanlegen (nicht beim Bearbeiten eines
bestehenden Pferds) gibt es neben „Speichern“ zusätzlich „Speichern &
nächstes Pferd“. Speichert das aktuelle Pferd genauso wie „Speichern“,
leitet danach aber **nicht** zur Übersicht weiter, sondern leert das
Formular direkt für die nächste Neuanlage (Rohtext-Kasten, alle Felder,
Schlagwörter) – so lassen sich mehrere Pferde nacheinander eintragen
(Text einfügen → Automatisch auslesen → prüfen → Speichern & nächstes
Pferd → …), ohne jedes Mal über die Übersicht zurückzuspringen. Unter
den Buttons zeigt eine Zeile, welche Pferde in dieser Sitzung bereits so
gespeichert wurden.

Beim Aktualisieren eines bestehenden Pferds zeigt der Banner in der
Übersicht nach dem Speichern zusätzlich, welche Felder sich dabei
tatsächlich geändert haben (z.B. „Geändert: ZZL, Bild, Turnierwerte“).
Bekommt ein Pferd bei diesem Speichervorgang neu die Zuchtzulassung
(vorher nicht „Ja“, jetzt „Ja“), weist der Banner zusätzlich darauf hin,
das Bild zu aktualisieren – ein einmaliger Hinweis genau bei dieser
Änderung, nicht bei jedem weiteren Speichern eines bereits zugelassenen
Pferds.

**Dopplungs-Check beim Anlegen**: Name- und ID-Treffer (siehe
[4.2](#42-stammdaten)) werden ohne Rückfrage automatisch ergänzt, da
beide eindeutig sind. Trägst du dagegen ein vermeintlich neues Pferd mit
einem **anderen** Namen und einer **anderen (oder gar keiner)** ID ein,
aber es gibt bereits einen Datensatz mit **identischem GP, Ext, Ext% und
Int**, öffnet sich vor dem Speichern ein Popup mit einer
Gegenüberstellung (Name/Besitzer/ID/Werte) von neuem und bereits
vorhandenem Datensatz – hier wird nachgefragt, da rein zufällig gleiche
Werte nicht ausgeschlossen sind. „Ja, Datensatz ergänzen“ aktualisiert
das bereits vorhandene Pferd (auch der Name wird übernommen) statt es
doppelt anzulegen – nützlich z.B. bei einem Fohlen, das zuerst
automatisch als „Fohlen_Mutter X Vater“ angelegt und jetzt unter seinem
echten Namen erneut eingetragen wird. „Nein, neu anlegen“ legt wie
gewohnt einen neuen, separaten Datensatz an.

Hat der gefundene, bereits vorhandene Datensatz dabei Schlagwörter, die
im gerade ausgefüllten Formular nicht angehakt sind (weil du ja nicht
wissen konntest, dass es das Pferd schon gibt), fragt ein zusätzliches
Popup nach: „OK“ behält die bereits vorhandenen Schlagwörter und ergänzt
die neu angehakten dazu, „Abbrechen“ entfernt die nicht angehakten und
übernimmt nur die aus dem aktuellen Formular.

---

## 5. Pferd ansehen

Klickst du in der Übersicht auf den Namen eines Pferds, öffnet sich eine
reine Ansichtsseite – alle Felder sind hier nur zum Lesen, nichts lässt
sich versehentlich verändern. Ist ein Bild hinterlegt, erscheint es groß
oben auf der Seite; darunter stehen, wann das Pferd zuletzt bearbeitet
wurde und (bei eingetragenem Geburtsdatum) sein Alter in Spieljahren.
Dieselben 4 Reiter wie beim Bearbeiten
(siehe [Abschnitt 4](#4-pferd-anlegen-oder-bearbeiten)) gliedern auch
hier die Ansicht.

- **✏️ Bearbeiten** – wechselt ins normale Bearbeiten-Formular.
- **🔗 Zum Pferd** – nur sichtbar, wenn eine Spiel-ID hinterlegt ist,
  öffnet die Pferdeseite im Spiel in einem neuen Tab.
- **🗑️ Löschen** – wie in der Übersicht, endgültig.
- **← / →** – blättert alphabetisch durch **alle** Pferde (nicht nur
  deine eigenen wie beim Bearbeiten), da du beim reinen Ansehen ja auch
  fremde Pferde durchstöbern können sollst.
- Zeigt dieselben erkannten Detaildaten wie das Bearbeiten-Formular
  (siehe [4.4](#44-erkannte-daten-ansehen)), allerdings ohne die
  Klick-Buttons zur manuellen Gen-/Erbkrankheiten-Bestätigung – hier
  wird nur angezeigt, was bereits hinterlegt ist.

---

## 6. Verpaarungs-Log

Hier trägst du Decksprünge ein (welcher Deckhengst mit welcher Stute
verpaart wurde) – unabhängig von den eigentlichen Pferde-Datensätzen.

### 6.1 Neue Verpaarung eintragen

1. Deckhengst und Stute eintragen (Pflichtfelder). Beim Tippen bekommst
   du Namensvorschläge aus der Pferdedatenbank, du kannst aber auch
   Pferde eintragen, die gar nicht in dieser Datenbank stehen.
2. Optional: Abfohldatum, „Fohlen behalten?“ (Ja/Nein/unbekannt),
   Besitzer (ist vorbelegt mit deinem eigenen Benutzernamen), Notizen.
3. „Eintragen“ klicken.

Setzt du „Fohlen behalten?“ dabei direkt auf Ja oder Nein (nicht
„unbekannt“), öffnet sich sofort das Fohlen-Popup (siehe 6.3).

### 6.2 Die Tabelle

Spalten: Deckhengst, Stute, Rasse (wird automatisch anhand der Namen
ermittelt, falls beide als eigene Pferde in der Datenbank stehen),
Abfohldatum, „Fohlen behalten?“ (zwei Buttons ✓/✗ zum direkten
Anklicken), Notizen, Besitzer, Aktionen. Sortierbar per Klick auf
Deckhengst, Stute oder Abfohldatum. Der Besitzer-Filter zeigt
standardmäßig nur deine eigenen Verpaarungen – du kannst aber jederzeit
auf einen anderen Besitzer umschalten, um dessen Verpaarungen
anzusehen.

„Fohlen behalten?“ lässt sich jederzeit über die ✓/✗-Buttons nachträglich
setzen oder ändern. War der Wert vorher unbekannt, öffnet sich danach
automatisch das Fohlen-Popup.

Beim Abfohldatum öffnet „Bearbeiten“ ein einfaches Eingabefeld (Format
JJJJ-MM-TT, leer lassen zum Entfernen). „Löschen“ entfernt den Eintrag
endgültig.

### 6.3 Fohlen-Popup

Nutzt dasselbe Formular wie „Pferd anlegen“ (siehe
[Abschnitt 4](#4-pferd-anlegen-oder-bearbeiten)), speichert die Daten
aber je nach deiner Auswahl unterschiedlich:

- **„Fohlen behalten“ = Ja**: Das Fohlen wird als **echtes neues Pferd**
  gespeichert (oder ein bestehendes aktualisiert, falls der Name schon
  existiert). Findet die Seite dabei anhand von Deckhengst und Stute
  bereits ein Pferd mit genau diesem Vater/dieser Mutter (z.B. ein
  vorher automatisch benanntes Fohlen, das jetzt unter seinem echten
  Namen erneut eingetragen wird), fragt sie nach, ob es sich um
  dasselbe Pferd handelt, und aktualisiert es dann statt es doppelt
  anzulegen.
- **„Fohlen behalten“ = Nein**: Das Fohlen wird **nicht** als Pferd in
  der Datenbank gespeichert, sondern nur als Referenzwert für die
  Fohlenwert-Schätzung im Zucht-/Turnierplaner. Du kannst diesen Schritt
  auch überspringen, wenn du die Werte nicht erfassen möchtest.

„Überspringen“ schließt das Popup, ohne etwas zu speichern.

---

## 7. Verwaltung

Diese Seite ist nur sichtbar, wenn du Verwaltungszugriff hast. Sie
enthält keine eigene Funktion, sondern eine Schritt-für-Schritt-Anleitung,
wie du neue Zugänge für andere Mitglieder anlegst, löschst oder
Passwörter zurücksetzt.

---

## 8. Durchschnittsrechner

Berechnet Durchschnittswerte (GP, Ext, Ext%, Int) über alle Pferde, die
zu den gewählten Filtern passen.

1. **Besitzer**, **Rasse**, **Geschlecht**, **ZZL**, **Schlagwörter**
   (Mehrfachauswahl, „mindestens eines der ausgewählten“, „Kein
   Schlagwort“ findet Pferde ganz ohne Schlagwort) einzeln oder
   kombiniert einschränken – jeder leere Filter („Alle“) bezieht alle
   Pferde mit ein.
2. „Berechnen“ klicken.

Das Ergebnis zeigt die Anzahl der passenden Pferde sowie je Wert den
Durchschnitt – steht bei einem Wert ein Zusatz wie „(aus 12 von 14
Pferden mit Wert)“, hatten nicht alle passenden Pferde diesen Wert
erfasst (er wird dann nur aus den vorhandenen Werten berechnet, nicht
aus allen). „Zurücksetzen“ leert alle Filter wieder.

---

## 9. Einstellungen

Persönliche Einstellungen, die nur für dein eigenes Konto gelten.

**Sichtbare Rassen in der Übersicht**: Wähle per Kästchen aus, welche
Rassen dir in der Übersicht ([Abschnitt 3](#3-übersicht-pferdeliste))
standardmäßig angezeigt werden sollen. Keine Auswahl bedeutet „alle
Rassen“ (Standard). „Speichern“ übernimmt die Auswahl sofort.

Diese Auswahl wirkt sich auch auf den Rasse-Filter in der Übersicht
selbst aus: dort stehen dann nur noch die hier ausgewählten Rassen als
Filteroptionen zur Verfügung. Über die Option „Alle (auch außerhalb
meiner Auswahl)“ lässt sich das für den Moment übersteuern und alle
Pferde unabhängig von deiner Auswahl anzeigen. Andere Nutzer*innen sind
davon nicht betroffen; die Pferde selbst werden dadurch nicht verändert
oder gelöscht, nur deine eigene Ansicht.

**💞 Verpaarungs-Log im Menü anzeigen**: Deaktivierst du diese Kästchen,
verschwindet der Menüpunkt „💞 Verpaarungs-Log“ in der Kopfzeile nur für
dein eigenes Konto – das Verpaarungs-Log selbst und alle darin
enthaltenen Daten bleiben unverändert bestehen und sind über die Adresse
`verpaarung.html` weiterhin direkt erreichbar, falls du es doch einmal
brauchst.

**Seitengröße**: Legt fest, wie groß alle Seiten der Anwendung auf
deinem Gerät angezeigt werden (70–150 %, Standard 80 %). Gilt nur für
dein eigenes Konto und wird nach „Speichern“ sofort sowie bei jedem
weiteren Login übernommen.

**Filter-Vorlagen**: Liste deiner in der Übersicht gespeicherten
Filter-Vorlagen (siehe [3.4](#34-filtern-und-suchen)). „Löschen“ wirkt
sofort und unwiderruflich, unabhängig vom „Speichern“-Button für die
anderen Einstellungen auf dieser Seite.

**Ø-Vergleich Toleranz**: Beim [Ø-Vergleich](#35-die-tabelle) in der
Übersicht gilt normalerweise jeder Wert unter dem Durchschnitt als
„schlechter“ (rot). Trägst du hier für GP/Ext/Ext%/Int jeweils eine
Toleranz ein, zählt ein Pferd trotzdem noch als akzeptabel (ungefärbt
statt rot), solange es höchstens um den eingetragenen Betrag schlechter
als der Durchschnitt ist – z.B. lässt „Ext%-Toleranz 2“ auch Pferde bis
zu 2 Punkte unter dem Ø-Ext% ungefärbt, für eine großzügigere Auswahl.
Ob ein Pferd deutlich **besser** als der Durchschnitt ist (grün), ändert
sich dadurch nicht. 0 oder leer = wie bisher, keine Toleranz.

---

## 10. Zucht-/Turnierplaner

Die Links unter „MDR-Planer“ in der Kopfzeile führen zu unserem
separaten Zucht-Planungs-Tool (alle Tools, Zuchtplaner, Turnierplaner,
Zuchtbuch, Fohlen-Tracker, Verwandtschaftsmatrix). Es greift auf
dieselbe Pferdedatenbank zu, ist aber ein eigenständiges Werkzeug mit
eigener Bedienung – diese Anleitung deckt es nicht mit ab.

---

## 11. Häufige Fragen

**Warum sehe ich bei einem Pferd andere Werte als im Spiel?**
GP, Ext, Ext% und Int werden nicht 1:1 aus dem Spiel übernommen, sondern
bei jedem Aufruf aus den erkannten Detaildaten neu berechnet (siehe
[4.4](#44-erkannte-daten-ansehen)) – Ext aus dem Durchschnitt der
Körperbau-Bewertungen, Ext% aus der genetischen Exterieur-Tabelle, Int
aus dem Durchschnitt der Mentalitäts-Bewertungen. Stimmen die
zugrundeliegenden Werte, stimmt auch das Ergebnis.

**Warum wurde mein neu eingetragenes Pferd nicht doppelt angelegt?**
Weil du wahrscheinlich denselben Namen wie ein bereits vorhandenes Pferd
verwendet hast (siehe [4.2](#42-stammdaten)) – die Seite aktualisiert in
diesem Fall automatisch das bestehende Pferd statt ein zweites
anzulegen.

**Kann ich eine Löschung rückgängig machen?**
Nein. Sowohl das Löschen einzelner Pferde/Verpaarungen als auch das
Löschen mehrerer auf einmal ist endgültig. In der Pferde-Übersicht ist
das Löschen (einzeln wie mehrfach) außerdem auf Verwaltungszugriff
beschränkt – ohne diesen siehst du dort nur noch ✏️ Bearbeiten.

**Warum sehe ich bei manchen Genen einen Hinweis wie „mindestens Ch“
statt eines eindeutigen Werts?**
Das Gen wurde nicht getestet, aber aus der Fellfarbe, der Notiz, dem
Namen oder von einem Elternteil abgeleitet (siehe
[4.4](#44-erkannte-daten-ansehen)). Solche Hinweise sind Vermutungen,
keine getesteten Werte – bist du dir sicher, kannst du sie über den
Klick-Button manuell bestätigen.
