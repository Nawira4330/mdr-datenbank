// Parser für Basar-Verkaufslisten (siehe basar.html).
//
// Fotos von Verkaufslisten liefern über die Texterkennung (Tesseract.js,
// siehe js/basar.js) rohen, oft fehlerhaften Text - vor allem bei
// handschriftlichen Listen. Dieser Parser arbeitet daher wie js/parser.js
// "best effort": jede erkannte Zeile wird dem Nutzer vor dem Speichern in
// einer editierbaren Tabelle zur Kontrolle angezeigt, nichts wird
// automatisch ungeprüft übernommen.
//
// Bewusst EINE Verkäufernummer pro Import (nicht pro Zeile): in der Praxis
// fotografiert man die Liste einer einzelnen Verkäuferin/eines einzelnen
// Verkäufers, die Nummer wird im Formular einmal eingegeben/bestätigt statt
// unzuverlässig aus jeder einzelnen Zeile per OCR herausgelesen zu werden.

// Erkennt eine "Verkäufernummer: 12"-Zeile im eingefügten/erkannten Text,
// um das Eingabefeld dafür vorzubelegen (bleibt trotzdem editierbar).
const VERKAEUFER_LABEL_RE = /verk[äa]ufer\s*-?\s*(?:nr\.?|nummer)?\s*[:#]?\s*(\d{1,5})/i;

function detectVerkaeuferNr(rawText) {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const m = line.match(VERKAEUFER_LABEL_RE);
    if (m) return m[1];
  }
  return '';
}

// Erkennt einen Preis am Ende der Zeile - nur wenn ein Währungssymbol/-wort
// dabeisteht ODER die Zahl zwei Nachkommastellen hat (z.B. "3,50" statt
// bloß "3"), sonst würden Größenangaben ("Gr. 128") fälschlich als Preis
// erkannt.
function extractPrice(text) {
  const re = /(\d{1,4}(?:[.,]\d{2})?)\s*(€|eur(?:o)?)?\s*$/i;
  const m = text.match(re);
  if (!m) return { rest: text, preis: null };
  const hasCurrency = !!m[2];
  const hasDecimals = /[.,]\d{2}$/.test(m[1]);
  if (!hasCurrency && !hasDecimals) return { rest: text, preis: null };
  const preis = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(preis)) return { rest: text, preis: null };
  return { rest: text.slice(0, m.index).trim(), preis };
}

// Erkennt eine führende Artikelnummer ("3.", "3)", "Nr. 3", "Art.-Nr. 3",
// "#3" oder einfach "3 " am Zeilenanfang).
function extractLeadingArtikelNr(text) {
  const m = text.match(/^(?:art(?:ikel)?\.?\s*-?\s*nr\.?\s*|nr\.?\s*|#\s*)?(\d{1,5})\s*[.):\-]?\s+/i);
  if (!m) return { rest: text, artikelNr: null };
  return { rest: text.slice(m[0].length).trim(), artikelNr: m[1] };
}

// Trennt "Name - Beschreibung" bzw. "Name: Beschreibung" - ohne
// erkennbaren Trenner landet der komplette Rest im Namen (Beschreibung
// bleibt leer, kann manuell nachgetragen/verschoben werden).
function splitNameBeschreibung(text) {
  const m = text.match(/^(.+?)\s*[-–:]\s+(.+)$/);
  if (m && m[1].trim() && m[2].trim()) {
    return { name: m[1].trim(), beschreibung: m[2].trim() };
  }
  return { name: text.trim(), beschreibung: '' };
}

// Hauptfunktion: zerlegt den kompletten erkannten/eingefügten Text in
// Artikelzeilen-Vorschläge. Jede Zeile, die nicht zweifelsfrei Artikelnummer
// UND Preis lieferte, wird als "unsicher" markiert (siehe basar.js -
// entsprechend farblich hervorgehoben, aber genauso editierbar).
function parseBasarListText(rawText) {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const verkaeuferNr = detectVerkaeuferNr(rawText);
  const rows = [];

  for (const line of lines) {
    if (!line) continue;
    if (VERKAEUFER_LABEL_RE.test(line)) continue;

    const { rest: afterPrice, preis } = extractPrice(line);
    if (!afterPrice) continue;

    const { rest: afterNr, artikelNr } = extractLeadingArtikelNr(afterPrice);
    if (!afterNr) continue;

    const { name, beschreibung } = splitNameBeschreibung(afterNr);
    if (!name) continue;

    rows.push({
      artikelNr: artikelNr || '',
      name,
      beschreibung,
      preis: preis === null ? '' : preis,
      confidence: artikelNr && preis !== null ? 'ok' : 'unsicher',
      rawLine: line,
    });
  }

  return { verkaeuferNr, rows };
}

// Feste Status-Definitionen (Symbol + Label + Aktions-Text fürs Verlaufs-
// Log) - eine einzige Stelle statt in basar.js UND basar.html dupliziert.
const BASAR_STATUS = {
  bestand: { label: 'Im Bestand', symbol: '📦', aktion: 'zurück auf „Im Bestand" gesetzt' },
  verkauft: { label: 'Verkauft', symbol: '✅', aktion: 'als verkauft markiert' },
  preissenkung: { label: 'Preissenkung', symbol: '🔻', aktion: 'Preis gesenkt' },
  verloren: { label: 'Verloren', symbol: '❌', aktion: 'als verloren markiert' },
};

function formatPreis(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Wandelt eine Nutzereingabe ("12,50", "12.50", "12,5") in eine Zahl fürs
// DB-Feld (numeric) um - null bei leerem/ungültigem Wert.
function parsePreisInput(str) {
  if (str === null || str === undefined || String(str).trim() === '') return null;
  const num = parseFloat(String(str).trim().replace(',', '.'));
  return Number.isNaN(num) ? null : num;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseBasarListText, detectVerkaeuferNr, extractPrice, extractLeadingArtikelNr,
    splitNameBeschreibung, formatPreis, parsePreisInput, BASAR_STATUS,
  };
}
