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
  wireStockCheckMissingActions();
  document.getElementById('stock-check-btn').addEventListener('click', () => runStockCheck(ownIdentity));
});

// Aktuell angezeigte "moeglicherweise verkauft"-Treffer (siehe
// missingInGame in runStockCheck) samt Mehrfachauswahl - als Modul-Status
// gehalten (nicht nur lokale Variablen in runStockCheck), damit Loeschen/
// Besitzerwechsel danach nur DIESEN Teilbereich neu rendern koennen, ohne
// den kompletten Abgleich (samt Datenbank-Abruf) erneut laufen zu lassen.
let currentMissingInGame = [];
const stockCheckMissingSelected = new Set();

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
// Alter GP Farbe", wird uebersprungen). Das Spiel liefert die eigentliche
// Tabelle je nach Gerät in zwei unterschiedlichen Formaten (Bugfix,
// Nutzerfeedback: am PC wurden bisher 6 Zeilen zu einem Pferd
// zusammengewuerfelt):
// - Handy: JEDES Feld in einer eigenen Zeile, sechs Zeilen pro Pferd
//   (Name, Rasse, Geschlecht, Alter, GP, Farbe).
// - PC: EINE Zeile pro Pferd, alle sechs Felder Tab-getrennt darin.
// Erkennung anhand der ersten Datenzeile nach dem Kopf: enthaelt sie ein
// Tab-Zeichen, ist es das PC-Format (ein reiner Pferdename/Farbwert
// enthaelt nie ein Tab) - sonst das Handy-Format.
function parseOwnHorseListText(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const startIdx = lines.indexOf('Pferde anzeigen?');
  if (startIdx === -1) return [];

  let i = startIdx + 1;
  while (i < lines.length && !lines[i]) i++;
  if (lines[i] && /^Pferd\b.*Rasse.*Geschlecht/.test(lines[i])) i++;

  const rawLines = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (STOCK_CHECK_STOP_HEADINGS.has(line)) break;
    rawLines.push(line);
  }

  const entries = [];
  if (rawLines.length && rawLines[0].includes('\t')) {
    for (const line of rawLines) {
      const parts = line.split('\t').map((p) => p.trim());
      if (parts.length < 6 || !parts[0]) continue;
      entries.push({ name: parts[0], breed: parts[1], gender: parts[2], age: parts[3], gp: parts[4], color: parts[5] });
    }
  } else {
    for (let j = 0; j + 6 <= rawLines.length; j += 6) {
      entries.push({
        name: rawLines[j],
        breed: rawLines[j + 1],
        gender: rawLines[j + 2],
        age: rawLines[j + 3],
        gp: rawLines[j + 4],
        color: rawLines[j + 5],
      });
    }
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

// Baut NUR den "moeglicherweise verkauft"-Abschnitt (Ueberschrift,
// Mehrfachauswahl-Aktionen, Liste) - eigene Funktion statt Teil des
// grossen Template-Strings in runStockCheck, da Loeschen/Besitzerwechsel
// danach nur diesen Teil per innerHTML ersetzen, um nicht jedes Mal einen
// kompletten neuen Abgleich (samt Datenbank-Abruf) anzustossen.
function missingInGameSectionHtml() {
  const rows = currentMissingInGame;
  const list = rows.length
    ? `<ul class="stock-check-missing-list">${rows.map((h) => `
        <li>
          <label style="display:flex; align-items:center; gap:0.4rem; font-weight:normal;">
            <input type="checkbox" data-stock-missing-select="${stockCheckEscapeHtml(h.id)}" style="width:auto;"${stockCheckMissingSelected.has(h.id) ? ' checked' : ''} />
            ${stockCheckEscapeHtml(h.name || '(ohne Name)')}${h.breed ? ` (${stockCheckEscapeHtml(h.breed)})` : ''}
          </label>
        </li>`).join('')}</ul>`
    : '<p class="small muted">Keine – alle deine Datenbank-Einträge tauchen auch in der Liste auf.</p>';

  const allChecked = rows.length > 0 && rows.every((h) => stockCheckMissingSelected.has(h.id));
  const actions = rows.length ? `
    <div class="form-actions" style="margin: 0.4rem 0;">
      <label style="display:flex; align-items:center; gap:0.4rem; font-weight:normal;">
        <input type="checkbox" id="stock-check-missing-select-all" style="width:auto;"${allChecked ? ' checked' : ''} /> Alle auswählen
      </label>
      <button type="button" id="stock-check-missing-owner-btn" class="secondary small">Besitzer wechseln</button>
      <button type="button" id="stock-check-missing-delete-btn" class="danger small">🗑️ Löschen</button>
      <span class="small muted">${stockCheckMissingSelected.size} ausgewählt</span>
    </div>` : '';

  return `
    <p class="group-heading">❓ Bei dir in der Datenbank, aber nicht (mehr) in der eingefügten Liste</p>
    <p class="small muted">Möglicherweise verkauft/abgegeben, oder die Schreibweise weicht leicht ab (z.B. Groß-/Kleinschreibung, Sonderzeichen) – bitte vor dem Löschen/Ändern kurz prüfen. Über die Kästchen mehrere auswählen und direkt löschen oder auf einen neuen Besitzer übertragen (z.B. bei einem Verkauf).</p>
    ${actions}
    ${list}
  `;
}

function renderMissingInGameSection() {
  document.getElementById('stock-check-missing-section').innerHTML = missingInGameSectionHtml();
}

// Delegiert auf "document" statt auf #stock-check-result, da runStockCheck
// dessen Inhalt bei jedem "Abgleichen"-Klick komplett per innerHTML neu
// aufbaut - ein Listener direkt darauf wuerde dabei jedes Mal verloren
// gehen (analog zu wireTagSuggestHandlers in js/tagSuggest.js).
function wireStockCheckMissingActions() {
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-stock-missing-select]')) {
      const id = e.target.dataset.stockMissingSelect;
      if (e.target.checked) stockCheckMissingSelected.add(id);
      else stockCheckMissingSelected.delete(id);
      renderMissingInGameSection();
    } else if (e.target.id === 'stock-check-missing-select-all') {
      currentMissingInGame.forEach((h) => {
        if (e.target.checked) stockCheckMissingSelected.add(h.id);
        else stockCheckMissingSelected.delete(h.id);
      });
      renderMissingInGameSection();
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.id === 'stock-check-missing-delete-btn') openStockCheckDeleteModal();
    else if (e.target.id === 'stock-check-missing-owner-btn') openStockCheckOwnerModal();
  });

  document.getElementById('delete-modal-cancel').addEventListener('click', () => {
    document.getElementById('delete-modal').hidden = true;
  });
  document.getElementById('delete-modal-confirm').addEventListener('click', confirmStockCheckDelete);
  document.getElementById('bulk-owner-cancel').addEventListener('click', () => {
    document.getElementById('bulk-owner-modal').hidden = true;
  });
  document.getElementById('bulk-owner-confirm').addEventListener('click', confirmStockCheckOwnerChange);
}

