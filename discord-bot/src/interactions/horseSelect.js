// Echtes Mehrfachauswahl-Menue (Haekchen) fuer Pferdenamen - genutzt von
// /mdrdb pferd, /mdrdb-besitzer und /mdrdb-verkaufen, sobald eine Namens-/
// Tag-/Besitzer-Suche mehr als ein, aber hoechstens 25
// Treffer ergibt (Discords Maximum je Auswahlmenue). "value" ist der
// Pferdename selbst (per DB-Constraint eindeutig, siehe pedigree.js), der
// Handler laedt beim Absenden je ausgewaehltem Namen den vollen Datensatz
// neu.
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const CUSTOM_ID_PREFIX = 'mdrdb_pick:';

function buildHorseSelectMenu(actionId, horses) {
  const options = horses.slice(0, 25).map((h) => ({
    label: h.name.length > 100 ? `${h.name.slice(0, 97)}...` : h.name,
    value: h.name,
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CUSTOM_ID_PREFIX}${actionId}`)
    .setPlaceholder(`${horses.length} Treffer - welche(s) Pferd(e)?`)
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);
  return new ActionRowBuilder().addComponents(select);
}

module.exports = { CUSTOM_ID_PREFIX, buildHorseSelectMenu };
