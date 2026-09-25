// Eltern/Geschwister/Nachkommen gibt es nicht als DB-Relation - "pedigree"
// ist laut Hauptrepo-README nur eine unsortierte Namensliste. Diese Logik
// spiegelt fetchParentRecords in ../../js/horseForm.js: die ersten beiden
// Vorfahren sind immer Vater, dann Mutter (Legacy-Array: eigener Eintrag an
// Position 0, ancestors ab Position 1). Da "name" per Unique-Index
// eindeutig ist, ist der Namensabgleich zuverlaessig.
const supabase = require('./supabaseClient');

const HORSE_COLUMNS = [
  'id', 'name', 'gender', 'breed', 'coat_color', 'colors', 'notes', 'owner',
  'exterior_genetics', 'exterior_descriptive', 'temperament', 'tournament_potential', 'pedigree',
  'breeding_allowed', 'hlp_slp', 'tags', 'birthdate',
].join(', ');

const PAGE_SIZE = 1000;

function getParentNames(horse) {
  const pedigree = horse.pedigree;
  const ancestors = Array.isArray(pedigree) ? pedigree.slice(1) : (pedigree?.ancestors || []);
  return {
    father: ancestors[0]?.name || null,
    mother: ancestors[1]?.name || null,
  };
}

// Laedt alle Pferde mit den fuer Anzeige/Abgleich noetigen Spalten (kein
// select('*'), um raw_text/image_url etc. bei potenziell vielen Zeilen nicht
// unnoetig mitzuladen). Paginiert per .range(), falls die Tabelle die
// PostgREST-Standardgrenze (1000 Zeilen) ueberschreitet.
async function fetchAllHorsesFromServer() {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('horses')
      .select(HORSE_COLUMNS)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase-Fehler beim Laden der Pferde: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// Egress-Caching (Bugreport "Supabase-Egress über dem Free-Plan-
// Kontingent"): anders als ein Browser-Tab läuft der Bot dauerhaft als
// EIN Prozess, der von mehreren Discord-Servern gleichzeitig genutzt
// werden kann - fetchAllHorsesLight() wurde bisher bei JEDEM Aufruf neu
// vom Server geladen, u.a. bei JEDEM Tastendruck in zwei verschiedenen
// Autocomplete-Feldern (siehe interactions/autocomplete.js) - der teuerste
// Pfad im ganzen Bot. Hält das Ergebnis jetzt kurz im Prozess-Speicher
// (CACHE_TTL_MS): mehrere Aufrufe innerhalb dieses Fensters (mehrere
// Tastendrücke, mehrere Nutzer kurz hintereinander) teilen sich EINEN
// tatsächlichen Abruf - die Promise selbst wird gecacht (nicht erst das
// Ergebnis), damit auch GLEICHZEITIGE Aufrufe (z.B. mehrere Discord-Server
// zur selben Sekunde) nur einen einzigen Request auslösen.
// invalidateHorsesCache() sorgt dafür, dass die beiden schreibenden Befehle
// (/mdrdb-verkaufen, /mdrdb-besitzer) sofort wieder frische Daten sehen,
// statt bis zum Ablauf der TTL zu warten - Änderungen über die
// Weboberfläche/mdr-planer werden dagegen erst nach spätestens
// CACHE_TTL_MS sichtbar (bei einer Zucht-Datenbank ohne
// Sekundenanforderungen unproblematisch, siehe Nutzerwunsch "ohne die
// Nutzung einzuschränken oder zu beeinflussen").
const CACHE_TTL_MS = 60 * 1000;
let horsesCachePromise = null;
let horsesCacheTime = 0;

async function fetchAllHorsesLight() {
  const now = Date.now();
  if (horsesCachePromise && now - horsesCacheTime < CACHE_TTL_MS) return horsesCachePromise;
  horsesCacheTime = now;
  horsesCachePromise = fetchAllHorsesFromServer().catch((err) => {
    // Ein fehlgeschlagener Abruf soll nicht für die volle TTL "gecacht"
    // bleiben - der nächste Aufruf soll es sofort erneut versuchen statt
    // bis zu 60 Sekunden lang denselben Fehler zurückzugeben.
    horsesCachePromise = null;
    throw err;
  });
  return horsesCachePromise;
}

function invalidateHorsesCache() {
  horsesCachePromise = null;
}

// weiblich vor maennlich vor unbekannt, innerhalb dessen alphabetisch nach
// Name - "sortiert nach Geschlecht" aus der Aufgabenstellung.
const GENDER_GROUP = {
  Stute: 0, Stutfohlen: 0,
  Hengst: 1, Wallach: 1, Hengstfohlen: 1,
};

function sortByGender(list) {
  return [...list].sort((a, b) => {
    const ga = GENDER_GROUP[a.gender] ?? 2;
    const gb = GENDER_GROUP[b.gender] ?? 2;
    if (ga !== gb) return ga - gb;
    return (a.name || '').localeCompare(b.name || '', 'de');
  });
}

// Geschwister/Halbgeschwister getrennt nach gemeinsamem Elternteil statt
// nach Voll-/Halbgeschwister - ein Vollgeschwister (teilt beide Eltern)
// taucht dabei in BEIDEN Listen auf, da es sowohl den Vater als auch die
// Mutter teilt. Das Pferd selbst wird ausgeschlossen.
function findSiblingsByFather(horse, allHorses) {
  const { father } = getParentNames(horse);
  if (!father) return [];
  const matches = allHorses.filter((other) => other.name !== horse.name && getParentNames(other).father === father);
  return sortByGender(matches);
}

function findSiblingsByMother(horse, allHorses) {
  const { mother } = getParentNames(horse);
  if (!mother) return [];
  const matches = allHorses.filter((other) => other.name !== horse.name && getParentNames(other).mother === mother);
  return sortByGender(matches);
}

function findOffspring(horse, allHorses) {
  const offspring = allHorses.filter((other) => {
    const { father, mother } = getParentNames(other);
    return father === horse.name || mother === horse.name;
  });
  return sortByGender(offspring);
}

module.exports = {
  getParentNames,
  fetchAllHorsesLight,
  invalidateHorsesCache,
  findSiblingsByFather,
  findSiblingsByMother,
  findOffspring,
  sortByGender,
};
