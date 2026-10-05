const { EmbedBuilder } = require('discord.js');
const { computeDisplayFields, DASH } = require('./horseStats');

const COLOR = 0x8b5e3c;

// Feste Farbpalette, damit alle Nachrichten zu EINEM Pferd (Hauptkarte,
// Eltern, Geschwister, Nachkommen) dieselbe Farbe haben und optisch als
// zusammengehoerig erkennbar sind - die Farbe wird deterministisch aus der
// Pferde-ID abgeleitet (kein gemeinsamer Zustand zwischen den Interaktionen
// noetig), sodass das naechste nachgeschlagene Pferd ueblicherweise eine
// andere Farbe bekommt.
const HORSE_COLOR_PALETTE = [
  0x8b5e3c, 0x4c6ef5, 0x2f9e44, 0xe8590c, 0xae3ec9,
  0x1098ad, 0xf08c00, 0xe64980, 0x37b24d, 0x5c7cfa,
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function colorForHorse(horse) {
  const key = horse.id ?? horse.name ?? '';
  return HORSE_COLOR_PALETTE[hashString(String(key)) % HORSE_COLOR_PALETTE.length];
}

// Wie js/horseView.js (mdr-link-btn) - der Link zur Pferdeseite im Spiel
// selbst wird aus der frei gepflegten "external_id" gebaut (siehe
// supabase/migration_012_horses_external_id.sql), nicht aus der internen
// Supabase-UUID.
function mdrGameLink(externalId) {
  if (!externalId) return null;
  return `https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(externalId)}`;
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Rasse/Geschlecht/Farbe zusammen in einem Feld statt drei einzelnen
// Boxen - jede Zeile trotzdem einzeln beschriftet, damit trotz der
// kompakteren Darstellung klar bleibt, was was ist. Rasseanteile (falls
// vorhanden) als kursive Zusatzzeile direkt unter der Rasse.
function steckbriefValue(d) {
  const lines = [`Rasse: ${d.breed}`];
  if (d.breedComposition != null) lines.push(`*${d.breedComposition}*`);
  lines.push(`Geschlecht: ${d.gender}`);
  lines.push(`Alter: ${d.age}`);
  return lines.join('\n');
}

// Farbe steht bewusst direkt ueber dem Farbcode (statt im Steckbrief),
// damit beide zusammengehoerigen Werte im selben Feld stehen.
function farbgenetikValue(d) {
  return `Farbe: ${d.coatColor}\n\`${d.colorGenetics}\``;
}

// Zeigt die Eltern mit denselben Werten wie in der Geschwister-/
// Nachkommen-Ansicht (Farbe/ZZL/Besitzer, GP/Ext/Ext%/Int/HLP-SLP), wenn
// ein eigener Datensatz fuer sie existiert. Nicht jedes Elterntier ist
// selbst in der Datenbank erfasst (z.B. Tiere ausserhalb der eigenen
// Zucht) - in dem Fall bleibt es beim reinen Namen aus dem pedigree-Feld,
// statt komplett zu verschwinden.
function elternLine(label, record, fallbackName) {
  if (record) return formatRelativeLine(record, label);
  if (fallbackName) return `${label}: ${fallbackName}`;
  return `${label}: ${DASH}`;
}

function elternValue(father, fatherName, mother, motherName) {
  return `${elternLine('Vater', father, fatherName)}\n\n${elternLine('Mutter', mother, motherName)}`;
}

function buildHorseEmbed(horse, eltern = {}) {
  const { father, fatherName, mother, motherName } = eltern;
  // father/mother sind hier schon vollstaendig geladen (select('*'), siehe
  // index.js) - fuer eine praezisere Farbgenetik-Ableitung (siehe
  // horseStats.js computeDisplayFields) einfach mitgegeben, keine
  // zusaetzliche Datenbankabfrage noetig.
  const d = computeDisplayFields(horse, [father, mother].filter(Boolean));
  const link = mdrGameLink(horse.external_id);

  const embed = new EmbedBuilder()
    .setColor(colorForHorse(horse))
    .setTitle(d.name)
    .addFields(
      { name: 'Steckbrief', value: steckbriefValue(d) },
      { name: 'Eltern', value: elternValue(father, fatherName, mother, motherName) },
      { name: 'Farbgenetik', value: farbgenetikValue(d) },
      { name: 'Leistungswerte', value: `GP ${d.gp}\nExt ${d.ext} (${d.extPercent})\nInt ${d.int}\nZZL ${d.zzlIcon}\nHLP/SLP ${d.hlpSlp}\nEKH ${d.ekh}` },
      { name: 'Besitzer', value: d.owner },
    );

  // Der Link zur Pferdeseite im Spiel steckt schon im klickbaren Titel
  // (setURL) - kein zusaetzliches "Link"-Feld mehr, um die Karte nicht
  // unnoetig zu verlaengern.
  if (link) embed.setURL(link);
  if (isHttpUrl(horse.image_url)) embed.setImage(horse.image_url);

  return embed;
}

function genderIcon(gender) {
  if (gender === 'Stute' || gender === 'Stutfohlen') return '♀';
  if (gender === 'Hengst' || gender === 'Wallach' || gender === 'Hengstfohlen') return '♂';
  return '•';
}

function formatRelativeLine(horse, extraLabel) {
  const d = computeDisplayFields(horse);
  const suffix = extraLabel ? ` _(${extraLabel})_` : '';
  return (
    `${genderIcon(horse.gender)} **${d.name}**${suffix}\n` +
    `Farbe: ${d.coatColor} | ZZL: ${d.zzl} | Besitzer: ${d.owner}\n` +
    `GP: ${d.gp} | Ext: ${d.ext} | Ext%: ${d.extPercent} | Int: ${d.int} | HLP/SLP: ${d.hlpSlp} | EKH: ${d.ekh}`
  );
}

// Discord erlaubt max. 1024 Zeichen je Feld-Wert - statt ueberzaehlige
// Eintraege mit "... und X weitere" abzuschneiden, werden sie auf mehrere
// Felder verteilt, damit wirklich JEDER Treffer angezeigt wird. Das erste
// Feld traegt die Gesamtanzahl im Namen, weitere Felder (falls noetig)
// heissen "(Fortsetzung)".
function linesToFields(baseLabel, lines) {
  if (!lines.length) return [{ name: `${baseLabel} (0)`, value: 'Keine gefunden.' }];

  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n\n${line}` : line;
    if (next.length > 1024) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((value, i) => ({
    name: i === 0 ? `${baseLabel} (${lines.length})` : `${baseLabel} (Fortsetzung)`,
    value,
  }));
}

// "label" ist "Geschwister/Halbgeschwister (Vater)" bzw. "... (Mutter)" -
// beide Ansichten sind unabhaengige Menuepunkte (siehe submenu.js/index.js),
// ein Vollgeschwister (teilt beide Eltern) taucht daher in beiden Ansichten
// auf, wenn man sie nacheinander aufruft.
function buildSiblingsEmbed(horse, label, siblings) {
  const embed = new EmbedBuilder()
    .setColor(colorForHorse(horse))
    .setTitle(`Geschwister von ${horse.name} – ${label}`);

  embed.addFields(...linesToFields(label, siblings.map((h) => formatRelativeLine(h))));

  return embed;
}

function buildOffspringEmbed(horse, offspring) {
  const embed = new EmbedBuilder()
    .setColor(colorForHorse(horse))
    .setTitle(`Nachkommen von ${horse.name}`);

  embed.addFields(...linesToFields('Nachkommen', offspring.map((h) => formatRelativeLine(h))));

  return embed;
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('MDR Pferdedatenbank – Befehle')
    .addFields(
      {
        name: '/mdrdb pferd',
        value:
          'Zeigt Pferdedaten an: Rasse, Geschlecht, Alter, Eltern, Farbe/Farbgenetik, Leistungswerte ' +
          '(GP/Ext/Ext%/Int/ZZL/HLP-SLP), Besitzer. Durchsuchbar per Name und/oder Schlagwort ' +
          '(Verkauf/Reserviert/Bleibt/GBH/LastFoal/???/Exen/FT/Turnier/Beritt/Zucht) und/oder Besitzer - mindestens eines von ' +
          'dreien angeben. Ergibt das mehrere Treffer (bis 25), erscheint ein Auswahlmenue zum ' +
          'Ankreuzen mehrerer Pferde; bei mehr als 25 Treffern werden direkt alle gepostet. Zu ' +
          'jedem so geposteten Pferd oeffnet sich zusaetzlich ein privates Menue, um Geschwister/' +
          'Halbgeschwister oder Nachkommen oeffentlich zu posten. Beim Schlagwort "Bleibt" ohne ' +
          'Besitzer-Angabe werden automatisch nur die eigenen Pferde gezeigt (siehe ' +
          '/mdrdb-register), sonst immer alle Treffer.',
      },
      {
        name: '/mdrdb-rassen  _(nur "Server verwalten", für andere unsichtbar)_',
        value:
          'Legt fest, welche Rassen auf diesem Server ueberhaupt durchsuchbar sind ' +
          '(Mehrfachauswahl, keine Auswahl = alle Rassen).',
      },
      {
        name: '/mdrdb-kanal  _(nur "Server verwalten", für andere unsichtbar)_',
        value:
          'Legt fuer den aktuellen Kanal zwei unabhaengige Filter fest: Zuchtzulassung ' +
          '(alle / nur ohne / nur mit) und Geschlecht (Stute/Hengst/Wallach, ' +
          '"Stute"/"Hengst" schliessen die jeweiligen Fohlen mit ein; keine Auswahl = alle).',
      },
      {
        name: '/mdrdb-register',
        value:
          'Hinterlegt deinen Besitzernamen, damit dir in der Namenssuche aller Befehle ' +
          '(z.B. /mdrdb pferd) nur noch deine eigenen Pferde vorgeschlagen werden.',
      },
      // /mdrdb-verkaufen und /mdrdb-besitzer: deaktiviert (Nutzerwunsch
      // 2026-10-04, siehe deploy-commands.js/index.js) - hier bewusst
      // nicht mehr aufgefuehrt, damit die Hilfe nicht laengst
      // abgeschaltete Befehle bewirbt. Zum Reaktivieren hier einfach
      // wieder einfuegen.
      {
        name: '/mdrdb hilfe',
        value: 'Zeigt diese Uebersicht.',
      },
    );
}

module.exports = {
  buildHorseEmbed,
  buildSiblingsEmbed,
  buildOffspringEmbed,
  buildHelpEmbed,
};
