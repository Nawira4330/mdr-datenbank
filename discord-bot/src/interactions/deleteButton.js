const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Traegt die Nutzer-ID der Person, die den urspruenglichen Befehl
// ausgefuehrt hat, direkt im customId - kein eigener Zustand noetig, um
// spaeter zu wissen, wer loeschen darf. Discord-Bots duerfen ihre eigenen
// Nachrichten immer loeschen (keine "Manage Messages"-Berechtigung
// noetig), daher reicht die Pruefung "ist die klickende Person dieselbe
// wie die urspruengliche" aus - unabhaengig von Server-Rollen.
const CUSTOM_ID_PREFIX = 'mdrdb_delete:';

function buildDeleteRow(userId) {
  const button = new ButtonBuilder()
    .setCustomId(`${CUSTOM_ID_PREFIX}${userId}`)
    .setLabel('Löschen')
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(button);
}

async function handleDeleteButton(interaction) {
  const ownerId = interaction.customId.slice(CUSTOM_ID_PREFIX.length);
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: 'Nur die Person, die diesen Befehl ausgeführt hat, kann diese Nachricht löschen.',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferUpdate();
  await interaction.message.delete();
}

module.exports = { CUSTOM_ID_PREFIX, buildDeleteRow, handleDeleteButton };
