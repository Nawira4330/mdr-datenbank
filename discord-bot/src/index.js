const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const { fetchHorseByName, fetchHorseById } = require('./horses');
const {
  getParentNames,
  fetchAllHorsesLight,
  findSiblingsByFather,
  findSiblingsByMother,
  findOffspring,
  sortByGender,
} = require('./pedigree');
const { getGuildSettings, getChannelSettings } = require('./settings');
const { horseMatchesFilters } = require('./filters');
const {
  buildHorseEmbed,
  buildSiblingsEmbed,
  buildOffspringEmbed,
  buildTagSearchEmbed,
  buildHelpEmbed,
} = require('./embeds');
const { setTag, removeTag } = require('./tags');
const supabaseService = require('./supabaseServiceClient');
const { buildSubmenu } = require('./interactions/submenu');
const { handleAutocomplete, handleTagPferdAutocomplete } = require('./interactions/autocomplete');
const { CUSTOM_ID: RASSEN_CUSTOM_ID, buildBreedSelectRow, handleBreedSelect } = require('./interactions/breedSelect');
const {
  ZZL_CUSTOM_ID,
  GENDER_CUSTOM_ID,
  buildChannelFilterRows,
  describeChannelFilters,
  handleZzlSelect,
  handleGenderSelect,
} = require('./interactions/channelFilterSelect');
const { CUSTOM_ID_PREFIX: DELETE_CUSTOM_ID_PREFIX, buildDeleteRow, handleDeleteButton } = require('./interactions/deleteButton');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Eingeloggt als ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // "pferd" wird auch von /mdrdb-verkaufen und /mdrdb-besitzer genutzt
    // (beide haben ebenfalls eine "pferd"-Option mit Autocomplete) -
    // handleAutocomplete liest die Option generisch ueber getFocused(),
    // ist also unabhaengig vom konkreten Befehlsnamen wiederverwendbar.
    // /mdrdb-tag braucht dagegen eine eigene Autocomplete-Funktion, da dort
    // nur Pferde mit dem bereits gewaehlten "tag" vorgeschlagen werden
    // sollen (siehe handleTagPferdAutocomplete).
    if (interaction.isAutocomplete() && interaction.commandName === 'mdrdb-tag') {
      await handleTagPferdAutocomplete(interaction);
      return;
    }
    if (
      interaction.isAutocomplete() &&
      ['mdrdb', 'mdrdb-verkaufen', 'mdrdb-besitzer'].includes(interaction.commandName)
    ) {
      await handleAutocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'pferd') await handleMdrdbCommand(interaction);
      else if (sub === 'hilfe') await handleHilfeCommand(interaction);
      return;
    }
    // "rassen"/"kanal"/"tag"/"verkaufen"/"besitzer" sind eigene
    // Top-Level-Commands (siehe deploy-commands.js) statt Unterbefehle von
    // /mdrdb, damit Discord "rassen"/"kanal" normalen Nutzer*innen in der
    // Befehlsliste komplett ausblenden kann (setDefaultMemberPermissions
    // wirkt nur auf ganze Commands). "tag"/"verkaufen"/"besitzer" bleiben
    // aus demselben technischen Grund ebenfalls eigene Top-Level-Commands,
    // sind aber bewusst fuer alle sichtbar.
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-rassen') {
      await handleRassenCommand(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-kanal') {
      await handleKanalCommand(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-tag') {
      await handleTagCommand(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-verkaufen') {
      await handleVerkaufenCommand(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-besitzer') {
      await handleBesitzerCommand(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('mdrdb_menu:')) {
      await handleSubmenu(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === RASSEN_CUSTOM_ID) {
      await handleBreedSelect(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === ZZL_CUSTOM_ID) {
      await handleZzlSelect(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === GENDER_CUSTOM_ID) {
      await handleGenderSelect(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith(DELETE_CUSTOM_ID_PREFIX)) {
      await handleDeleteButton(interaction);
      return;
    }
  } catch (err) {
    console.error(err);
    const payload = { content: 'Es ist ein Fehler aufgetreten. Bitte spaeter erneut versuchen.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else if (interaction.isRepliable()) await interaction.reply(payload).catch(() => {});
  }
});

// Wie ADMIN_EMAILS in js/auth.js des Hauptrepos: feste Liste von Discord-
// Nutzer-IDs (nicht Benutzername - der kann sich aendern, die ID bleibt
// dauerhaft gleich), die rassen/kanal IMMER nutzen duerfen, unabhaengig
// von den eigenen Rollen/Berechtigungen auf dem jeweiligen Server.
const BOT_OWNER_IDS = ['298791223160864768']; // nawira

// "rassen"/"kanal" aendern serverweite bzw. kanalweite Bot-Konfiguration -
// Discord erlaubt Berechtigungs-Einschraenkungen nur je gesamtem Command,
// nicht je Unterbefehl (siehe deploy-commands.js), daher hier manuell
// geprueft - bewusst auf "Administrator" beschraenkt (nicht nur "Server
// verwalten"), da diese Befehle die Datenanzeige fuer alle auf dem Server
// veraendern. "pferd" bleibt bewusst fuer alle nutzbar.
async function requireAdmin(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Das funktioniert nur auf einem Server, nicht per Direktnachricht.', ephemeral: true });
    return false;
  }
  if (BOT_OWNER_IDS.includes(interaction.user.id)) return true;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Das dürfen nur Server-Administrator*innen ändern.', ephemeral: true });
    return false;
  }
  return true;
}

// Fuer /mdrdb-verkaufen und /mdrdb-besitzer: das Besitzer-Feld ist reiner
// Freitext (keine Verknuepfung zu Discord-Accounts), daher kein exakter
// Vergleich, sondern ein toleranter "kommt vor"-Abgleich in beide
// Richtungen (Gross-/Kleinschreibung egal) - deckt sowohl Spitznamen im
// Besitzer-Feld als auch abweichende Discord-Anzeigenamen ab. Bot-Owner
// duerfen wie bei rassen/kanal unabhaengig davon immer.
function ownerNameMatches(ownerField, candidateNames) {
  if (!ownerField) return false;
  const owner = ownerField.trim().toLowerCase();
  if (!owner) return false;
  return candidateNames.some((n) => {
    if (!n) return false;
    const name = n.trim().toLowerCase();
    if (!name) return false;
    return owner.includes(name) || name.includes(owner);
  });
}

async function requireHorseOwner(interaction, horse) {
  if (BOT_OWNER_IDS.includes(interaction.user.id)) return true;
  const candidateNames = [interaction.user.username, interaction.user.globalName, interaction.member?.nickname];
  if (ownerNameMatches(horse.owner, candidateNames)) return true;
  await interaction.reply({
    content: `Das darf nur die Person aendern, die laut Besitzer-Feld ("${horse.owner || '–'}") aktuell **${horse.name}** besitzt.`,
    ephemeral: true,
  });
  return false;
}

// /mdrdb-verkaufen und /mdrdb-besitzer schreiben in die Datenbank - dafuer
// braucht es den geheimen service_role Key (siehe supabaseServiceClient.js),
// der optional ist, damit der Bot auch ohne ihn startet. Ohne konfigurierten
// Key hier eine klare Fehlermeldung statt eines kryptischen Absturzes.
async function requireWriteAccess(interaction) {
  if (supabaseService) return true;
  await interaction.reply({
    content: 'Dieser Befehl ist noch nicht eingerichtet (SUPABASE_SERVICE_ROLE_KEY fehlt in der Bot-Konfiguration).',
    ephemeral: true,
  });
  return false;
}

async function handleMdrdbCommand(interaction) {
  const name = interaction.options.getString('name', true);
  const horse = await fetchHorseByName(name);

  if (!horse) {
    await interaction.reply({
      content: `Kein Pferd mit dem Namen "${name}" gefunden. Bitte einen Vorschlag aus der Liste auswählen.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.inGuild()) {
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelSettings = getChannelSettings(interaction.channelId);
    if (!horseMatchesFilters(horse, guildSettings, channelSettings)) {
      await interaction.reply({
        content: `„${horse.name}" ist in diesem Kanal aktuell nicht verfügbar (Rassen- oder Kanal-Filter, siehe \`/mdrdb-rassen\`/\`/mdrdb-kanal\`).`,
        ephemeral: true,
      });
      return;
    }
  }

  // Ab hier kommen zwei weitere Datenbankabfragen (Vater/Mutter) dazu -
  // Discord erlaubt nur 3 Sekunden bis zur ersten Antwort ("Unknown
  // interaction" / 10062 wenn ueberschritten). deferReply() bestaetigt die
  // Interaktion sofort (Bot zeigt "denkt nach..."), danach gilt ein viel
  // grosszuegigeres 15-Minuten-Fenster fuer editReply().
  await interaction.deferReply();

  const { father: fatherName, mother: motherName } = getParentNames(horse);
  const [father, mother] = await Promise.all([
    fatherName ? fetchHorseByName(fatherName) : null,
    motherName ? fetchHorseByName(motherName) : null,
  ]);

  await interaction.editReply({
    embeds: [buildHorseEmbed(horse, { father, fatherName, mother, motherName })],
    components: [buildDeleteRow(interaction.user.id)],
  });
  await interaction.followUp({
    content: `Weitere Informationen zu **${horse.name}**:`,
    components: [buildSubmenu(horse.id)],
    ephemeral: true,
  });
}

async function handleRassenCommand(interaction) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.reply({
    content: 'Welche Rassen sollen auf diesem Server durchsuchbar sein? (Mehrfachauswahl möglich, keine Auswahl = alle anzeigen)',
    components: [await buildBreedSelectRow(interaction.guildId)],
    ephemeral: true,
  });
}

async function handleKanalCommand(interaction) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.reply({
    content: `Welche Pferde sollen in <#${interaction.channelId}> angezeigt werden? (keine Auswahl = alle anzeigen)\n\n${describeChannelFilters(interaction.channelId)}`,
    components: buildChannelFilterRows(interaction.channelId),
    ephemeral: true,
  });
}

async function handleHilfeCommand(interaction) {
  await interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
}

async function handleSubmenu(interaction) {
  const horseId = interaction.customId.split(':')[1];
  const action = interaction.values[0];

  const horse = await fetchHorseById(horseId);
  if (!horse) {
    await interaction.update({ content: 'Dieses Pferd wurde nicht mehr in der Datenbank gefunden.', components: [] });
    return;
  }

  if (action === 'done') {
    await interaction.update({ content: `Fertig – Menü für **${horse.name}** geschlossen.`, components: [] });
    return;
  }

  // Menue bleibt offen, damit direkt die naechste Option gewaehlt werden
  // kann - die eigentlichen Daten kommen als oeffentliche Folgenachricht.
  await interaction.update({
    content: `Was möchtest du zu **${horse.name}** als Nächstes sehen?`,
    components: [buildSubmenu(horse.id)],
  });

  // "interaction.user.id" ist hier zuverlaessig dieselbe Person wie beim
  // urspruenglichen /mdrdb-Aufruf, da das Auswahlmenue selbst ephemer ist
  // und Discord Komponenten auf ephemeren Nachrichten ohnehin nur der
  // aufrufenden Person zum Klicken anzeigt.
  const deleteRow = [buildDeleteRow(interaction.user.id)];

  const allHorses = await fetchAllHorsesLight();

  if (action === 'siblings_father') {
    const siblings = findSiblingsByFather(horse, allHorses);
    await interaction.followUp({ embeds: [buildSiblingsEmbed(horse, 'Geschwister/Halbgeschwister (Vater)', siblings)], components: deleteRow });
  } else if (action === 'siblings_mother') {
    const siblings = findSiblingsByMother(horse, allHorses);
    await interaction.followUp({ embeds: [buildSiblingsEmbed(horse, 'Geschwister/Halbgeschwister (Mutter)', siblings)], components: deleteRow });
  } else if (action === 'offspring') {
    await interaction.followUp({ embeds: [buildOffspringEmbed(horse, findOffspring(horse, allHorses))], components: deleteRow });
  }
}

async function handleTagCommand(interaction) {
  const tagLabel = interaction.options.getString('tag', true);
  const pferdFilter = interaction.options.getString('pferd')?.trim().toLowerCase();

  const allHorses = await fetchAllHorsesLight();
  let matches = allHorses.filter((h) => (h.tags || []).some((t) => t.label === tagLabel));
  if (pferdFilter) matches = matches.filter((h) => (h.name || '').toLowerCase().includes(pferdFilter));

  if (interaction.inGuild()) {
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelSettings = getChannelSettings(interaction.channelId);
    matches = matches.filter((h) => horseMatchesFilters(h, guildSettings, channelSettings));
  }

  await interaction.reply({
    embeds: [buildTagSearchEmbed(tagLabel, sortByGender(matches))],
    components: [buildDeleteRow(interaction.user.id)],
  });
}

async function handleVerkaufenCommand(interaction) {
  if (!(await requireWriteAccess(interaction))) return;

  const name = interaction.options.getString('pferd', true);
  const kaeufer = interaction.options.getString('kaeufer', true);
  const horse = await fetchHorseByName(name);
  if (!horse) {
    await interaction.reply({ content: `Kein Pferd mit dem Namen "${name}" gefunden.`, ephemeral: true });
    return;
  }
  if (!(await requireHorseOwner(interaction, horse))) return;

  const newTags = setTag(horse.tags, 'Verkauf', `an ${kaeufer}`);
  const { error } = await supabaseService.from('horses').update({ tags: newTags }).eq('id', horse.id);
  if (error) {
    await interaction.reply({ content: `Fehler beim Speichern: ${error.message}`, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `„${horse.name}" wurde mit dem Schlagwort **Verkauf: an ${kaeufer}** markiert. Der Besitzer wechselt erst mit \`/mdrdb-besitzer\`, sobald der Verkauf abgeschlossen ist.`,
    ephemeral: true,
  });
}

async function handleBesitzerCommand(interaction) {
  if (!(await requireWriteAccess(interaction))) return;

  const name = interaction.options.getString('pferd', true);
  const neuerBesitzer = interaction.options.getString('neuer_besitzer', true);
  const horse = await fetchHorseByName(name);
  if (!horse) {
    await interaction.reply({ content: `Kein Pferd mit dem Namen "${name}" gefunden.`, ephemeral: true });
    return;
  }
  if (!(await requireHorseOwner(interaction, horse))) return;

  const hadVerkaufTag = (horse.tags || []).some((t) => t.label === 'Verkauf');
  const newTags = removeTag(horse.tags, 'Verkauf');
  const { error } = await supabaseService.from('horses').update({ owner: neuerBesitzer, tags: newTags }).eq('id', horse.id);
  if (error) {
    await interaction.reply({ content: `Fehler beim Speichern: ${error.message}`, ephemeral: true });
    return;
  }

  const tagHinweis = hadVerkaufTag ? ' (Schlagwort "Verkauf" wurde entfernt.)' : '';
  await interaction.reply({
    content: `Besitzer von „${horse.name}" wurde auf **${neuerBesitzer}** geändert.${tagHinweis}`,
    ephemeral: true,
  });
}

client.login(config.discordToken);
