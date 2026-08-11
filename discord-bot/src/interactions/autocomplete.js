const supabase = require('../supabaseClient');
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
async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused() || '';

  let query = supabase
    .from('horses')
    .select('name, breed, breeding_allowed, gender')
    .order('name')
    .limit(FETCH_LIMIT);
  if (focused.trim()) query = query.ilike('name', `%${focused.trim()}%`);

  const { data, error } = await query;
  if (error || !data) {
    await interaction.respond([]);
    return;
  }

  let filtered = data;
  if (interaction.inGuild()) {
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelSettings = getChannelSettings(interaction.channelId);
    filtered = data.filter((h) => horseMatchesFilters(h, guildSettings, channelSettings));
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
