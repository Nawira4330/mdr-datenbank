// Automatischer Check/Nachpflege der Träger-Einträge für rezessive, nur
// reinerbig sichtbare Merkmale (Flaxen, Pearl) im GESAMTEN Bestand
// (Verwaltung) - siehe fieldset "Flaxen-/Pearl-Trägerschaft nachpflegen"
// in verwaltung.html. Nutzt RECESSIVE_CARRIER_TRAITS/
// isVisiblyHomozygousForTrait aus horseForm.js (dort auch beim normalen
// Speichern verwendet, siehe autoInheritFromParents/autoUpdateParentCarriers).
//
// Hintergrund: Flaxen UND Pearl zeigen sich beide nur reinerbig
// ("flfl"/"plpl") - ein sichtbar reinerbiges Pferd MUSS zwingend BEIDE
// Eltern als mindestens Träger gehabt haben UND vererbt selbst an JEDES
// eigene Nachkommen mindestens eine Kopie. Beim Speichern wird das seitdem
// automatisch in beide Richtungen nachgetragen - dieses Tool holt das für
// den kompletten, bereits vorhandenen Bestand rückwirkend nach.
//
// Prüft AUSSERDEM jedes Pferd auf einen früheren Bugfall (Bugreport
// "Hollow Dusk"): war ein Pferd selbst schon sichtbar reinerbig (eigene
// Fellfarbe/Notiz) UND hatte zusätzlich einen ebenso reinerbigen
// Elternteil, trug eine frühere Version des Speicher-Hooks dort fälschlich
// nur "het" (Träger) nach - das unterdrückte die eigentlich korrekte
// "flfl"/"plpl"-Anzeige (Overrides haben Vorrang vor abgeleiteten
// Hinweisen). Wird hier korrigiert (Override entfernt).
//
// Läuft AUTOMATISCH beim Öffnen dieser Seite (kein Klick nötig) - der
// "Start"-Button bleibt für ein manuelles erneutes Prüfen (z.B. nach
// frisch eingetragenen neuen Pferden) erhalten. Läuft komplett im Browser
// (kein eigenes Backend nötig) - lädt einmal den gesamten Bestand, baut
// daraus eine Name->Pferd(e)-Zuordnung und aktualisiert dann jedes
// betroffene Pferd einzeln.
//
// Zweistufig je Merkmal, damit die Reihenfolge im Bestand keine Rolle
// spielt: zuerst werden ALLE Selbstkorrekturen (Bugfall oben) vorgenommen,
// erst danach - mit garantiert korrigiertem Stand - die Weitergabe an
// Eltern/Nachkommen geprüft.
// escapeHtml/gameLinkPrefix/linkedName werden hier einmalig definiert und
// auch von carrierAudit.js/pedigreeAudit.js genutzt (dieselbe Seite,
// gemeinsamer globaler Scope über klassische <script>-Tags, siehe
// verwaltung.html - Ladereihenfolge: dieses Skript zuerst).
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Nutzerwunsch: in den Fehler-/Warnmeldungen der Verwaltungs-Tools vor
// jedem Pferdenamen einen Link zum echten Spielprofil setzen (1:1
// dieselbe URL-Konvention wie der 🔗-Button in list.js) - erspart das
// manuelle Suchen im Spiel. Ohne bekannte externe ID (external_id) gibt
// es keinen Link, nur den (escapten) Namen.
function gameLinkPrefix(horse) {
  if (!horse?.external_id) return '';
  return `<a href="https://www.morning-dust-ranch.de/index2.php?site=pferd&id=${encodeURIComponent(horse.external_id)}" target="_blank" rel="noopener" title="Zum Pferd im Spiel">🔗</a> `;
}

function linkedName(horse) {
  return `${gameLinkPrefix(horse)}${escapeHtml(horse?.name ?? '')}`;
}

// Für Namen, die nur als Text vorliegen (z.B. ein Eltern-/Vorfahrenname
// im Stammbaum, kein direkt verfügbares Pferde-Objekt) - "byName" ist
// eine Map<name, Pferd[]>, wie sie jedes der drei Verwaltungs-Tools
// (carrierBackfill/carrierAudit/pedigreeAudit) aus seiner eigenen
// Pferdeliste aufbaut. Ohne Treffer bleibt es beim reinen (escapten)
// Namen, ohne Link.
function linkedNameByLookup(byName, name) {
  const rec = (byName.get(name) || [])[0];
  return rec ? linkedName(rec) : escapeHtml(name);
}

