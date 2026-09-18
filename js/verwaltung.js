document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  if (!isAdminSession(session)) {
    window.location.href = 'index.html';
    return;
  }
  await renderSharedNav(session);
  await loadStockCheckOwners();
  document.getElementById('stock-check-btn').addEventListener('click', runStockCheck);
  // Automatisch Rassen-Dropdown befuellen, sobald Text eingefuegt wird -
  // muss nicht auf den "Abgleichen"-Klick warten, damit die Rasse VOR dem
  // eigentlichen Abgleich gewaehlt werden kann (Nutzerwunsch). setTimeout(0),
  // weil der eingefuegte Text im "paste"-Event selbst noch nicht im Feld
  // steht (siehe gleiches Muster bei #raw-text in horse.html).
  document.getElementById('stock-check-input').addEventListener('paste', () => {
    setTimeout(() => populateStockCheckBreeds(parseOwnHorseListText(document.getElementById('stock-check-input').value)), 0);
  });
});

// --- Bestandsabgleich: eigene Pferde im Spiel vs. Datenbank -------------
//
// Ohne Spiel-API laesst sich das nur ueber einen manuellen Text-Abgleich
// loesen (wie der normale Pferde-Import auch). Quelle ist NICHT die
// einzelne Pferdeseite (das ist horse.html/js/parser.js), sondern der
// eigene "Zucht"-Reiter im Nutzerprofil mit aufgeklapptem "Pferde
// anzeigen?" - dort steht je Pferd EIN Feld pro Zeile in fester
// Reihenfolge (Name, Rasse, Geschlecht, Alter, GP, Farbe), siehe
// parseOwnHorseListText. Die erkannten Pferde (samt Rasse) werden im
// Ergebnis mit angezeigt, damit Fehlinterpretationen auffallen statt sich
// als falsches "fehlt in der Datenbank" zu tarnen.

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function loadStockCheckOwners() {
  const sel = document.getElementById('stock-check-owner');
  const { data, error } = await supabaseClient.from('horses').select('owner');
  if (error || !data) return;
  const owners = [...new Set(data.map((h) => h.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  sel.innerHTML = owners.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
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
  sel.innerHTML = '<option value="">Alle</option>' + breeds.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  if (breeds.includes(current)) sel.value = current;
}

async function runStockCheck() {
  const owner = document.getElementById('stock-check-owner').value;
  const breed = document.getElementById('stock-check-breed').value;
  const resultEl = document.getElementById('stock-check-result');
  const rawText = document.getElementById('stock-check-input').value;
  const allEntries = parseOwnHorseListText(rawText);
  populateStockCheckBreeds(allEntries);

  if (!owner) {
    resultEl.innerHTML = '<p class="error">Bitte einen Besitzer auswählen.</p>';
    return;
  }
  if (!allEntries.length) {
    resultEl.innerHTML = '<p class="error">Keine Pferde erkannt - bitte prüfen, ob die komplette Profilseite mit aufgeklapptem "Pferde anzeigen?" eingefügt wurde.</p>';
    return;
  }
  const entries = breed ? allEntries.filter((e) => e.breed === breed) : allEntries;
  if (!entries.length) {
    resultEl.innerHTML = `<p class="error">Keines der ${allEntries.length} erkannten Pferde hat die Rasse „${escapeHtml(breed)}".</p>`;
    return;
  }

  resultEl.innerHTML = '<p class="muted small">Lädt…</p>';
  let dbQuery = supabaseClient.from('horses').select('id, name, breed').ilike('owner', owner);
  if (breed) dbQuery = dbQuery.eq('breed', breed);
  const { data, error } = await dbQuery;
  if (error) {
    resultEl.innerHTML = `<p class="error">Abgleich fehlgeschlagen: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const gameSet = new Set(entries.map((e) => e.name.toLowerCase()));
  const dbSet = new Set((data || []).map((h) => (h.name || '').toLowerCase()));

  const missingInDb = entries
    .filter((e) => !dbSet.has(e.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const missingInGame = (data || [])
    .filter((h) => !gameSet.has((h.name || '').toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));

  const list = (items, empty) => items.length
    ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    : `<p class="small muted">${empty}</p>`;

  resultEl.innerHTML = `
    <p class="small muted">${entries.length} von ${allEntries.length} erkannten Pferden berücksichtigt${breed ? ` (Rasse „${escapeHtml(breed)}")` : ''}, ${(data || []).length} Pferde mit Besitzer „${escapeHtml(owner)}"${breed ? ` und dieser Rasse` : ''} in der Datenbank.</p>
    <p class="group-heading">🆕 Im Spiel vorhanden, aber (noch) nicht in der Datenbank</p>
    ${list(missingInDb.map((e) => `${e.name} (${e.breed})`), 'Keine – alles eingetragen.')}
    <p class="group-heading">❓ In der Datenbank, aber nicht (mehr) in der eingefügten Liste</p>
    <p class="small muted">Möglicherweise verkauft/abgegeben, oder die Schreibweise weicht leicht ab (z.B. Groß-/Kleinschreibung, Sonderzeichen) – bitte vor dem Löschen/Ändern kurz prüfen.</p>
    ${list(missingInGame.map((h) => `${h.name || '(ohne Name)'}${h.breed ? ` (${h.breed})` : ''}`), 'Keine – alle Datenbank-Einträge tauchen auch in der Liste auf.')}
  `;
}
