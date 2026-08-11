const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// customId traegt die Pferd-UUID, damit der Handler beim Klick weiss, um
// welches Pferd es geht, ohne serverseitig einen Sitzungs-Zustand
// vorzuhalten.
function buildSubmenu(horseId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`mdrdb_menu:${horseId}`)
    .setPlaceholder('Weitere Informationen anzeigen…')
    .addOptions(
      // "Eltern anzeigen" gibt es hier bewusst nicht mehr - die Eltern
      // stehen seit dem entsprechenden Update immer schon direkt in der
      // Hauptkarte (siehe buildHorseEmbed in embeds.js), ein eigener
      // Menuepunkt dafuer waere nur noch redundant.
      { label: '1 - Geschwister/Halbgeschwister (Vater) anzeigen', value: 'siblings_father' },
      { label: '2 - Geschwister/Halbgeschwister (Mutter) anzeigen', value: 'siblings_mother' },
      { label: '3 - Nachkommen anzeigen', value: 'offspring' },
      { label: '4 - fertig', value: 'done' },
    );

  return new ActionRowBuilder().addComponents(select);
}

module.exports = { buildSubmenu };
