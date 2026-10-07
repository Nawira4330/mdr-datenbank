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
        .setDescription('Zeigt Pferdedaten an - nach Name und/oder Schlagwort/Besitzer durchsuchbar')
        .addStringOption((option) =>
          option.setName('name').setDescription('Optional: (Teil-)Name des Pferdes').setRequired(false).setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('tag')
            .setDescription('Optional: nur Pferde mit diesem Schlagwort')
            .setRequired(false)
            .addChoices(
              { name: 'Verkauf', value: 'Verkauf' },
              { name: 'Reserviert', value: 'Reserviert' },
              { name: 'Bleibt', value: 'Bleibt' },
              { name: 'GBH', value: 'GBH' },
              { name: 'LastFoal', value: 'LastFoal' },
              { name: '???', value: '???' },
              { name: 'Exen', value: 'Exen' },
              { name: 'FT', value: 'FT' },
              { name: 'Turnier', value: 'Turnier' },
              { name: 'Beritt', value: 'Beritt' },
              { name: 'Zucht', value: 'Zucht' },
              { name: 'Training', value: 'Training' },
            ),
        )
        .addStringOption((option) =>
          option.setName('besitzer').setDescription('Optional: nur Pferde mit diesem Besitzer').setRequired(false),
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
    .setDescription('Legt fest, welche Rassen auf diesem Server durchsuchbar sind (nur "Server verwalten")')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mdrdb-kanal')
    .setDescription('Legt fest, welche Pferde in diesem Kanal angezeigt werden (nur "Server verwalten")')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  // "verkaufen" und "besitzer": bewusst deaktiviert (Nutzerwunsch
  // 2026-10-04) - aus der Registrierung genommen, damit sie bei Discord
  // beim Tippen von "/" gar nicht mehr erscheinen. Implementierung bleibt
  // vollstaendig erhalten (siehe handleVerkaufenCommand/
  // handleBesitzerCommand in index.js, dort zusaetzlich per Sperre
  // abgesichert) - zum Reaktivieren hier einfach wieder einkommentieren
  // und deploy-commands.js erneut ausfuehren.
  // new SlashCommandBuilder()
  //   .setName('mdrdb-verkaufen')
  //   .setDescription('Markiert ein Pferd als verkauft (Schlagwort "Verkauf" + Kaeufer) - nur fuer den/die Besitzer*in')
  //   .addStringOption((option) =>
  //     option.setName('pferd').setDescription('Name des Pferdes').setRequired(true).setAutocomplete(true),
  //   )
  //   .addStringOption((option) =>
  //     option.setName('kaeufer').setDescription('An wen wurde verkauft?').setRequired(true),
  //   )
  //   .toJSON(),
  // new SlashCommandBuilder()
  //   .setName('mdrdb-besitzer')
  //   .setDescription('Aendert den Besitzer eines Pferdes (entfernt Schlagwort "Verkauf") - nur fuer den/die Besitzer*in')
  //   .addStringOption((option) =>
  //     option.setName('pferd').setDescription('Name des Pferdes').setRequired(true).setAutocomplete(true),
  //   )
  //   .addStringOption((option) =>
  //     option.setName('neuer_besitzer').setDescription('Name des neuen Besitzers/der neuen Besitzerin').setRequired(true),
  //   )
  //   .toJSON(),
  // Speichert die Discord-ID -> Besitzername Zuordnung lokal (siehe
  // registrations.js) - keine Admin-Beschraenkung, jede Person registriert
  // nur sich selbst.
  new SlashCommandBuilder()
    .setName('mdrdb-register')
    .setDescription('Hinterlegt deinen Besitzernamen fuer die Namenssuche (zeigt dir ueberall nur eigene Pferde)')
    .addStringOption((option) =>
      option.setName('besitzername').setDescription('Dein Name wie im Besitzer-Feld der Pferde').setRequired(true),
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
