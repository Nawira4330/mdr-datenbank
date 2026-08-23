// Gemeinsame Kopfzeilen-Navigation (MDR-Planer/MDR-DB/Konto-Dropdowns) -
// auf allen 9 Seiten identisch, deshalb hier zentral statt je Seite im
// HTML dupliziert. Jede Seite behält nur ihren eigenen ersten Nav-Punkt
// (z.B. "+ Neues Pferd" auf der Übersicht, sonst "← Zur Übersicht")
// direkt im HTML - renderSharedNav() hängt den Rest daran an.
//
// Aufruf: von jeder Seite direkt nach requireSession() (siehe js/auth.js)
// mit der gültigen Session - await renderSharedNav(session). Übernimmt
// dabei auch wireLogout() (kein separater Aufruf mehr nötig) sowie die
// Admin-/Verpaarungs-Log-Sichtbarkeit, die vorher je Seite einzeln
// gepflegt wurden.

// Feste Liste der MDR-Planer-Tools (anderes Repo,
// https://nawira4330.github.io/mdr-planer/) - hier nur als Links
// hinterlegt, keine gemeinsame Code-Basis zwischen den beiden Projekten.
const MDR_PLANER_LINKS = [
  { label: 'alle Tools', url: 'https://nawira4330.github.io/mdr-planer/' },
  { label: 'Zuchtplaner', url: 'https://nawira4330.github.io/mdr-planer/zuchtplaner.html' },
  { label: 'Turnierplaner', url: 'https://nawira4330.github.io/mdr-planer/turnierplaner.html' },
  { label: 'Zuchtbuch', url: 'https://nawira4330.github.io/mdr-planer/zuchtbuch.html' },
  { label: 'Fohlen-Tracker', url: 'https://nawira4330.github.io/mdr-planer/fohlen-tracker.html' },
  { label: 'Verwandtschaftsmatrix', url: 'https://nawira4330.github.io/mdr-planer/verwandtschaft.html' },
];

function navEscapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function renderSharedNav(session) {
  const nav = document.querySelector('.topbar nav');
  if (!nav) return;

  const admin = isAdminSession(session);
  // Nutzerwunsch: immer nur der Benutzername vor dem "@" (auch für Admin-
  // Konten) - vorher zeigte der Admin-Fall die volle synthetische
  // Login-E-Mail (z.B. "nawira13@benutzer.mdr-datenbank.local").
  const identity = session.user.email.split('@')[0];

  const mdrPlanerItems = MDR_PLANER_LINKS
    .map(({ label, url }) => `<a href="${url}" target="_blank" rel="noopener">${navEscapeHtml(label)} <span class="nav-ext">↗</span></a>`)
    .join('');

  const wrap = document.createElement('div');
  wrap.className = 'nav-dropdowns';
  wrap.style.display = 'contents';
  wrap.innerHTML = `
    <div class="nav-dropdown">
      <button type="button" class="btn secondary nav-dropdown-toggle">MDR-Planer</button>
      <div class="nav-dropdown-menu" hidden>${mdrPlanerItems}</div>
    </div>
    <div class="nav-dropdown">
      <button type="button" class="btn secondary nav-dropdown-toggle">MDR-DB</button>
      <div class="nav-dropdown-menu" hidden>
        <a href="anleitung.html">Anleitung</a>
        <a href="updatelog.html">Update-Log</a>
        <a href="verpaarung.html" id="verpaarung-link">💞 Verpaarungs-Log</a>
      </div>
    </div>
    <div class="nav-dropdown">
      <button type="button" class="btn secondary nav-dropdown-toggle">${navEscapeHtml(identity)}</button>
      <div class="nav-dropdown-menu" hidden>
        <a href="einstellungen.html">⚙️ Einstellungen</a>
        <a href="durchschnitt.html">📊 Durchschnitt</a>
        <a href="verwaltung.html" id="verwaltung-link" hidden>🛠️ Verwaltung</a>
        <hr />
        <button type="button" id="logout-btn">Abmelden</button>
      </div>
    </div>
  `;
  nav.appendChild(wrap);

  // Auf/Zuklappen wie bei den Checkbox-Dropdowns der Übersicht (siehe
  // wireCheckDropdowns in list.js) - hier eigenständig, da nicht jede
  // Seite list.js lädt.
  nav.querySelectorAll('.nav-dropdown-toggle').forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = toggle.nextElementSibling;
      const wasOpen = !panel.hidden;
      nav.querySelectorAll('.nav-dropdown-menu').forEach((p) => { p.hidden = true; });
      nav.querySelectorAll('.nav-dropdown-toggle').forEach((t) => { t.classList.remove('open'); });
      panel.hidden = wasOpen;
      toggle.classList.toggle('open', !wasOpen);
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      nav.querySelectorAll('.nav-dropdown-menu').forEach((p) => { p.hidden = true; });
      nav.querySelectorAll('.nav-dropdown-toggle').forEach((t) => { t.classList.remove('open'); });
    }
  });

  if (admin) document.getElementById('verwaltung-link').hidden = false;

  // Verpaarungs-Log-Menüpunkt je nach persönlicher Einstellung aus-
  // blenden (siehe einstellungen.html) - fehlt die Zeile (noch nie
  // gespeichert), gilt der Standard: sichtbar.
  const { data, error } = await supabaseClient
    .from('user_settings')
    .select('verpaarung_enabled')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (!error && data && data.verpaarung_enabled === false) {
    document.getElementById('verpaarung-link').hidden = true;
  }

  wireLogout();
}
