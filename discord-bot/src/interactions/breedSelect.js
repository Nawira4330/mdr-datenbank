const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const supabase = require('../supabaseClient');
const { getGuildSettings, setAllowedBreeds } = require('../settings');
const { breedLabel } = require('../filters');

const CUSTOM_ID = 'mdrdb_rassen_select';
// Discord-Limit fuer Optionen in einem String-Select-Menu.
const MAX_OPTIONS = 25;

// Alle tatsaechlich in der Datenbank vorkommenden Rassen (inkl.
// "Rasselos" fuer Pferde ohne eingetragene Rasse) - dieselbe Bezeichnung
// wie im Haupt-Embed (siehe horseStats.js breedDisplay), damit Auswahl
// und Anzeige konsistent sind.
async function fetchAvailableBreeds() {
  const { data, error } = await supabase.from('horses').select('breed');
  const set = new Set(['Rasselos']);
  if (!error && data) {
    for (const row of data) set.add(breedLabel(row));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'de')).slice(0, MAX_OPTIONS);
}

async function buildBreedSelectRow(guildId) {
  const breeds = await fetchAvailableBreeds();
  const current = new Set(getGuildSettings(guildId).allowedBreeds);

  const select = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_ID)
    .setPlaceholder('Rassen auswaehlen (leer = keine Einschraenkung)')
    .setMinValues(0)
    .setMaxValues(breeds.length)
    .addOptions(breeds.map((b) => ({ label: b, value: b, default: current.has(b) })));

  return new ActionRowBuilder().addComponents(select);
}

async function handleBreedSelect(interaction) {
  setAllowedBreeds(interaction.guildId, interaction.values);

  const text = interaction.values.length
    ? `Auf diesem Server sind jetzt nur folgende Rassen durchsuchbar: **${interaction.values.join(', ')}**.`
    : 'Keine Rassen-Einschraenkung mehr aktiv - alle Rassen sind durchsuchbar.';

  await interaction.update({ content: text, components: [] });
}

module.exports = { CUSTOM_ID, buildBreedSelectRow, handleBreedSelect };
