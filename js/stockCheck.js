// --- Bestandsabgleich: eigene Pferde im Spiel vs. Datenbank -------------
//
// Ohne Spiel-API laesst sich das nur ueber einen manuellen Text-Abgleich
// loesen (wie der normale Pferde-Import auch). Quelle ist NICHT die
// einzelne Pferdeseite (das ist horse.html/js/parser.js), sondern der
// eigene "Zucht"-Reiter im Nutzerprofil mit aufgeklapptem "Pferde
// anzeigen?" - dort steht je Pferd EIN Feld pro Zeile in fester
// Reihenfolge (Name, Rasse, Geschlecht, Alter, GP, Farbe), siehe
// parseOwnHorseListText. Fuer jedes Konto nutzbar (nicht nur Admin, daher
// hier statt in verwaltung.html/js) - der Besitzer wird dabei nicht mehr
// manuell ausgewaehlt, sondern automatisch aus dem eingeloggten
// Benutzernamen abgeleitet (wie formIdentity in horseForm.js).

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  const ownIdentity = session.user.email.split('@')[0];
  document.getElementById('stock-check-identity').textContent = ownIdentity;

  // Automatisches Rassen-Dropdown beim Einfuegen, wie #raw-text in
  // horse.html - setTimeout(0), weil der eingefuegte Text im "paste"-
  // Event selbst noch nicht im Feld steht.
  document.getElementById('stock-check-input').addEventListener('paste', () => {
    setTimeout(() => populateStockCheckBreeds(parseOwnHorseListText(document.getElementById('stock-check-input').value)), 0);
  });
  document.getElementById('stock-check-btn').addEventListener('click', () => runStockCheck(ownIdentity));
});

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

function populateStockCheckBreeds(entries) {
  const sel = document.getElementById('stock-check-breed');
  const current = sel.value;
  const breeds = [...new Set(entries.map((e) => e.breed).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  sel.innerHTML = '<option value="">Alle</option>' + breeds.map((b) => `<option value="${stockCheckEscapeHtml(b)}">${stockCheckEscapeHtml(b)}</option>`).join('');
  if (breeds.includes(current)) sel.value = current;
}

async function runStockCheck(ownIdentity) {
  const breed = document.getElementById('stock-check-breed').value;
  const resultEl = document.getElementById('stock-check-result');
  const rawText = document.getElementById('stock-check-input').value;
  const allEntries = parseOwnHorseListText(rawText);
  populateStockCheckBreeds(allEntries);

  if (!allEntries.length) {
    resultEl.innerHTML = '<p class="error">Keine Pferde erkannt - bitte prüfen, ob die komplette Profilseite mit aufgeklapptem "Pferde anzeigen?" eingefügt wurde.</p>';
    return;
  }
  const entries = breed ? allEntries.filter((e) => e.breed === breed) : allEntries;
  if (!entries.length) {
    resultEl.innerHTML = `<p class="error">Keines der ${allEntries.length} erkannten Pferde hat die Rasse „${stockCheckEscapeHtml(breed)}".</p>`;
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
  const ownHorses = allHorses.filter((h) => isOwn(h) && (!breed || h.breed === breed));

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
    <p class="small muted">${entries.length} von ${allEntries.length} erkannten Pferden berücksichtigt${breed ? ` (Rasse „${stockCheckEscapeHtml(breed)}")` : ''}, ${ownHorses.length} eigene Pferde${breed ? ` dieser Rasse` : ''} in der Datenbank (Besitzer „${stockCheckEscapeHtml(ownIdentity)}").</p>
    <p class="group-heading">🆕 Im Spiel vorhanden, aber (noch) nicht bei deinen Pferden in der Datenbank</p>
    ${list(missingInDbHtml, 'Keine – alles eingetragen.')}
    <p class="group-heading">❓ Bei dir in der Datenbank, aber nicht (mehr) in der eingefügten Liste</p>
    <p class="small muted">Möglicherweise verkauft/abgegeben, oder die Schreibweise weicht leicht ab (z.B. Groß-/Kleinschreibung, Sonderzeichen) – bitte vor dem Löschen/Ändern kurz prüfen.</p>
    ${list(missingInGameHtml, 'Keine – alle deine Datenbank-Einträge tauchen auch in der Liste auf.')}
  `;
}