async function runCarrierBackfill() {
  const statusEl = document.getElementById('carrier-backfill-status');
  const logList = document.getElementById('carrier-backfill-log');
  logList.innerHTML = '';

  statusEl.textContent = 'Lade Pferdeliste…';
  const { data: horses, error } = await fetchAllRows(
    supabaseClient.from('horses').select('id, name, external_id, pedigree, colors, coat_color, notes, color_gene_overrides'),
  );
  if (error || !horses) {
    statusEl.textContent = 'Fehler beim Laden der Pferdeliste: ' + (error?.message || 'unbekannt');
    return;
  }

  const byName = new Map();
  for (const h of horses) {
    const list = byName.get(h.name) || [];
    list.push(h);
    byName.set(h.name, list);
  }

  function logLine(html) {
    const li = document.createElement('li');
    li.innerHTML = html;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
  }

  let updatedCount = 0;
  let correctedCount = 0;
  let warningCount = 0;
  let failedCount = 0;

  async function writeOverride(horse, trait, value) {
    const overrides = { ...(horse.color_gene_overrides || {}) };
    if (value === null) delete overrides[trait.overrideKey];
    else overrides[trait.overrideKey] = value;
    const { error: updateError } = await supabaseClient.from('horses').update({ color_gene_overrides: overrides }).eq('id', horse.id);
    if (updateError) {
      failedCount++;
      logLine(`❌ ${linkedName(horse)} (${trait.label}): Fehler beim Speichern (${escapeHtml(updateError.message)})`);
      return false;
    }
    horse.color_gene_overrides = overrides; // für nachfolgende Lookups (byName) aktuell halten
    return true;
  }

  function parentNamesOf(horse) {
    const ancestors = Array.isArray(horse.pedigree) ? horse.pedigree.slice(1) : (horse.pedigree?.ancestors || []);
    return [ancestors[0]?.name, ancestors[1]?.name].filter(Boolean);
  }

  for (const trait of RECESSIVE_CARRIER_TRAITS) {
    // Pass 1: Selbstkorrektur (Bugfall "Hollow Dusk") - unabhängig von
    // Eltern/Nachkommen, nur die eigene Fellfarbe/Notiz zählt.
    for (let i = 0; i < horses.length; i++) {
      const horse = horses[i];
      statusEl.textContent = `${trait.label}: Selbstkorrektur (${i + 1}/${horses.length})…`;
      const current = horse.color_gene_overrides?.[trait.overrideKey];
      const ownHom = isVisiblyHomozygousForTrait(horse, trait, false);
      if (current === 'het' && ownHom) {
        if (await writeOverride(horse, trait, null)) {
          correctedCount++;
          logLine(`🔧 ${linkedName(horse)} (${trait.label}): war fälschlich nur als Träger markiert, ist aber selbst sichtbar ${trait.label} - korrigiert.`);
        }
      } else if (current === 'absent' && ownHom) {
        warningCount++;
        logLine(`⚠️ ${linkedName(horse)}: eigene Fellfarbe/Notiz zeigt ${trait.label}, aber als "nicht vorhanden" markiert - Widerspruch, bitte manuell prüfen.`);
      }
    }

    // Pass 2: Weitergabe an Eltern UND Nachkommen, mit dem durch Pass 1
    // garantiert korrigierten Stand.
    for (let i = 0; i < horses.length; i++) {
      const horse = horses[i];
      statusEl.textContent = `${trait.label}: Vererbung (${i + 1}/${horses.length})…`;
      const confirmedHom = isVisiblyHomozygousForTrait(horse, trait, true);

      if (confirmedHom) {
        // Beide Eltern (falls in der Datenbank vorhanden) müssen mindestens
        // Träger sein.
        for (const parentName of parentNamesOf(horse)) {
          for (const parent of byName.get(parentName) || []) {
            const pCurrent = parent.color_gene_overrides?.[trait.overrideKey];
            if (pCurrent === 'het' || pCurrent === 'hom') continue;
            if (pCurrent === 'absent') {
              warningCount++;
              logLine(`⚠️ ${linkedName(parent)}: als "${trait.label} nicht vorhanden" markiert, müsste laut Nachkomme „${linkedName(horse)}" aber Träger sein - bitte manuell prüfen.`);
              continue;
            }
            if (isVisiblyHomozygousForTrait(parent, trait, false)) continue; // selbst schon sichtbar, nichts nachzutragen
            if (await writeOverride(parent, trait, 'het')) {
              updatedCount++;
              logLine(`✅ ${linkedName(parent)}: als ${trait.label}-Träger markiert (Nachkomme „${linkedName(horse)}" ist ${trait.label}).`);
            }
          }
        }
        continue;
      }

      // Nicht selbst reinerbig - ggf. von einem Elternteil erben.
      const current = horse.color_gene_overrides?.[trait.overrideKey];
      if (current === 'het' || current === 'hom') continue;
      const parentNames = parentNamesOf(horse);
      if (!parentNames.length) continue;
      const traitParentName = parentNames.find((n) => (byName.get(n) || []).some((p) => isVisiblyHomozygousForTrait(p, trait, true)));
      if (!traitParentName) continue;

      if (current === 'absent') {
        warningCount++;
        logLine(`⚠️ ${linkedName(horse)}: als "${trait.label} nicht vorhanden" markiert, müsste laut Elternteil „${linkedNameByLookup(byName, traitParentName)}" aber Träger sein - bitte manuell prüfen.`);
        continue;
      }

      if (await writeOverride(horse, trait, 'het')) {
        updatedCount++;
        logLine(`✅ ${linkedName(horse)}: als ${trait.label}-Träger markiert (Elternteil „${linkedNameByLookup(byName, traitParentName)}" ist ${trait.label}).`);
      }
    }
  }

  const traitLabels = RECESSIVE_CARRIER_TRAITS.map((t) => t.label).join(' + ');
  statusEl.textContent = `Fertig: ${horses.length} Pferde geprüft (${traitLabels}), ${updatedCount} als Träger nachgetragen, ${correctedCount} fälschlich als "nur Träger" markierte korrigiert, ${warningCount} Widerspruch/-sprüche gefunden, ${failedCount} fehlgeschlagen.`;
  if (!updatedCount && !correctedCount && !warningCount && !failedCount) {
    logLine('Keine Änderungen nötig - der Bestand ist bereits aktuell.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session || !isAdminSession(session)) return;

  const startBtn = document.getElementById('carrier-backfill-start-btn');
  async function runAndToggle() {
    startBtn.disabled = true;
    try {
      await runCarrierBackfill();
    } finally {
      startBtn.disabled = false;
    }
  }
  startBtn.addEventListener('click', runAndToggle);
  // Läuft automatisch beim Öffnen der Seite (siehe Nutzerwunsch) - der
  // Button bleibt für ein manuelles erneutes Prüfen erhalten.
  runAndToggle();
});
