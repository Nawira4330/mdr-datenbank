let currentIdentity = '';
let currentPairing = null; // die Verpaarung, fuer die gerade das Fohlen-Popup offen ist
let currentSort = { field: 'pairing_date', dir: 'desc' }; // siehe wireSortableHeaders

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();

  const admin = isAdminSession(session);
  const displayIdentity = admin ? session.user.email : session.user.email.split('@')[0];
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity}`;
  currentIdentity = session.user.email.split('@')[0];
  document.querySelector('#p-owner').value = currentIdentity;

  await populateHorseNames();
  await populateOwnerFilter();

  document.querySelector('#pairing-form').addEventListener('submit', onAddPairing);
  document.querySelector('#f-owner').addEventListener('change', loadPairings);
  document.querySelector('#foal-modal-skip').addEventListener('click', closeFoalModal);
  document.querySelector('#foal-modal-save').addEventListener('click', onSaveFoal);
  wireDuplicateModal();
  wireSortableHeaders();

  await loadPairings();
}

// Deckhengst/Stute als Freitext mit Vorschlägen aus den bereits
// angelegten Pferden (keine feste Verknüpfung, damit auch Pferde
// außerhalb dieser Datenbank eingetragen werden können).
async function populateHorseNames() {
  const { data } = await supabaseClient.from('horses').select('name').order('name');
  const datalist = document.querySelector('#horse-names');
  (data || []).forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h.name;
    datalist.appendChild(opt);
  });
}

// Besitzer-Filter ist standardmäßig auf den eigenen Benutzernamen gesetzt,
// damit jede*r zuerst nur die eigenen Verpaarungen sieht - über die
// Auswahl lassen sich aber auch die anderer Besitzer*innen ansehen.
async function populateOwnerFilter() {
  const { data } = await supabaseClient.from('pairings').select('owner');
  const owners = new Set((data || []).map((p) => p.owner).filter(Boolean));
  owners.add(currentIdentity);

  const sel = document.querySelector('#f-owner');
  const previous = sel.value;
  sel.innerHTML = '';
  [...owners].sort((a, b) => a.localeCompare(b, 'de')).forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.value = previous || currentIdentity;
}

async function onAddPairing(e) {
  e.preventDefault();
  const errorEl = document.querySelector('#pairing-form-error');
  errorEl.textContent = '';

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const stallion = document.querySelector('#p-stallion').value.trim();
  const mare = document.querySelector('#p-mare').value.trim();
  if (!stallion || !mare) {
    errorEl.textContent = 'Deckhengst und Stute sind Pflichtfelder.';
    return;
  }

  const ownerInput = document.querySelector('#p-owner').value.trim();
  const keepFoalVal = document.querySelector('#p-keep-foal').value;

  const payload = {
    user_id: session.user.id,
    owner: ownerInput || currentIdentity,
    stallion,
    mare,
    pairing_date: document.querySelector('#p-date').value || null,
    keep_foal: keepFoalVal === '' ? null : keepFoalVal === 'true',
    notes: document.querySelector('#p-notes').value.trim() || null,
  };

  const { data: inserted, error } = await supabaseClient.from('pairings').insert(payload).select().single();
  if (error) {
    errorEl.textContent = 'Speichern fehlgeschlagen: ' + error.message;
    return;
  }

  document.querySelector('#pairing-form').reset();
  document.querySelector('#p-owner').value = currentIdentity;
  await populateOwnerFilter();
  await loadPairings();

  // "Fohlen behalten" gesetzt (Ja ODER Nein, nicht "unbekannt") -> Popup
  // zum Eintragen des Fohlens anbieten (siehe openFoalModal).
  if (payload.keep_foal !== null) {
    openFoalModal(inserted);
  }
}

// Klick auf eine sortierbare Spaltenkopfzeile (Deckhengst/Stute/
// Abfohldatum) sortiert danach; erneuter Klick auf dieselbe Spalte dreht
// die Richtung um - analog zum Sortieren in der Pferde-Uebersicht
// (list.js). Fehlende Werte landen dabei unabhaengig von der Richtung
// immer am Ende, nicht ganz vorn.
function wireSortableHeaders() {
  document.querySelectorAll('#pairing-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = { field, dir: 'asc' };
      }
      loadPairings();
    });
  });
}

async function loadPairings() {
  const tbody = document.querySelector('#pairing-table tbody');
  tbody.innerHTML = '<tr><td colspan="7">Lade…</td></tr>';

  const owner = document.querySelector('#f-owner').value;
  let q = supabaseClient.from('pairings').select('*')
    .order(currentSort.field, { ascending: currentSort.dir === 'asc', nullsFirst: false });
  if (owner) q = q.ilike('owner', owner);

  const { data, error } = await q;
  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="error">Fehler beim Laden: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7">Keine Verpaarungen gefunden.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(rowHtml).join('');
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => onDeletePairing(btn.dataset.delete));
  });
  tbody.querySelectorAll('[data-foal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pairing = data.find((p) => p.id === btn.dataset.foal);
      if (pairing) openFoalModal(pairing);
    });
  });
  tbody.querySelectorAll('[data-keepfoal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pairing = data.find((p) => p.id === btn.dataset.keepfoal);
      if (pairing) onSetKeepFoal(pairing, btn.dataset.value === 'true');
    });
  });
  tbody.querySelectorAll('[data-editdate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pairing = data.find((p) => p.id === btn.dataset.editdate);
      if (pairing) onEditDate(pairing);
    });
  });
}

// "Fohlen behalten" wird per zwei Buttons (✓/✗) direkt in der Tabelle
// gesetzt statt nur als Text angezeigt - wichtig fuer per Decksprung-
// Button (mdr-Planer) angelegte Verpaarungen, die ohne Wert (unbekannt)
// ankommen und hier erst nachtraeglich entschieden werden.
function rowHtml(p) {
  const keepFoalCell = `
    <button type="button" class="keep-foal-btn keep-foal-yes${p.keep_foal === true ? ' active' : ''}" data-keepfoal="${p.id}" data-value="true" title="Fohlen behalten: Ja">✓</button>
    <button type="button" class="keep-foal-btn keep-foal-no${p.keep_foal === false ? ' active' : ''}" data-keepfoal="${p.id}" data-value="false" title="Fohlen behalten: Nein">✗</button>
  `;
  const foalBtn = p.keep_foal !== null
    ? `<button type="button" class="secondary small" data-foal="${p.id}">Fohlen eintragen</button>`
    : '';
  return `<tr>
    <td>${escapeHtml(p.stallion || '')}</td>
    <td>${escapeHtml(p.mare || '')}</td>
    <td>${escapeHtml(p.pairing_date || '-')}</td>
    <td class="keep-foal-cell">${keepFoalCell}</td>
    <td>${escapeHtml(p.notes || '')}</td>
    <td>${escapeHtml(p.owner || '')}</td>
    <td class="actions-cell">${foalBtn}<button type="button" class="secondary small" data-editdate="${p.id}">Bearbeiten</button><button class="danger small" data-delete="${p.id}">Löschen</button></td>
  </tr>`;
}

// Abfohldatum nachtraeglich aendern (z.B. per Decksprung-Button aus dem
// mdr-Planer automatisch auf Verpaarungsdatum + 30 Tage gesetzt, aber
// spaeter bekannt/korrigiert). Einfaches prompt() statt eigenem Modal,
// analog zum bestehenden confirm() bei onDeletePairing.
async function onEditDate(pairing) {
  const input = prompt('Abfohldatum (JJJJ-MM-TT), leer lassen zum Entfernen:', pairing.pairing_date || '');
  if (input === null) return; // abgebrochen
  const trimmed = input.trim();
  if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    alert('Bitte das Datum im Format JJJJ-MM-TT eingeben (z.B. 2026-08-12).');
    return;
  }
  const { error } = await supabaseClient.from('pairings').update({ pairing_date: trimmed || null }).eq('id', pairing.id);
  if (error) {
    alert('Speichern fehlgeschlagen: ' + error.message);
    return;
  }
  await loadPairings();
}

// Aendert "Fohlen behalten" nachtraeglich. War der Wert vorher unbekannt
// (null - typischerweise ein per Decksprung-Button automatisch
// angelegter Eintrag), oeffnet sich direkt danach das Fohlen-Popup
// (gleiches Verhalten wie beim erstmaligen Setzen in onAddPairing) -
// war bereits ein Wert gesetzt, nur der Wert aendern, ohne das Popup
// erneut aufzudraengen (dafuer gibt es den separaten "Fohlen eintragen"-
// Button).
async function onSetKeepFoal(pairing, value) {
  const wasUnset = pairing.keep_foal === null;
  const { data: updated, error } = await supabaseClient.from('pairings').update({ keep_foal: value }).eq('id', pairing.id).select().single();
  if (error) {
    alert('Speichern fehlgeschlagen: ' + error.message);
    return;
  }
  await loadPairings();
  if (wasUnset) openFoalModal(updated);
}

async function onDeletePairing(id) {
  if (!confirm('Diese Verpaarung wirklich unwiderruflich löschen?')) return;
  const { error } = await supabaseClient.from('pairings').delete().eq('id', id);
  if (error) {
    alert('Löschen fehlgeschlagen: ' + error.message);
    return;
  }
  await loadPairings();
}

// --- Fohlen-Popup ---
// Nutzt dieselben Feld-IDs wie horse.html und damit dessen (in
// horseForm.js definierte) Funktionen collectForm/fillForm/onParse/
// renderDetailTables wieder, statt sie zu duplizieren. horseForm.js'
// eigenes init() greift hier nicht (siehe Guard dort) - das Wiring der
// Buttons und das eigentliche Speichern übernimmt ausschließlich diese
// Datei.

function resetFoalForm() {
  ['name', 'gender', 'breed', 'coat_color', 'hlp_slp', 'notes', 'image_url',
    'purebred_pct', 'ico', 'disease_free', 'breeding_allowed'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  document.getElementById('raw-text').value = '';
  document.getElementById('parse-status').textContent = '';
  document.getElementById('form-error').textContent = '';
  document.getElementById('detail-tables').innerHTML = '';
  document.getElementById('detail-fieldset').hidden = true;
  extraData = {};
}

function openFoalModal(pairing) {
  currentPairing = pairing;
  resetFoalForm();
  document.getElementById('owner').value = pairing.owner || currentIdentity;

  const title = document.getElementById('foal-modal-title');
  const hint = document.getElementById('foal-modal-hint');
  if (pairing.keep_foal) {
    title.textContent = 'Fohlen behalten – als neues Pferd eintragen';
    hint.textContent = `Deckhengst: ${pairing.stallion} × Stute: ${pairing.mare}. Wird als neues Pferd gespeichert.`;
  } else {
    title.textContent = 'Fohlen (nicht behalten) – Werte für die Statistik erfassen';
    hint.textContent = `Deckhengst: ${pairing.stallion} × Stute: ${pairing.mare}. Wird NICHT als Pferd gespeichert, nur als Referenzdaten für die Fohlenwert-Schätzung im mdr-Planer - kann übersprungen werden.`;
  }

  document.getElementById('foal-modal').hidden = false;
}

function closeFoalModal() {
  document.getElementById('foal-modal').hidden = true;
  currentPairing = null;
}

// Sucht (ohne Namensabgleich) ein Pferd, dessen Stammbaum zu Deckhengst
// und Stute der aktuellen Verpaarung passt - Vater/Mutter sind laut
// parser.js/parsePedigree immer die ersten beiden Stammbaum-Einträge.
// Damit lassen sich z.B. Fohlen wiedererkennen, die zuerst automatisch
// als "Fohlen_Besitzer_MutterxVater" angelegt und später unter ihrem
// echten Namen erneut eingetragen wurden.
async function findPedigreeCandidate(stallion, mare, excludeName) {
  const { data, error } = await supabaseClient.from('horses').select('id, name, pedigree');
  if (error || !data) return null;
  const norm = (s) => (s || '').trim().toLowerCase();
  return data.find((h) => {
    if (norm(h.name) === norm(excludeName)) return false;
    const ancestors = Array.isArray(h.pedigree) ? h.pedigree.slice(1) : (h.pedigree?.ancestors || []);
    return norm(ancestors[0]?.name) === norm(stallion) && norm(ancestors[1]?.name) === norm(mare)
      && norm(stallion) && norm(mare);
  }) || null;
}

function wireDuplicateModal() {
  document.getElementById('foal-duplicate-cancel').addEventListener('click', () => {
    document.getElementById('foal-duplicate-modal').hidden = true;
    duplicateResolve?.(false);
  });
  document.getElementById('foal-duplicate-confirm').addEventListener('click', () => {
    document.getElementById('foal-duplicate-modal').hidden = true;
    duplicateResolve?.(true);
  });
}

let duplicateResolve = null;

// Zeigt die Ja/Nein-Nachfrage und liefert true (ist dasselbe Pferd ->
// bestehenden Datensatz aktualisieren) oder false (ist ein anderes Pferd
// -> normal neu anlegen).
function askIsSameHorse(candidateName) {
  document.getElementById('foal-duplicate-text').textContent =
    `Es gibt bereits ein Pferd mit demselben Vater/Mutter: "${candidateName}". Handelt es sich um dasselbe Pferd?`;
  document.getElementById('foal-duplicate-modal').hidden = false;
  return new Promise((resolve) => { duplicateResolve = resolve; });
}

async function onSaveFoal() {
  const errorEl = document.getElementById('form-error');
  errorEl.textContent = '';

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const formData = collectForm();
  if (!formData.name) {
    errorEl.textContent = 'Name ist ein Pflichtfeld.';
    return;
  }

  const payload = { ...formData };
  for (const k of JSONB_KEYS) {
    if (extraData[k] !== undefined) payload[k] = extraData[k];
  }

  let error;
  if (currentPairing.keep_foal) {
    // Wie horseForm.js performSave: exakter Namenstreffer -> bestehenden
    // Datensatz aktualisieren statt doppelt anzulegen.
    const { data: existingByName, error: lookupError } = await supabaseClient
      .from('horses')
      .select('id')
      .ilike('name', formData.name)
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      errorEl.textContent = 'Prüfung auf bestehenden Datensatz fehlgeschlagen: ' + lookupError.message;
      return;
    }

    let targetId = existingByName?.id || null;

    // Kein exakter Namenstreffer -> zusätzlich per Stammbaum prüfen (z.B.
    // vorher automatisch als "Fohlen_..." angelegtes Fohlen, jetzt unter
    // echtem Namen erneut eingetragen).
    if (!targetId) {
      const candidate = await findPedigreeCandidate(currentPairing.stallion, currentPairing.mare, formData.name);
      if (candidate) {
        const isSame = await askIsSameHorse(candidate.name);
        if (isSame) targetId = candidate.id;
      }
    }

    if (targetId) {
      ({ error } = await supabaseClient.from('horses').update(payload).eq('id', targetId));
    } else {
      payload.user_id = session.user.id;
      ({ error } = await supabaseClient.from('horses').insert(payload));
    }
  } else {
    payload.user_id = session.user.id;
    payload.kept = false;
    payload.pairing_id = currentPairing.id;
    ({ error } = await supabaseClient.from('foal_reference_data').insert(payload));
  }

  if (error) {
    errorEl.textContent = 'Speichern fehlgeschlagen: ' + error.message;
    return;
  }

  closeFoalModal();
  await populateHorseNames();
  await loadPairings();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
