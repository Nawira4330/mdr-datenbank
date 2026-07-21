// 1:1 portiert aus ../../js/parser.js (PHENOTYPE_GENE_HINTS,
// inferGeneticHintsFromPhenotype, isUntestedLocusValue,
// extractPresentAlleles, presentGenesSummary) - dieselbe Logik, mit der
// horse.html/list.js die "Farbgenetik"-Kurzzusammenfassung eines Pferds
// berechnen. Bei Aenderungen an der Ableitungslogik im Hauptrepo muss
// dieser Abschnitt manuell synchron gehalten werden (kein Build-Schritt,
// kein gemeinsames Modul zwischen den beiden separaten Node-Projekten).

// Reihenfolge ist wichtig: spezifischere/laengere Begriffe zuerst, sonst
// wuerde z.B. "Schwarzbraun"/"Wildbraun" faelschlich die generische
// "Braun"-Regel ausloesen, und "Varnish Roan" nicht als das separate
// cKit-Gen "Roan" erkannt werden. Jeder Treffer entfernt seinen Text aus
// der Arbeitskopie.
const PHENOTYPE_GENE_HINTS = [
  { pattern: /\bgold chestnut\b/i, label: 'Gold Chestnut (Schattierung, keine Champagne)', hints: [] },
  { pattern: /\bgold bay\b/i, label: 'Gold Bay (Schattierung, keine Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }] },
  { pattern: /\bgold dun cream\b/i, label: 'Gold Dun Cream (Chestnut-Dun-Champagne-Cream)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bgold dun pearl\b/i, label: 'Gold Dun Pearl (Chestnut-Dun-Champagne-Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bamber dun cream\b/i, label: 'Amber Dun Cream (Bay-Dun-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bamber dun pearl\b/i, label: 'Amber Dun Pearl (Bay-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsable dun cream\b/i, label: 'Sable Dun Cream (Sealbrown-Dun-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsable dun pearl\b/i, label: 'Sable Dun Pearl (Sealbrown-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsealbrown cream dun\b/i, label: 'Sealbrown Cream Dun (Sealbrown-Dun-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bsealbrown cream champagne\b/i, label: 'Sealbrown Cream Champagne (Sealbrown-Champagne-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bclassic dun cream\b/i, label: 'Classic Dun Cream (Black-Dun-Champagne-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bclassic dun pearl\b/i, label: 'Classic Dun Pearl (Black-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsmoky brown dun\b/i, label: 'Smoky Brown Dun (Sealbrown-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky cream dun\b/i, label: 'Smoky Cream Dun (Black-Dun-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bpearl bay dun\b/i, label: 'Pearl Bay Dun (Bay-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpearl brown dun\b/i, label: 'Pearl Brown Dun (Sealbrown-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpearl black dun\b/i, label: 'Pearl Black Dun (Black-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bwild dunskin\b/i, label: 'Wild Dunskin (Wildbay-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'Ap' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bsealbrown cream\b/i, label: 'Sealbrown Cream (Sealbrown-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bsmoky brown\b/i, label: 'Smoky Brown (Sealbrown-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky black\b/i, label: 'Smoky Black (Black-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky cream\b/i, label: 'Smoky Cream (Black-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bclassic dun\b/i, label: 'Classic Dun (Bay-Dun, mehrdeutig - siehe getestete Loci/Notiz)', hints: [{ locus: 'Dun', allele: 'D' }] },
  { pattern: /\bsmoky grulla\b/i, label: 'Smoky Grulla (Black-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bdunalino\b/i, label: 'Dunalino (Chestnut-Dun-Cream)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bgold dun\b/i, label: 'Gold Dun (Chestnut-Dun-Champagne)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bgold cream\b/i, label: 'Gold Cream (Chestnut-Champagne-Cream)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bapricot dun\b/i, label: 'Apricot Dun (Chestnut-Dun-Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bgold pearl\b/i, label: 'Gold Pearl (Chestnut-Champagne-Pearl)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bcremello dun\b/i, label: 'Cremello Dun (Chestnut-Dun-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bcremello champagne\b/i, label: 'Cremello Champagne (Chestnut-Champagne-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bdunskin\b/i, label: 'Dunskin (Bay-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bamber dun\b/i, label: 'Amber Dun (Bay-Dun-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bamber cream\b/i, label: 'Amber Cream (Bay-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bperlino champagne\b/i, label: 'Perlino Champagne (Bay-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsable dun\b/i, label: 'Sable Dun (Sealbrown-Dun-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bsable cream\b/i, label: 'Sable Cream (Sealbrown-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsable pearl\b/i, label: 'Sable Pearl (Sealbrown-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bclassic cream\b/i, label: 'Classic Cream (Black-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bclassic pearl\b/i, label: 'Classic Pearl (Black-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },

  // Basisfarbe + Verduennung: diese Namen setzen laut MDR-Farbvererbung
  // zwingend bestimmte Allele voraus.
  { pattern: /grulla/i, label: 'Grulla', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }] },
  { pattern: /wildbay|wildbraun/i, label: 'Wildbay', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'Ap' }] },
  { pattern: /sealbrown|schwarzbraun|\bbrown\b/i, label: 'Sealbrown/Brown', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }] },
  { pattern: /\b(bay|braun)\b/i, label: 'Bay', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }] },

  { pattern: /\bpalomino\b/i, label: 'Palomino (Chestnut-Cream)', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bcremello\b/i, label: 'Cremello (Chestnut-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bbuckskin\b/i, label: 'Buckskin (Bay-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bperlino\b/i, label: 'Perlino (Bay-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /smoky/i, label: 'Smoky', hints: [{ locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bsable\b/i, label: 'Sable (Sealbrown-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'At' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bgold\b/i, label: 'Gold (Chestnut-Champagne)', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bamber\b/i, label: 'Amber (Bay-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Agouti', allele: 'A1' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bclassic\b/i, label: 'Classic (Black-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }] },

  { pattern: /varnish roan/i, label: 'Varnish Roan', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  { pattern: /\bchampagne\b/i, label: 'Champagne', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\broan\b/i, label: 'Roan', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\btovero\b/i, label: 'Tovero (Tobiano + Overo)', hints: [{ locus: 'KIT', allele: 'To' }, { locus: 'Overo', allele: 'O' }] },
  { pattern: /\btobiano\b/i, label: 'Tobiano', hints: [{ locus: 'KIT', allele: 'To' }] },
  { pattern: /\bsabino\b/i, label: 'Sabino', hints: [{ locus: 'KIT', allele: 'Sb' }] },
  { pattern: /\bovero\b/i, label: 'Overo', hints: [{ locus: 'Overo', allele: 'O' }] },
  { pattern: /\bsplashed\b/i, label: 'Splashed White', hints: [{ locus: 'Splashed', allele: 'SPL' }] },
  { pattern: /\bsilver\b/i, label: 'Silver', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Silver', allele: 'Z' }] },
  { pattern: /\bpangare\b/i, label: 'Pangare', hints: [{ locus: 'Pangare', allele: 'Pa' }] },
  { pattern: /\bdun\b/i, label: 'Dun', hints: [{ locus: 'Dun', allele: 'D' }] },
  { pattern: /\bcream\b/i, label: 'Cream', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\b(pearl|apricot)\b/i, label: 'Pearl', hints: [{ locus: 'Cream', allele: 'plpl' }] },
  { pattern: /flaxentr[äa]ger/i, label: 'Flaxentraeger', hints: [{ locus: 'Flaxen', allele: 'fl' }] },
  { pattern: /\bflaxen\b/i, label: 'Flaxen', hints: [{ locus: 'Flaxen', allele: 'flfl' }] },
  { pattern: /\bsooty\b/i, label: 'Sooty', hints: [{ locus: 'Sooty', allele: 'sty' }] },
  { pattern: /\brabicano\b/i, label: 'Rabicano', hints: [{ locus: 'Rabicano', allele: 'rc' }] },
  { pattern: /\bgrey\b/i, label: 'Grey', hints: [{ locus: 'Grey', allele: 'G' }] },
  { pattern: /\b(leopard|fewspot|blanket|snowcap)\b/i, label: 'Leopard-Musterung', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },

  { pattern: /\bSPLSPL\b/i, label: 'Splashed White homozygot (Kuerzel)', hints: [{ locus: 'Splashed', allele: 'SPLSPL' }] },
  { pattern: /\bSBSB\b/i, label: 'Sabino homozygot (Kuerzel)', hints: [{ locus: 'KIT', allele: 'SbSb' }] },
  { pattern: /\bTOTO\b/i, label: 'Tobiano homozygot (Kuerzel)', hints: [{ locus: 'KIT', allele: 'ToTo' }] },
  { pattern: /\bRNRN\b/i, label: 'Roan homozygot (Kuerzel)', hints: [{ locus: 'KIT', allele: 'RnRn' }] },
  { pattern: /\bCHCH\b/i, label: 'Champagne homozygot (Kuerzel)', hints: [{ locus: 'Champagne', allele: 'ChCh' }] },
  { pattern: /\bCRCR\b/i, label: 'Cream homozygot (Kuerzel)', hints: [{ locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bLPLP\b/i, label: 'Appaloosa homozygot (Kuerzel)', hints: [{ locus: 'Appaloosa', allele: 'LpLp' }] },
  { pattern: /\bSTYSTY\b/i, label: 'Sooty homozygot (Kuerzel)', hints: [{ locus: 'Sooty', allele: 'stysty' }] },
  { pattern: /\bRCRC\b/i, label: 'Rabicano homozygot (Kuerzel)', hints: [{ locus: 'Rabicano', allele: 'rcrc' }] },

  { pattern: /\bSPL\b/i, label: 'Splashed White (Kuerzel)', hints: [{ locus: 'Splashed', allele: 'SPL' }] },
  { pattern: /\bSB\b/i, label: 'Sabino (Kuerzel)', hints: [{ locus: 'KIT', allele: 'Sb' }] },
  { pattern: /\bTo\b/i, label: 'Tobiano (Kuerzel)', hints: [{ locus: 'KIT', allele: 'To' }] },
  { pattern: /\bRn\b/i, label: 'Roan (Kuerzel)', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\bCh\b/i, label: 'Champagne (Kuerzel)', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bCr\b/i, label: 'Cream (Kuerzel)', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bLp\b/i, label: 'Appaloosa (Kuerzel)', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  { pattern: /\bO\b/i, label: 'Overo (Kuerzel)', hints: [{ locus: 'Overo', allele: 'O' }] },
  { pattern: /\bplpl\b/i, label: 'Pearl (Kuerzel)', hints: [{ locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpl\b/i, label: 'Pearl (Kuerzel)', hints: [{ locus: 'Cream', allele: 'pl' }] },
  { pattern: /\bflfl\b/i, label: 'Flaxen (Kuerzel)', hints: [{ locus: 'Flaxen', allele: 'flfl' }] },
  { pattern: /\bfl\b/i, label: 'Flaxen (Kuerzel)', hints: [{ locus: 'Flaxen', allele: 'fl' }] },
  { pattern: /\bsty\b/i, label: 'Sooty (Kuerzel)', hints: [{ locus: 'Sooty', allele: 'sty' }] },
  { pattern: /\brc\b/i, label: 'Rabicano (Kuerzel)', hints: [{ locus: 'Rabicano', allele: 'rc' }] },
];

// "parentMightHavePearl" (siehe parentsMightHavePearl in ../../js/horseForm.js)
// stuft bei als "ambiguousCream" markierten Eintraegen (Cremello/Perlino/
// Smoky Cream/...) das abgeleitete "CrCr" auf das vorsichtigere "Cr"
// herunter, falls ein Elternteil nachweislich pl traegt. Der Bot macht
// aktuell keine Eltern-Cross-Referenz, uebergibt also nie true - bleibt
// hier trotzdem als Parameter, um mit parser.js synchron zu bleiben.
function inferGeneticHintsFromPhenotype(text, parentMightHavePearl) {
  if (!text) return [];
  let working = text;
  const hints = [];
  for (const { pattern, hints: entryHints, label, ambiguousCream } of PHENOTYPE_GENE_HINTS) {
    if (pattern.test(working)) {
      for (const h of entryHints) {
        const allele = (ambiguousCream && parentMightHavePearl && h.locus === 'Cream' && h.allele === 'CrCr') ? 'Cr' : h.allele;
        hints.push({ locus: h.locus, allele, label });
      }
      working = working.replace(pattern, ' ');
    }
  }
  return hints;
}

function isUntestedLocusValue(value) {
  return /nicht getestet/i.test(value || '');
}

function extractPresentAlleles(rawValue) {
  if (!rawValue || isUntestedLocusValue(rawValue)) return '';
  const half = rawValue.length / 2;
  const tokens = Number.isInteger(half) ? [rawValue.slice(0, half), rawValue.slice(half)] : [rawValue];
  return tokens.filter((t) => t === 'pl' || /[A-Z]/.test(t)).join('');
}

// Anzeige-Reihenfolge (Grundfarbe/Aufhellungen/Sonderfarben/Scheckungen/
// Flaxen) - 1:1 aus ../../js/parser.js portiert, siehe dort für Details.
const GENE_DISPLAY_ORDER = [
  'Extension', 'Agouti',
  'Cream', 'Dun',
  'Champagne', 'Silver', 'Grey',
  'KIT', 'Overo', 'Splashed', 'Appaloosa', 'PATN1',
  'Flaxen',
];

function sortGenesForDisplay(genes) {
  return [...genes].sort((a, b) => {
    const ai = GENE_DISPLAY_ORDER.indexOf(a.locus);
    const bi = GENE_DISPLAY_ORDER.indexOf(b.locus);
    return (ai === -1 ? GENE_DISPLAY_ORDER.length : ai) - (bi === -1 ? GENE_DISPLAY_ORDER.length : bi);
  });
}

// Liefert {locus, alleles, source}[] - "getestet" (aus colorRows) und
// "abgeleitet"/"elternteil" (aus Fellfarbe/Notiz/Name bzw. Eltern-Hinweisen,
// hier ohne parentHints, da der Bot keine Eltern-Cross-Referenz macht).
function presentGenesSummary(colorRows, coatColorName, notes, horseName, parentHints, parentMightHavePearl) {
  const rows = colorRows || [];
  const confirmed = [];
  const testedLoci = new Set();

  for (const r of rows) {
    if (isUntestedLocusValue(r.value)) continue;
    testedLoci.add(r.label);
    const alleles = extractPresentAlleles(r.value);
    if (alleles) confirmed.push({ locus: r.label, alleles, source: 'getestet' });
  }

  const hints = [
    ...inferGeneticHintsFromPhenotype(coatColorName, parentMightHavePearl).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...inferGeneticHintsFromPhenotype(notes, parentMightHavePearl).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...inferGeneticHintsFromPhenotype(horseName, parentMightHavePearl).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...(parentHints || []).map((h) => ({ locus: h.locus, allele: h.alleles, source: 'elternteil' })),
  ];
  const seen = new Set();
  const inferred = [];
  for (const h of hints) {
    if (testedLoci.has(h.locus)) continue;
    const key = h.locus + h.allele;
    if (seen.has(key)) continue;
    seen.add(key);
    inferred.push({ locus: h.locus, alleles: h.allele, source: h.source });
  }

  return sortGenesForDisplay([...confirmed, ...inferred]);
}

module.exports = { presentGenesSummary };
