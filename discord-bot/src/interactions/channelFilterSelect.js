const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getChannelSettings, setChannelZzlFilter, setChannelAllowedGenders } = require('../settings');
const { GENDER_GROUPS } = require('../filters');

const ZZL_CUSTOM_ID = 'mdrdb_kanal_zzl_select';
const GENDER_CUSTOM_ID = 'mdrdb_kanal_gender_select';

const ZZL_OPTIONS = [
  { value: 'none', label: 'Alle Pferde (kein Filter)' },
  { value: 'without', label: 'Nur Pferde ohne Zuchtzulassung' },
  { value: 'with', label: 'Nur Pferde mit Zuchtzulassung' },
];

const ZZL_LABEL = { none: 'alle', without: 'nur ohne ZZL', with: 'nur mit ZZL' };

// Nur die 3 erwachsenen Kategorien zur Auswahl - "Stute" schliesst
// Stutfohlen automatisch mit ein, "Hengst" entsprechend Hengstfohlen
// (siehe GENDER_GROUPS in filters.js). "keine Auswahl" (leeres Array)
// bedeutet kein Filter, alle Geschlechter werden angezeigt.
const GENDER_OPTIONS = Object.keys(GENDER_GROUPS);

function buildZzlRow(channelId) {
  const current = getChannelSettings(channelId).zzlFilter;
  const select = new StringSelectMenuBuilder()
    .setCustomId(ZZL_CUSTOM_ID)
    .setPlaceholder('Zuchtzulassungs-Filter')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(ZZL_OPTIONS.map((o) => ({ ...o, default: o.value === current })));
  return new ActionRowBuilder().addComponents(select);
}

function buildGenderRow(channelId) {
  const current = new Set(getChannelSettings(channelId).allowedGenders);
  const select = new StringSelectMenuBuilder()
    .setCustomId(GENDER_CUSTOM_ID)
    .setPlaceholder('Geschlecht-Filter (keine Auswahl = alle anzeigen)')
    .setMinValues(0)
    .setMaxValues(GENDER_OPTIONS.length)
    .addOptions(GENDER_OPTIONS.map((g) => ({ label: g, value: g, default: current.has(g) })));
  return new ActionRowBuilder().addComponents(select);
}

// Beide Filter stehen als unabhaengige Auswahlmenues in derselben
// Nachricht - Aendern des einen laesst den anderen unveraendert (siehe
// handleZzlSelect/handleGenderSelect, die beide Zeilen neu aufbauen,
// damit die jeweils andere Auswahl sichtbar/vorbelegt erhalten bleibt).
function buildChannelFilterRows(channelId) {
  return [buildZzlRow(channelId), buildGenderRow(channelId)];
}

function describeChannelFilters(channelId) {
  const s = getChannelSettings(channelId);
  const genderText = s.allowedGenders.length ? s.allowedGenders.join(', ') : 'alle';
  return (
    `Aktuelle Filter für diesen Kanal:\n` +
    `Zuchtzulassung: **${ZZL_LABEL[s.zzlFilter]}**\n` +
    `Geschlecht: **${genderText}**`
  );
}

async function handleZzlSelect(interaction) {
  setChannelZzlFilter(interaction.channelId, interaction.values[0]);
  await interaction.update({
    content: describeChannelFilters(interaction.channelId),
    components: buildChannelFilterRows(interaction.channelId),
  });
}

async function handleGenderSelect(interaction) {
  setChannelAllowedGenders(interaction.channelId, interaction.values);
  await interaction.update({
    content: describeChannelFilters(interaction.channelId),
    components: buildChannelFilterRows(interaction.channelId),
  });
}

module.exports = {
  ZZL_CUSTOM_ID,
  GENDER_CUSTOM_ID,
  buildChannelFilterRows,
  describeChannelFilters,
  handleZzlSelect,
  handleGenderSelect,
};
