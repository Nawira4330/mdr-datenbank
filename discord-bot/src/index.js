const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const { fetchHorseByName, fetchHorseById, searchHorsesByName } = require('./horses');
const {
  getParentNames,
  fetchAllHorsesLight,
  invalidateHorsesCache,
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
  buildHelpEmbed,
} = require('./embeds');
const { setTag, removeTag, hasTag } = require('./tags');
const { getRegisteredOwner, setRegisteredOwner } = require('./registrations');
const { ownerNameMatches, isOwnHorse } = require('./ownership');
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
const { CUSTOM_ID_PREFIX: PICK_CUSTOM_ID_PREFIX, buildHorseSelectMenu } = require('./interactions/horseSelect');
const { createPendingAction, takePendingAction } = require('./interactions/pendingActions');

// Discord erlaubt maximal 25 Optionen je Auswahlmenue.
const MAX_SELECT_OPTIONS = 25;

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
    // Die "pferd"-Unterkommando von /mdrdb braucht dagegen die
    // tag-bewusste Variante, da dort zusaetzlich ein "tag" gewaehlt sein
    // kann, auf das die Namensvorschlaege eingegrenzt werden sollen
    // (siehe handleTagPferdAutocomplete - faellt automatisch auf die
    // normale Namenssuche zurueck, wenn kein Tag gewaehlt ist).
    if (interaction.isAutocomplete() && interaction.commandName === 'mdrdb') {
      await handleTagPferdAutocomplete(interaction);
      return;
    }
    if (
      interaction.isAutocomplete() &&
      ['mdrdb-verkaufen', 'mdrdb-besitzer'].includes(interaction.commandName)
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
    // "rassen"/"kanal"/"verkaufen"/"besitzer" sind eigene Top-Level-
    // Commands (siehe deploy-commands.js) statt Unterbefehle von /mdrdb,
    // damit Discord "rassen"/"kanal" normalen Nutzer*innen in der
    // Befehlsliste komplett ausblenden kann (setDefaultMemberPermissions
    // wirkt nur auf ganze Commands). "verkaufen"/"besitzer" bleiben aus
    // demselben technischen Grund ebenfalls eigene Top-Level-Commands,
    // sind aber bewusst fuer alle sichtbar.
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-rassen') {
      await handleRassenCommand(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-kanal') {
      await handleKanalCommand(interaction);
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
    if (interaction.isChatInputCommand() && interaction.commandName === 'mdrdb-register') {
      await handleRegisterCommand(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('mdrdb_menu:')) {
      await handleSubmenu(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(PICK_CUSTOM_ID_PREFIX)) {
      await handleHorsePickSubmenu(interaction);
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
// geprueft - "Server verwalten" statt des strengeren "Administrator"
// (urspruenglich so gewaehlt, aber auf Wunsch gelockert: eine Moderator-
// Rolle mit vielen Einzelrechten hat oft "Server verwalten", aber nicht
// zwingend das volle Administrator-Flag - ohne echten Administrator auf
// dem Server liesse sich der Zugriff sonst gar nicht mehr manuell ueber
// die Discord-Integrationen-Einstellungen nachtraeglich freigeben, da
// genau dafuer wiederum Administrator noetig waere). "pferd" bleibt
// bewusst fuer alle nutzbar.
async function requireAdmin(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Das funktioniert nur auf einem Server, nicht per Direktnachricht.', ephemeral: true });
    return false;
  }
  if (BOT_OWNER_IDS.includes(interaction.user.id)) return true;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'Das dürfen nur Personen mit der Berechtigung "Server verwalten" ändern.', ephemeral: true });
    return false;
  }
  return true;
}

// Namensabgleich fuer /mdrdb-verkaufen/-besitzer (und die Bleibt-
// Sonderregel bei /mdrdb pferd) steckt gemeinsam in ownership.js -
// beruecksichtigt seit /mdrdb-register auch den dort hinterlegten Namen,
// nicht nur Discord-Anzeigename/Nutzername/Spitzname. Bot-Owner duerfen
// wie bei rassen/kanal unabhaengig davon immer.
// Seiteneffektfreie Variante fuer die Mehrfachauswahl (handleHorsePickSubmenu)
// - dort wird pro ausgewaehltem Pferd geprueft, aber nicht einzeln per
// interaction.reply() geantwortet (das ginge nach dem ersten Aufruf ohnehin
// nicht mehr), sondern das Ergebnis in eine gemeinsame Zusammenfassung
// gesammelt.
function canActOnHorse(interaction, horse) {
  return BOT_OWNER_IDS.includes(interaction.user.id) || isOwnHorse(interaction, horse);
}

async function requireHorseOwner(interaction, horse) {
  if (canActOnHorse(interaction, horse)) return true;
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

// Laedt die vollen Eltern-Datensaetze (falls als eigene Pferde in der
// Datenbank erfasst) fuer die Kartenanzeige - gemeinsam genutzt von
// postSingleHorseWithSubmenu und buildFullHorseEmbed, damit Einzeltreffer,
// Massenaktionen und die Mehrfachauswahl bei /mdrdb pferd ueberall
// dieselbe vollstaendige Eltern-Ansicht (Farbe, Werte, Besitzer, ...)
// zeigen, nicht nur den Namen.
async function fetchEltern(horse) {
  const { father: fatherName, mother: motherName } = getParentNames(horse);
  const [father, mother] = await Promise.all([
    fatherName ? fetchHorseByName(fatherName) : null,
    motherName ? fetchHorseByName(motherName) : null,
  ]);
  return { father, fatherName, mother, motherName };
}

// Karte inkl. voller Eltern-Datensaetze fuer Massenaktionen
// (Mehrfachauswahl-Ergebnis, >25-Treffer-Liste) - kostet
// zwei zusaetzliche Datenbankabfragen JE Pferd, das ist bei den hier
// vorkommenden Mengen (max. 25 bzw. durch Eigentuemer-Filter begrenzt)
// akzeptabel und explizit gewuenscht, damit die Eltern ueberall mit
// Farbe/Werten statt nur dem Namen erscheinen.
async function buildFullHorseEmbed(horse) {
  return buildHorseEmbed(horse, await fetchEltern(horse));
}

// Postet Karte + privates Geschwister/Nachkommen-Menue als eigene
// Folgenachrichten fuer EIN Pferd - genutzt bei Massenaktionen (>25-
// Treffer-Liste, Mehrfachauswahl-Ergebnis), damit jedes so geposteten
// Pferd dieselbe interaktive Erfahrung bekommt wie der Einzeltreffer-Fall.
// Laedt den vollen Datensatz bewusst per Name neu (statt die schlanken
// Suchtreffer-Objekte zu verwenden), da diese je nach Suchpfad nicht alle
// fuer die Karte noetigen Spalten (Farbe, Werte, EKH, ...) enthalten.
async function postHorseFollowUp(interaction, name) {
  const horse = await fetchHorseByName(name);
  if (!horse) return;

  await interaction.followUp({
    embeds: [await buildFullHorseEmbed(horse)],
    components: [buildDeleteRow(interaction.user.id)],
  });
  await interaction.followUp({
    content: `Weitere Informationen zu **${horse.name}**:`,
    components: [buildSubmenu(horse.id)],
    ephemeral: true,
  });
}

// Voller Kartenaufbau (inkl. interaktivem Menue fuer Geschwister/
// Nachkommen) fuer GENAU ein Pferd - Alleinstellungsmerkmal des
// Einzeltreffer-Falls bei /mdrdb pferd. Setzt voraus, dass der Aufrufer
// bereits deferReply() aufgerufen hat (handleMdrdbCommand tut das immer,
// bevor die Trefferzahl bekannt ist).
async function postSingleHorseWithSubmenu(interaction, name) {
  const horse = await fetchHorseByName(name);
  if (!horse) {
    await interaction.editReply({ content: `Pferd "${name}" wurde nicht mehr gefunden.` });
    return;
  }

  await interaction.editReply({
    embeds: [buildHorseEmbed(horse, await fetchEltern(horse))],
    components: [buildDeleteRow(interaction.user.id)],
  });
  await interaction.followUp({
    content: `Weitere Informationen zu **${horse.name}**:`,
    components: [buildSubmenu(horse.id)],
    ephemeral: true,
  });
}

// "Bleibt" hat mit Abstand die meisten Treffer (typischerweise deutlich
// ueber 100) - je Pferd eine eigene Nachricht (siehe unten) waere dort
// eine Nachrichtenflut. Bei diesem einen Schlagwort wird deshalb auf die
// eigenen Pferde eingegrenzt (per /mdrdb-register oder ersatzweise
// Discord-Anzeigename/Nutzername/Spitzname, siehe ownership.js), bei
// allen anderen Schlagwoertern bleibt es bei allen Treffern.
const TAG_OWN_HORSES_ONLY_LABEL = 'Bleibt';

// Namenssuche und/oder Schlagwort-/Besitzer-Suche in einem: /mdrdb pferd
// deckt beides ab. Ohne "tag"/"besitzer" wird die schlanke, schnellere
// searchHorsesByName()-Abfrage genutzt (reine Namenssuche); sobald "tag"
// oder "besitzer" gesetzt ist, braucht es die tags-Spalte, die dort nicht
// mitgeladen wird - dann stattdessen ueber fetchAllHorsesLight() (mehr
// Spalten) im Speicher filtern.
async function handleMdrdbCommand(interaction) {
  const nameQuery = interaction.options.getString('name')?.trim();
  const tagLabel = interaction.options.getString('tag');
  const besitzerFilter = interaction.options.getString('besitzer')?.trim();

  if (!nameQuery && !tagLabel && !besitzerFilter) {
    await interaction.reply({
      content: 'Bitte mindestens Name, Tag oder Besitzer angeben - sonst waeren das alle Pferde der Datenbank auf einmal.',
      ephemeral: true,
    });
    return;
  }

  // Kann je nach Kombination laenger dauern (Tag-/Besitzer-Suche laedt
  // alle Pferde, ein Einzeltreffer laedt zusaetzlich die Eltern) - Discord
  // erlaubt nur 3 Sekunden bis zur ersten Antwort ("Unknown interaction" /
  // 10062 wenn ueberschritten). deferReply() bestaetigt die Interaktion
  // sofort, danach gilt ein grosszuegiges 15-Minuten-Fenster.
  await interaction.deferReply();

  let matches;
  if (tagLabel || besitzerFilter) {
    matches = await fetchAllHorsesLight();
    if (tagLabel) matches = matches.filter((h) => (h.tags || []).some((t) => t.label === tagLabel));
    if (besitzerFilter) {
      const q = besitzerFilter.toLowerCase();
      matches = matches.filter((h) => (h.owner || '').toLowerCase().includes(q));
    }
    if (nameQuery) {
      const q = nameQuery.toLowerCase();
      matches = matches.filter((h) => (h.name || '').toLowerCase().includes(q));
    }
  } else {
    matches = await searchHorsesByName(nameQuery, 50);
  }

  if (interaction.inGuild()) {
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelSettings = getChannelSettings(interaction.channelId);
    matches = matches.filter((h) => horseMatchesFilters(h, guildSettings, channelSettings));
  }
  const registeredOwner = getRegisteredOwner(interaction.user.id);
  if (registeredOwner) matches = matches.filter((h) => ownerNameMatches(h.owner, [registeredOwner]));

  // Ist "besitzer" bereits explizit gesetzt, ist die Ergebnismenge schon
  // bewusst eingegrenzt - die automatische "nur eigene Pferde"-Regel fuer
  // "Bleibt" greift dann nicht zusaetzlich (man soll ja gezielt auch
  // fremde Bleibt-Pferde nachschlagen koennen).
  if (tagLabel === TAG_OWN_HORSES_ONLY_LABEL && !besitzerFilter) {
    matches = matches.filter((h) => isOwnHorse(interaction, h));
  }

  matches = sortByGender(matches);

  const beschreibung = [
    nameQuery ? `Name „${nameQuery}"` : null,
    tagLabel ? `Schlagwort „${tagLabel}"` : null,
    besitzerFilter ? `Besitzer „${besitzerFilter}"` : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (!matches.length) {
    const hinweis =
      tagLabel === TAG_OWN_HORSES_ONLY_LABEL && !besitzerFilter
        ? ` Bei "${TAG_OWN_HORSES_ONLY_LABEL}" werden nur eigene Pferde gezeigt (siehe \`/mdrdb-register\`).`
        : '';
    await interaction.editReply({ content: `Keine Pferde gefunden (${beschreibung}).${hinweis}` });
    return;
  }

  if (matches.length === 1) {
    await postSingleHorseWithSubmenu(interaction, matches[0].name);
    return;
  }

  // Bei mehr als MAX_SELECT_OPTIONS Treffern liesse sich ohnehin nicht
  // gezielt auswaehlen (Discord-Limit je Menue) - dann direkt alle als
  // eigene Nachricht posten (jede einzeln loeschbar/beantwortbar). Bei 2
  // bis MAX_SELECT_OPTIONS Treffern stattdessen ein Auswahlmenue zum
  // gezielten Aussuchen.
  if (matches.length > MAX_SELECT_OPTIONS) {
    await interaction.editReply({ content: `**Pferde – ${beschreibung}** (${matches.length})` });
    for (const horse of matches) {
      await postHorseFollowUp(interaction, horse.name);
    }
    return;
  }

  const actionId = createPendingAction({ kind: 'pferd', userId: interaction.user.id });
  await interaction.editReply({
    content: `${matches.length} Treffer (${beschreibung}) - welche(s) Pferd(e) anzeigen?`,
    components: [buildHorseSelectMenu(actionId, matches)],
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

async function applyVerkaufen(interaction, name, kaeufer) {
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
  // Sorgt dafür, dass der nächste Autocomplete-/Geschwister-/Tag-Abruf
  // dieses Pferd sofort mit dem neuen Schlagwort sieht, statt bis zum
  // Ablauf der Egress-Cache-TTL zu warten (siehe invalidateHorsesCache in
  // pedigree.js).
  invalidateHorsesCache();

  await interaction.reply({
    content: `„${horse.name}" wurde mit dem Schlagwort **Verkauf: an ${kaeufer}** markiert. Der Besitzer wechselt erst mit \`/mdrdb-besitzer\`, sobald der Verkauf abgeschlossen ist.`,
    ephemeral: true,
  });
}

async function handleVerkaufenCommand(interaction) {
  // Deaktiviert (Nutzerwunsch 2026-10-04) - siehe deploy-commands.js
  // (dort aus der Discord-Registrierung genommen). Diese Sperre hier
  // greift zusaetzlich, falls Discord die alte Registrierung noch
  // zwischenspeichert, bis der naechste Deploy durchgelaufen ist.
  await interaction.reply({ content: 'Dieser Befehl ist momentan deaktiviert.', ephemeral: true });
  return;

  if (!(await requireWriteAccess(interaction))) return;

  const query = interaction.options.getString('pferd', true);
  const kaeufer = interaction.options.getString('kaeufer', true);

  // Nur eigene Pferde zur Auswahl (Bot-Owner sieht alle) - Aendern duerfen
  // sie ohnehin nur, spart aber unnoetige Klicks auf Pferde, die dann nur
  // mit einer Fehlermeldung enden wuerden.
  let matches = await searchHorsesByName(query, 50);
  if (!BOT_OWNER_IDS.includes(interaction.user.id)) {
    matches = matches.filter((h) => isOwnHorse(interaction, h));
  }

  if (!matches.length) {
    await interaction.reply({
      content: `Kein eigenes Pferd gefunden fuer "${query}" (nur Pferde, die laut Besitzer-Feld dir gehoeren, koennen hier ausgewaehlt werden).`,
      ephemeral: true,
    });
    return;
  }

  if (matches.length === 1) {
    await applyVerkaufen(interaction, matches[0].name, kaeufer);
    return;
  }

  if (matches.length > MAX_SELECT_OPTIONS) {
    await interaction.reply({
      content: `${matches.length} Treffer - bitte den Namen genauer eingeben (max. ${MAX_SELECT_OPTIONS} gleichzeitig moeglich).`,
      ephemeral: true,
    });
    return;
  }

  const actionId = createPendingAction({ kind: 'verkaufen', userId: interaction.user.id, kaeufer });
  await interaction.reply({
    content: `${matches.length} eigene Pferde gefunden fuer "${query}" - welche als verkauft (an ${kaeufer}) markieren?`,
    components: [buildHorseSelectMenu(actionId, matches)],
    ephemeral: true,
  });
}

async function applyBesitzerWechsel(interaction, name, neuerBesitzer) {
  const horse = await fetchHorseByName(name);
  if (!horse) {
    await interaction.reply({ content: `Kein Pferd mit dem Namen "${name}" gefunden.`, ephemeral: true });
    return;
  }
  if (!(await requireHorseOwner(interaction, horse))) return;

  const hadVerkaufTag = hasTag(horse.tags, 'Verkauf');
  const newTags = removeTag(horse.tags, 'Verkauf');
  const { error } = await supabaseService.from('horses').update({ owner: neuerBesitzer, tags: newTags }).eq('id', horse.id);
  if (error) {
    await interaction.reply({ content: `Fehler beim Speichern: ${error.message}`, ephemeral: true });
    return;
  }
  invalidateHorsesCache();

  const tagHinweis = hadVerkaufTag ? ' (Schlagwort "Verkauf" wurde entfernt.)' : '';
  await interaction.reply({
    content: `Besitzer von „${horse.name}" wurde auf **${neuerBesitzer}** geändert.${tagHinweis}`,
    ephemeral: true,
  });
}

async function handleBesitzerCommand(interaction) {
  // Deaktiviert (Nutzerwunsch 2026-10-04) - siehe deploy-commands.js
  // (dort aus der Discord-Registrierung genommen). Diese Sperre hier
  // greift zusaetzlich, falls Discord die alte Registrierung noch
  // zwischenspeichert, bis der naechste Deploy durchgelaufen ist.
  await interaction.reply({ content: 'Dieser Befehl ist momentan deaktiviert.', ephemeral: true });
  return;

  if (!(await requireWriteAccess(interaction))) return;

  const query = interaction.options.getString('pferd', true);
  const neuerBesitzer = interaction.options.getString('neuer_besitzer', true);

  let matches = await searchHorsesByName(query, 50);
  if (!BOT_OWNER_IDS.includes(interaction.user.id)) {
    matches = matches.filter((h) => isOwnHorse(interaction, h));
  }

  if (!matches.length) {
    await interaction.reply({
      content: `Kein eigenes Pferd gefunden fuer "${query}" (nur Pferde, die laut Besitzer-Feld dir gehoeren, koennen hier ausgewaehlt werden).`,
      ephemeral: true,
    });
    return;
  }

  if (matches.length === 1) {
    await applyBesitzerWechsel(interaction, matches[0].name, neuerBesitzer);
    return;
  }

  if (matches.length > MAX_SELECT_OPTIONS) {
    await interaction.reply({
      content: `${matches.length} Treffer - bitte den Namen genauer eingeben (max. ${MAX_SELECT_OPTIONS} gleichzeitig moeglich).`,
      ephemeral: true,
    });
    return;
  }

  const actionId = createPendingAction({ kind: 'besitzer', userId: interaction.user.id, neuerBesitzer });
  await interaction.reply({
    content: `${matches.length} eigene Pferde gefunden fuer "${query}" - bei welchen den Besitzer auf **${neuerBesitzer}** aendern?`,
    components: [buildHorseSelectMenu(actionId, matches)],
    ephemeral: true,
  });
}

async function handleRegisterCommand(interaction) {
  const besitzername = interaction.options.getString('besitzername', true);
  setRegisteredOwner(interaction.user.id, besitzername);
  await interaction.reply({
    content:
      `Registriert als **${besitzername}**. In der Namenssuche (z.B. \`/mdrdb pferd\`) werden dir ab jetzt ` +
      `nur noch Pferde vorgeschlagen, deren Besitzer-Feld zu diesem Namen passt. Einfach \`/mdrdb-register\` ` +
      `erneut ausfuehren, um den Namen zu aendern.`,
    ephemeral: true,
  });
}

// Verarbeitet die Bestaetigung eines Mehrfachauswahl-Menues (siehe
// horseSelect.js) - "kind" (in pendingActions.js hinterlegt beim Erstellen
// des Menues) legt fest, was mit den ausgewaehlten Pferden passiert:
// "pferd"/"tag" posten je Pferd eine eigene Karte (einzeln loeschbar/
// beantwortbar), "verkaufen"/"besitzer" wenden dieselbe Aenderung auf alle
// ausgewaehlten (eigenen) Pferde an und fassen das Ergebnis in einer
// Zusammenfassung zusammen.
async function handleHorsePickSubmenu(interaction) {
  const actionId = interaction.customId.slice(PICK_CUSTOM_ID_PREFIX.length);
  const pending = takePendingAction(actionId);
  if (!pending) {
    await interaction.update({ content: 'Diese Auswahl ist abgelaufen. Bitte den Befehl erneut ausfuehren.', components: [] });
    return;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({ content: 'Nur die Person, die diese Auswahl geoeffnet hat, kann sie nutzen.', ephemeral: true });
    return;
  }

  const selectedNames = interaction.values;
  await interaction.update({
    content: `${selectedNames.length} Pferd(e) ausgewaehlt – wird bearbeitet …`,
    components: [],
  });

  if (pending.kind === 'pferd') {
    for (const name of selectedNames) {
      await postHorseFollowUp(interaction, name);
    }
    return;
  }

  if (!supabaseService) {
    await interaction.followUp({
      content: 'Dieser Befehl ist noch nicht eingerichtet (SUPABASE_SERVICE_ROLE_KEY fehlt in der Bot-Konfiguration).',
      ephemeral: true,
    });
    return;
  }

  const results = [];
  for (const name of selectedNames) {
    const horse = await fetchHorseByName(name);
    if (!horse) {
      results.push(`„${name}": nicht mehr gefunden`);
      continue;
    }
    if (!canActOnHorse(interaction, horse)) {
      results.push(`„${horse.name}": keine Berechtigung (Besitzer-Feld: "${horse.owner || '–'}")`);
      continue;
    }

    if (pending.kind === 'verkaufen') {
      const newTags = setTag(horse.tags, 'Verkauf', `an ${pending.kaeufer}`);
      const { error } = await supabaseService.from('horses').update({ tags: newTags }).eq('id', horse.id);
      results.push(error ? `„${horse.name}": Fehler beim Speichern` : `„${horse.name}": als verkauft (an ${pending.kaeufer}) markiert`);
    } else if (pending.kind === 'besitzer') {
      const hadVerkaufTag = hasTag(horse.tags, 'Verkauf');
      const newTags = removeTag(horse.tags, 'Verkauf');
      const { error } = await supabaseService.from('horses').update({ owner: pending.neuerBesitzer, tags: newTags }).eq('id', horse.id);
      results.push(
        error
          ? `„${horse.name}": Fehler beim Speichern`
          : `„${horse.name}": Besitzer → ${pending.neuerBesitzer}${hadVerkaufTag ? ' (Verkauf-Tag entfernt)' : ''}`,
      );
    }
  }

  await interaction.followUp({ content: results.join('\n'), ephemeral: true });
}

client.login(config.discordToken);
