// --- Bestandsabgleich: eigene Pferde im Spiel vs. Datenbank -------------
//
// Eigenstaendige Seite (bestandsabgleich.html) statt Teil der Einstellungen
// oder Verwaltung (Nutzerwunsch) - eigener Menuepunkt im Benutzernamen-
// Dropdown (siehe js/nav.js), fuer jedes Konto nutzbar (nicht nur Admin).
// Ohne Spiel-API laesst sich der Abgleich nur ueber einen manuellen Text-
// Abgleich loesen (wie der normale Pferde-Import auch). Quelle ist NICHT
// die einzelne Pferdeseite (das ist horse.html/js/parser.js), sondern der
// eigene "Zucht"-Reiter im Nutzerprofil mit aufgeklapptem "Pferde
// anzeigen?" - dort steht je Pferd EIN Feld pro Zeile in fester
// Reihenfolge (Name, Rasse, Geschlecht, Alter, GP, Farbe), siehe
// parseOwnHorseListText. Der Besitzer wird nicht manuell ausgewaehlt,
// sondern automatisch aus dem eingeloggten Benutzernamen abgeleitet (wie
// formIdentity in horseForm.js).

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  await renderSharedNav(session);
  const ownIdentity = session.user.email.split('@')[0];
  document.getElementById('stock-check-identity').textContent = ownIdentity;

  await loadStockCheckBreedCheckboxes(session.user.id);
  wireStockCheckBreedAllToggle();
  document.getElementById('stock-check-btn').addEventListener('click', () => runStockCheck(ownIdentity));
});

// Rassen-Auswahl richtet sich nach "Sichtbare Rassen in der Übersicht"
// oben auf derselben Seite (user_settings.preferred_breeds) statt jede
// Rasse aus der Datenbank anzubieten (Nutzerwunsch) - ist dort nichts
// ausgewählt (leer = "alle Rassen", gleiche Konvention wie beim
// Rasse-Filter der Übersicht selbst), stehen ersatzweise alle
// tatsächlich vorkommenden Rassen zur Auswahl (wie populateBreedCheckboxes
// oben auf dieser Seite).
async function loadStockCheckBreedCheckboxes(userId) {
  const container = document.getElementById('stock-check-breed-checkboxes');
  const { data: settingsData } = await supabaseClient
    .from('user_settings')
    .select('preferred_breeds')
    .eq('user_id', userId)
    .maybeSingle();

  let breeds = settingsData?.preferred_breeds?.length ? settingsData.preferred_breeds : null;
  if (!breeds) {
    const { data, error } = await fetchAllRows(supabaseClient.from('horses').select('breed'));
    if (error || !data) {
      container.innerHTML = '<p class="error">Rassen konnten nicht geladen werden.</p>';
      return;
    }
    const set = new Set(data.map((d) => normalizeBreed(d.breed)).filter(Boolean));
    set.add('Rasselos');
    breeds = [...set];
  }
  breeds = [...breeds].sort((a, b) => a.localeCompare(b, 'de'));
  container.innerHTML = breeds.map((b) =>
    `<label><input type="checkbox" data-stock-check-breed value="${stockCheckEscapeHtml(b)}" checked /> ${stockCheckEscapeHtml(b)}</label>`
  ).join('');
}

function wireStockCheckBreedAllToggle() {
  const allBox = document.getElementById('stock-check-breed-all');
  allBox.addEventListener('change', () => {
    document.querySelectorAll('#stock-check-breed-checkboxes [data-stock-check-breed]').forEach((cb) => {
      cb.checked = allBox.checked;
    });
  });
  // Wird eine einzelne Rasse abgewaehlt, soll "Alle" nicht mehr angehakt
  // bleiben - umgekehrt (alle einzeln wieder anhaken) springt "Alle"
  // automatisch wieder an, statt manuell mitgepflegt werden zu muessen.
  document.getElementById('stock-check-breed-checkboxes').addEventListener('change', (e) => {
    if (!e.target.matches('[data-stock-check-breed]')) return;
    const boxes = [...document.querySelectorAll('#stock-check-breed-checkboxes [data-stock-check-breed]')];
    allBox.checked = boxes.every((cb) => cb.checked);
  });
}

function selectedStockCheckBreeds() {
  return new Set(
    [...document.querySelectorAll('#stock-check-breed-checkboxes [data-stock-check-breed]:checked')].map((cb) => cb.value)
  );
}

function stockCheckEscapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Abschnitte, die im Nutzerprofil nach der Pferdeliste folgen - sobald
// eine dieser Zeilen auftaucht, ist die Liste zu Ende (verhindert, dass
// nachfolgende Reiter-Inhalte faelschlich als weitere Pferde-Felder
// mitgezaehlt werden).
const STOCK_CHECK_STOP_HEADINGS = new Set(['Reiterkönnen', 'Abzeichen', 'Ausbildungsstand', 'Turniere', 'Weiteres']);

// Erwartet die komplette, kopierte Profilseite mit aufgeklapptem "Pferde
// anzeigen?" (Reiter "Zucht") - Anker ist genau diese Zeile, danach folgt
// optional eine einzelne Tabellenkopf-Zeile ("Pferd Rasse Geschlecht
// Alter GP Farbe", wird uebersprungen) und anschliessend je Pferd GENAU
// sechs Zeilen (Name, Rasse, Geschlecht, Alter, GP, Farbe - je ein Feld
// pro Zeile, so wie es das Spiel beim Kopieren dieser Tabelle liefert).
// Eine unvollstaendige letzte Gruppe (z.B. falls das Ende nicht exakt
// getroffen wurde) wird verworfen statt als falsches Pferd interpretiert
// zu werden.
function parseOwnHorseListText(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const startIdx = lines.indexOf('Pferde anzeigen?');
  if (startIdx === -1) return [];

  let i = startIdx + 1;
  while (i < lines.length && !lines[i]) i++;
  if (lines[i] && /^Pferd\b.*Rasse.*Geschlecht/.test(lines[i])) i++;

  const fields = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (STOCK_CHECK_STOP_HEADINGS.has(line)) break;
    fields.push(line);
  }

  const entries = [];
  for (let j = 0; j + 6 <= fields.length; j += 6) {
    entries.push({
      name: fields[j],
      breed: fields[j + 1],
      gender: fields[j + 2],
      age: fields[j + 3],
      gp: fields[j + 4],
      color: fields[j + 5],
    });
  }
  return entries;
}

