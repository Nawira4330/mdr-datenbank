const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// customId traegt die Pferd-UUID, damit der Handler beim Klick weiss, um
// welches Pferd es geht, ohne serverseitig einen Sitzungs-Zustand
// vorzuhalten.
function buildSubmenu(horseId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`mdrdb_menu:${horseId}`)
    .setPlaceholder('Weitere Informationen anzeigen…')
    .addOptions(
      { label: '1 - Eltern anzeigen', value: 'parents' },
      { label: '2 - Geschwister/Halbgeschwister (Vater) anzeigen', value: 'siblings_father' },
      { label: '3 - Geschwister/Halbgeschwister (Mutter) anzeigen', value: 'siblings_mother' },
      { label: '4 - Nachkommen anzeigen', value: 'offspring' },
      { label: '5 - fertig', value: 'done' },
    );

  return new ActionRowBuilder().addComponents(select);
}

module.exports = { buildSubmenu };
