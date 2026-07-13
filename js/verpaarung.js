let currentIdentity = '';

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

  const { error } = await supabaseClient.from('pairings').insert(payload);
  if (error) {
    errorEl.textContent = 'Speichern fehlgeschlagen: ' + error.message;
    return;
  }

  document.querySelector('#pairing-form').reset();
  document.querySelector('#p-owner').value = currentIdentity;
  await populateOwnerFilter();
  await loadPairings();
}

async function loadPairings() {
  const tbody = document.querySelector('#pairing-table tbody');
  tbody.innerHTML = '<tr><td colspan="7">Lade…</td></tr>';

  const owner = document.querySelector('#f-owner').value;
  let q = supabaseClient.from('pairings').select('*').order('pairing_date', { ascending: false });
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
}

function rowHtml(p) {
  const keepFoalText = p.keep_foal === true ? 'Ja' : p.keep_foal === false ? 'Nein' : '-';
  return `<tr>
    <td>${escapeHtml(p.stallion || '')}</td>
    <td>${escapeHtml(p.mare || '')}</td>
    <td>${escapeHtml(p.pairing_date || '-')}</td>
    <td>${escapeHtml(keepFoalText)}</td>
    <td>${escapeHtml(p.notes || '')}</td>
    <td>${escapeHtml(p.owner || '')}</td>
    <td><button class="danger small" data-delete="${p.id}">Löschen</button></td>
  </tr>`;
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
