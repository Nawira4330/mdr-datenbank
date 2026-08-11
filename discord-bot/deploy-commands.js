// Registriert den /mdrdb Slash-Command bei Discord. Mit gesetzter GUILD_ID
// (siehe .env.example) ist der Command sofort auf diesem Server nutzbar,
// ohne GUILD_ID wird global registriert (kann bis zu 1 Stunde dauern).
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('./src/config');

// "rassen" und "kanal" sind bewusst EIGENE Top-Level-Commands (nicht
// Unterbefehle von /mdrdb) - nur so kann Discord sie normalen Nutzer*innen
// in der Befehlsliste komplett ausblenden (setDefaultMemberPermissions
// wirkt nur auf ganze Commands, nicht auf einzelne Unterbefehle). Wer die
// Berechtigung nicht hat, sieht diese Befehle beim Tippen von "/" gar
// nicht erst. Die Rechteprüfung passiert zusätzlich manuell im Bot (siehe
// requireAdmin in src/index.js) - Server-Admins können ueber die
// "Integrationen"-Einstellungen einzelne Befehle nachtraeglich fuer
// weitere Rollen freigeben, die manuelle Pruefung bleibt daher als
// zweite Absicherung bestehen.
const commands = [
  new SlashCommandBuilder()
    .setName('mdrdb')
    .setDescription('MDR Pferdedatenbank')
    .addSubcommand((sub) =>
      sub
        .setName('pferd')
        .setDescription('Zeigt Pferdedaten aus der MDR-Pferdedatenbank an')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Name des Pferdes')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('hilfe')
        .setDescription('Zeigt eine Uebersicht aller /mdrdb-Befehle'),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mdrdb-rassen')
    .setDescription('Legt fest, welche Rassen auf diesem Server durchsuchbar sind (nur Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mdrdb-kanal')
    .setDescription('Legt fest, welche Pferde (Zuchtzulassung/Geschlecht) in diesem Kanal angezeigt werden (nur Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mdrdb-tag')
    .setDescription('Listet Pferde mit einem bestimmten Schlagwort auf')
    .addStringOption((option) =>
      option
        .setName('tag')
        .setDescription('Welches Schlagwort?')
        .setRequired(true)
        .addChoices(
          { name: 'Verkauf', value: 'Verkauf' },
          { name: 'Reserviert', value: 'Reserviert' },
          { name: 'Bleibt', value: 'Bleibt' },
          { name: 'GBH', value: 'GBH' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('pferd')
        .setDescription('Optional: Ergebnis eingrenzen (nur Pferde mit dem gewaehlten Tag)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .toJSON(),
  // "verkaufen" und "besitzer" sind bewusst zwei getrennte Befehle statt
  // einer gemeinsamen Aktion: /mdrdb-verkaufen setzt nur das Schlagwort
  // "Verkauf" (Pferd gehoert der verkaufenden Person noch), /mdrdb-besitzer
  // vollzieht die eigentliche Uebergabe und entfernt dabei automatisch das
  // "Verkauf"-Schlagwort (siehe tags.js/index.js). Beide sind oeffentlich
  // sichtbar (keine setDefaultMemberPermissions) - die eigentliche
  // Berechtigungspruefung (nur der/die aktuelle Besitzer*in laut
  // Besitzer-Feld, plus Bot-Owner) passiert manuell im Code
  // (requireHorseOwner in index.js), da sie sich nicht ueber Discords
  // rollenbasierte Berechtigungen abbilden laesst.
  new SlashCommandBuilder()
    .setName('mdrdb-verkaufen')
    .setDescription('Markiert ein Pferd als verkauft (Schlagwort "Verkauf" + Kaeufer) - nur fuer den/die Besitzer*in')
    .addStringOption((option) =>
      option.setName('pferd').setDescription('Name des Pferdes').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((option) =>
      option.setName('kaeufer').setDescription('An wen wurde verkauft?').setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mdrdb-besitzer')
    .setDescription('Aendert den Besitzer eines Pferdes (entfernt Schlagwort "Verkauf") - nur fuer den/die Besitzer*in')
    .addStringOption((option) =>
      option.setName('pferd').setDescription('Name des Pferdes').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((option) =>
      option.setName('neuer_besitzer').setDescription('Name des neuen Besitzers/der neuen Besitzerin').setRequired(true),
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discordToken);

async function main() {
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: commands });

  console.log(
    config.guildId
      ? `/mdrdb wurde fuer Server ${config.guildId} registriert.`
      : '/mdrdb wurde global registriert (kann bis zu 1 Stunde dauern, bis Discord es anzeigt).',
  );
}

main().catch((err) => {
  console.error('Registrieren der Commands fehlgeschlagen:', err);
  process.exit(1);
});
