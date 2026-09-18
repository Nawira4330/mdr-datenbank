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
});

// --- Bestandsabgleich: eigene Pferde im Spiel vs. Datenbank -------------
//
// Ohne Spiel-API laesst sich das nur ueber einen manuellen Text-Abgleich
// loesen (wie der normale Pferde-Import auch) - die eingefuegte Liste wird
// daher bewusst tolerant eingelesen (siehe extractHorseNamesFromList) und
// die erkannte Namensliste zusammen mit dem Ergebnis angezeigt, damit
// Fehlinterpretationen (z.B. eine mitkopierte Spaltenueberschrift) sofort
// auffallen statt sich als falsches "fehlt in der Datenbank" zu tarnen.

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

// Eine Zeile pro Pferd erwartet - zusaetzliche, per Tab oder mehrfachem
// Leerzeichen abgetrennte Spalten in derselben Zeile (z.B. Rasse/Alter,
// falls mitkopiert) werden ignoriert, nur der erste Abschnitt zaehlt als
// Name. Offensichtliche Nicht-Namen (leer, rein numerisch/Prozentwerte,
// bekannte UI-Begriffe wie Spaltenkoepfe) werden rausgefiltert, damit sie
// nicht faelschlich als "fehlendes Pferd" auftauchen.
const STOCK_CHECK_NOISE_WORDS = new Set([
  'suche', 'alle', 'name', 'rang', 'geschlecht', 'rasse', 'besitzer', 'schlagwörter',
  'schlagwort', 'zzl', 'hengst', 'stute', 'wallach', 'hengstfohlen', 'stutfohlen', 'fohlen',
]);
function extractHorseNamesFromList(rawText) {
  const names = rawText
    .split('\n')
    .map((line) => line.split(/\t| {2,}/)[0].trim())
    .filter(Boolean)
    .filter((name) => !/^[\d.,%\s]+$/.test(name))
    .filter((name) => !STOCK_CHECK_NOISE_WORDS.has(name.toLowerCase()));
  return [...new Set(names)];
}

async function runStockCheck() {
  const owner = document.getElementById('stock-check-owner').value;
  const resultEl = document.getElementById('stock-check-result');
  const rawText = document.getElementById('stock-check-input').value;
  const gameNames = extractHorseNamesFromList(rawText);

  if (!owner) {
    resultEl.innerHTML = '<p class="error">Bitte einen Besitzer auswählen.</p>';
    return;
  }
  if (!gameNames.length) {
    resultEl.innerHTML = '<p class="error">Keine Pferdenamen aus dem eingefügten Text erkannt.</p>';
    return;
  }

  resultEl.innerHTML = '<p class="muted small">Lädt…</p>';
  const { data, error } = await supabaseClient.from('horses').select('id, name').ilike('owner', owner);
  if (error) {
    resultEl.innerHTML = `<p class="error">Abgleich fehlgeschlagen: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const gameSet = new Set(gameNames.map((n) => n.toLowerCase()));
  const dbSet = new Set((data || []).map((h) => h.name.toLowerCase()));

  const missingInDb = gameNames
    .filter((n) => !dbSet.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'de'));
  const missingInGame = (data || [])
    .filter((h) => !gameSet.has((h.name || '').toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));

  const list = (items, empty) => items.length
    ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    : `<p class="small muted">${empty}</p>`;

  resultEl.innerHTML = `
    <p class="small muted">${gameNames.length} Namen aus der eingefügten Liste erkannt, ${(data || []).length} Pferde mit Besitzer „${escapeHtml(owner)}" in der Datenbank.</p>
    <p class="group-heading">🆕 Im Spiel vorhanden, aber (noch) nicht in der Datenbank</p>
    ${list(missingInDb, 'Keine – alles eingetragen.')}
    <p class="group-heading">❓ In der Datenbank, aber nicht (mehr) in der eingefügten Liste</p>
    <p class="small muted">Möglicherweise verkauft/abgegeben, oder die Schreibweise weicht leicht ab (z.B. Groß-/Kleinschreibung, Sonderzeichen) – bitte vor dem Löschen/Ändern kurz prüfen.</p>
    ${list(missingInGame.map((h) => h.name || '(ohne Name)'), 'Keine – alle Datenbank-Einträge tauchen auch in der Liste auf.')}
  `;
}