// Pferdenamen sind in der Datenbank eindeutig (horses_name_unique_idx)
// und auch im Spiel darf ein Konto keine zwei Pferde mit demselben Namen
// haben - tauchen beim Einlesen trotzdem doppelte Namen auf, ist das kein
// echter Bestandsfall, sondern ein Hinweis auf einen Parsing-Fehler (z.B.
// eine verschobene Zeile, wodurch sich Name/Rasse/... aller nachfolgenden
// Pferde verschieben) - wird deshalb prominent gewarnt statt die Werte
// stillschweigend zu verwenden.
function stockCheckDuplicateWarningHtml(entries) {
  const seen = new Map();
  for (const e of entries) {
    const key = e.name.toLowerCase();
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const duplicateNames = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  if (!duplicateNames.length) return '';
  const names = entries
    .filter((e) => duplicateNames.includes(e.name.toLowerCase()))
    .map((e) => e.name);
  return `<p class="error">⚠️ ${duplicateNames.length} Name${duplicateNames.length === 1 ? '' : 'n'} mehrfach im eingefügten Text erkannt (${[...new Set(names)].map(stockCheckEscapeHtml).join(', ')}) - das deutet auf einen Fehler beim Einlesen hin (z.B. eine verschobene Zeile), da Pferdenamen eigentlich eindeutig sein müssen. Bitte den eingefügten Text prüfen, bevor du dich auf das Ergebnis unten verlässt.</p>`;
}

async function runStockCheck(ownIdentity) {
  const selectedBreeds = selectedStockCheckBreeds();
  const resultEl = document.getElementById('stock-check-result');
  const rawText = document.getElementById('stock-check-input').value;
  const allEntries = parseOwnHorseListText(rawText);
  const duplicateWarningHtml = stockCheckDuplicateWarningHtml(allEntries);

  if (!allEntries.length) {
    resultEl.innerHTML = '<p class="error">Keine Pferde erkannt - bitte prüfen, ob die komplette Profilseite mit aufgeklapptem "Pferde anzeigen?" eingefügt wurde.</p>';
    return;
  }
  if (!selectedBreeds.size) {
    resultEl.innerHTML = '<p class="error">Bitte mindestens eine Rasse auswählen.</p>';
    return;
  }
  const entries = allEntries.filter((e) => selectedBreeds.has(e.breed));
  if (!entries.length) {
    resultEl.innerHTML = `<p class="error">Keines der ${allEntries.length} erkannten Pferde hat eine der ausgewählten Rassen.</p>`;
    return;
  }

  resultEl.innerHTML = '<p class="muted small">Lädt…</p>';
  // Kompletter Bestand statt nur der eigenen Pferde: fuer die
  // Fremdbesitzer-Pruefung unten (Nutzerwunsch) wird ohnehin jeder Name
  // im gesamten Bestand gebraucht, ein zweiter, auf den eigenen Besitzer
  // eingeschraenkter Abruf waere nur redundant.
  const { data, error } = await fetchAllRows(supabaseClient.from('horses').select('id, name, owner, breed'));
  if (error) {
    resultEl.innerHTML = `<p class="error">Abgleich fehlgeschlagen: ${stockCheckEscapeHtml(error.message)}</p>`;
    return;
  }

  const allHorses = data || [];
  const isOwn = (h) => (h.owner || '').toLowerCase() === ownIdentity.toLowerCase();
  const ownHorses = allHorses.filter((h) => isOwn(h) && selectedBreeds.has(h.breed));

  const byNameLower = new Map();
  for (const h of allHorses) {
    const key = (h.name || '').toLowerCase();
    if (!byNameLower.has(key)) byNameLower.set(key, []);
    byNameLower.get(key).push(h);
  }

  const gameSet = new Set(entries.map((e) => e.name.toLowerCase()));
  const ownSet = new Set(ownHorses.map((h) => (h.name || '').toLowerCase()));

  // Fehlt ein Pferd bei den eigenen Datenbank-Eintraegen, zusaetzlich
  // pruefen, ob es (unter einem ANDEREN Besitzernamen) ueberhaupt schon
  // irgendwo im Bestand steht - Nutzerwunsch, z.B. um eine abweichende
  // Besitzer-Schreibweise oder ein Pferd beim Vorbesitzer zu erkennen,
  // statt es faelschlich als komplette Neuanlage zu behandeln.
  const missingInDb = entries
    .filter((e) => !ownSet.has(e.name.toLowerCase()))
    .map((e) => {
      const elsewhere = (byNameLower.get(e.name.toLowerCase()) || []).find((h) => !isOwn(h));
      return { ...e, elsewhereOwner: elsewhere ? elsewhere.owner : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  // "Moeglicherweise verkauft" laeuft bewusst NUR gegen die eigenen
  // Pferde (Nutzerwunsch) - ein fremdes Pferd, das gerade nicht in der
  // eigenen Spiel-Liste steht, ist schlicht nicht relevant.
  const missingInGame = ownHorses
    .filter((h) => !gameSet.has((h.name || '').toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));

  const list = (items, empty) => items.length ? `<ul>${items.join('')}</ul>` : `<p class="small muted">${empty}</p>`;

  const missingInDbHtml = missingInDb.map((e) => e.elsewhereOwner
    ? `<li>${stockCheckEscapeHtml(e.name)} (${stockCheckEscapeHtml(e.breed)}) – ⚠️ steht bereits unter Besitzer „${stockCheckEscapeHtml(e.elsewhereOwner)}" in der Datenbank</li>`
    : `<li>${stockCheckEscapeHtml(e.name)} (${stockCheckEscapeHtml(e.breed)})</li>`);
  const missingInGameHtml = missingInGame.map((h) => `<li>${stockCheckEscapeHtml(h.name || '(ohne Name)')}${h.breed ? ` (${stockCheckEscapeHtml(h.breed)})` : ''}</li>`);

  resultEl.innerHTML = `
    ${duplicateWarningHtml}
    <p class="small muted">${entries.length} von ${allEntries.length} erkannten Pferden berücksichtigt (Rassen: ${[...selectedBreeds].map(stockCheckEscapeHtml).join(', ')}), ${ownHorses.length} eigene Pferde in der Datenbank (Besitzer „${stockCheckEscapeHtml(ownIdentity)}").</p>
    <p class="group-heading">🆕 Im Spiel vorhanden, aber (noch) nicht bei deinen Pferden in der Datenbank</p>
    ${list(missingInDbHtml, 'Keine – alles eingetragen.')}
    <p class="group-heading">❓ Bei dir in der Datenbank, aber nicht (mehr) in der eingefügten Liste</p>
    <p class="small muted">Möglicherweise verkauft/abgegeben, oder die Schreibweise weicht leicht ab (z.B. Groß-/Kleinschreibung, Sonderzeichen) – bitte vor dem Löschen/Ändern kurz prüfen.</p>
    ${list(missingInGameHtml, 'Keine – alle deine Datenbank-Einträge tauchen auch in der Liste auf.')}
  `;
}