function selectedMissingRows() {
  return currentMissingInGame.filter((h) => stockCheckMissingSelected.has(h.id));
}

function openStockCheckDeleteModal() {
  const rows = selectedMissingRows();
  if (!rows.length) return;
  document.getElementById('delete-modal-list').innerHTML = rows.map((h) =>
    `<li>${stockCheckEscapeHtml(h.name || '(ohne Name)')}${h.breed ? ` — ${stockCheckEscapeHtml(h.breed)}` : ''}</li>`
  ).join('');
  document.getElementById('delete-modal-count').textContent =
    rows.length === 1 ? '1 Pferd wirklich unwiderruflich löschen?' : `${rows.length} Pferde wirklich unwiderruflich löschen?`;
  document.getElementById('delete-modal').hidden = false;
}

async function confirmStockCheckDelete() {
  const rows = selectedMissingRows();
  document.getElementById('delete-modal').hidden = true;
  if (!rows.length) return;
  const ids = rows.map((h) => h.id);
  const { error } = await supabaseClient.from('horses').delete().in('id', ids);
  if (error) {
    alert('Löschen fehlgeschlagen: ' + error.message);
    return;
  }
  currentMissingInGame = currentMissingInGame.filter((h) => !ids.includes(h.id));
  ids.forEach((id) => stockCheckMissingSelected.delete(id));
  renderMissingInGameSection();
}

async function openStockCheckOwnerModal() {
  const rows = selectedMissingRows();
  if (!rows.length) return;
  document.getElementById('bulk-owner-count').textContent = `${rows.length} Pferd${rows.length === 1 ? '' : 'e'} ausgewählt`;
  document.getElementById('bulk-owner-name').value = '';
  const { data } = await supabaseClient.from('horses').select('owner');
  const owners = [...new Set((data || []).map((h) => h.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  document.getElementById('known-owners').innerHTML = owners.map((o) => `<option value="${stockCheckEscapeHtml(o)}"></option>`).join('');
  document.getElementById('bulk-owner-modal').hidden = false;
}

async function confirmStockCheckOwnerChange() {
  const newOwner = document.getElementById('bulk-owner-name').value.trim();
  document.getElementById('bulk-owner-modal').hidden = true;
  if (!newOwner) return;
  const rows = selectedMissingRows();
  if (!rows.length) return;
  const ids = rows.map((h) => h.id);
  const { error } = await supabaseClient.from('horses').update({ owner: newOwner }).in('id', ids);
  if (error) {
    alert('Besitzerwechsel fehlgeschlagen: ' + error.message);
    return;
  }
  // Nach der Uebertragung gehoert das Pferd nicht mehr zum eigenen
  // Bestand - raus aus der Liste, statt weiterhin als "moeglicherweise
  // verkauft" unter dem alten Besitzer zu erscheinen.
  currentMissingInGame = currentMissingInGame.filter((h) => !ids.includes(h.id));
  ids.forEach((id) => stockCheckMissingSelected.delete(id));
  renderMissingInGameSection();
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
  currentMissingInGame = ownHorses
    .filter((h) => !gameSet.has((h.name || '').toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  stockCheckMissingSelected.clear();

  const list = (items, empty) => items.length ? `<ul>${items.join('')}</ul>` : `<p class="small muted">${empty}</p>`;

  const missingInDbHtml = missingInDb.map((e) => e.elsewhereOwner
    ? `<li>${stockCheckEscapeHtml(e.name)} (${stockCheckEscapeHtml(e.breed)}) – ⚠️ steht bereits unter Besitzer „${stockCheckEscapeHtml(e.elsewhereOwner)}" in der Datenbank</li>`
    : `<li>${stockCheckEscapeHtml(e.name)} (${stockCheckEscapeHtml(e.breed)})</li>`);

  resultEl.innerHTML = `
    ${duplicateWarningHtml}
    <p class="small muted">${entries.length} von ${allEntries.length} erkannten Pferden berücksichtigt (Rassen: ${[...selectedBreeds].map(stockCheckEscapeHtml).join(', ')}), ${ownHorses.length} eigene Pferde in der Datenbank (Besitzer „${stockCheckEscapeHtml(ownIdentity)}").</p>
    <p class="group-heading">🆕 Im Spiel vorhanden, aber (noch) nicht bei deinen Pferden in der Datenbank</p>
    ${list(missingInDbHtml, 'Keine – alles eingetragen.')}
    <div id="stock-check-missing-section">${missingInGameSectionHtml()}</div>
  `;
}
