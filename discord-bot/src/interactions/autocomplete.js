const { getGuildSettings, getChannelSettings } = require('../settings');
const { horseMatchesFilters } = require('../filters');
const { fetchAllHorsesLight } = require('../pedigree');

const RESULT_LIMIT = 25;
// Es wird mehr als RESULT_LIMIT geladen, da Rassen-/Kanal-Filter danach
// clientseitig angewendet werden - sonst koennten nach dem Filtern
// weniger als 25 (obwohl eigentlich mehr Treffer existieren) uebrig
// bleiben.
const FETCH_LIMIT = 100;

// Namenssuche fuer die /mdrdb-Dropdown-Eingabe - Discord erlaubt max. 25
// Vorschlaege pro Autocomplete-Antwort. Beruecksichtigt die auf diesem
// Server/in diesem Kanal per "/mdrdb rassen"/"/mdrdb kanal" gesetzten
// Einschraenkungen (siehe settings.js/filters.js), damit im Dropdown gar
// nicht erst Pferde auftauchen, die dort ohnehin nicht angezeigt werden.
//
// Bugreport (Egress): las bisher bei JEDEM Tastendruck live aus der
// Datenbank (eigene .ilike()-Abfrage) - dieses Feld feuert in DREI
// Befehlen (/mdrdb, /mdrdb-verkaufen, /mdrdb-besitzer), war also der
// mit Abstand haeufigste DB-Zugriff im ganzen Bot. Nutzt jetzt denselben
// kurzlebigen Prozess-Cache wie handleTagPferdAutocomplete
// (fetchAllHorsesLight, siehe pedigree.js) und filtert im Speicher statt
// pro Tastendruck neu abzufragen - Verhalten (Reihenfolge/Limit/Filter)
// bleibt identisch, nur die Datenquelle ist jetzt der Cache.
async function handleAutocomplete(interaction) {
  const focused = (interaction.options.getFocused() || '').trim().toLowerCase();

  let allHorses;
  try {
    allHorses = await fetchAllHorsesLight();
  } catch {
    await interaction.respond([]);
    return;
  }

  let matches = focused ? allHorses.filter((h) => (h.name || '').toLowerCase().includes(focused)) : allHorses;
  matches = [...matches]
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
    .slice(0, FETCH_LIMIT);

  let filtered = matches;
  if (interaction.inGuild()) {
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelSettings = getChannelSettings(interaction.channelId);
    filtered = matches.filter((h) => horseMatchesFilters(h, guildSettings, channelSettings));
  }

  await interaction.respond(filtered.slice(0, RESULT_LIMIT).map((h) => ({ name: h.name, value: h.name })));
}

// Namenssuche fuer die "pferd"-Option von /mdrdb-tag - schlaegt anders als
// handleAutocomplete() oben NUR Pferde vor, die das in derselben Eingabe
// bereits gewaehlte "tag" tragen (per interaction.options.getString('tag')
// aus der noch laufenden Interaktion gelesen, kein eigener Zustand noetig).
// Ist "tag" noch nicht gewaehlt (z.B. wenn zuerst in "pferd" getippt wird),
// gibt es noch keine sinnvolle Eingrenzung - dann leere Vorschlagsliste.
async function handleTagPferdAutocomplete(interaction) {
  const tagLabel = interaction.options.getString('tag');
  if (!tagLabel) {
    await interaction.respond([]);
    return;
  }

  const focused = (interaction.options.getFocused() || '').trim().toLowerCase();
  const allHorses = await fetchAllHorsesLight();
  let matches = allHorses.filter((h) => (h.tags || []).some((t) => t.label === tagLabel));
  if (focused) matches = matches.filter((h) => (h.name || '').toLowerCase().includes(focused));

  if (interaction.inGuild()) {
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelSettings = getChannelSettings(interaction.channelId);
    matches = matches.filter((h) => horseMatchesFilters(h, guildSettings, channelSettings));
  }

  await interaction.respond(matches.slice(0, RESULT_LIMIT).map((h) => ({ name: h.name, value: h.name })));
}

module.exports = { handleAutocomplete, handleTagPferdAutocomplete };
