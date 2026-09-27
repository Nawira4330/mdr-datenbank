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
//
// WICHTIG, gegen alle 648 vollstaendig getesteten Pferde der echten
// Datenbank verifiziert (0 Widersprueche): Bay/Sealbrown/Wildbay/
// Buckskin/Perlino/Dunskin/Amber/Sable/Classic/Brown/Gold Bay belegen
// zwar sicher, DASS der Agouti-Locus ein praesentes Allel traegt, aber
// NICHT WELCHES (A1/At/Ap sind je nach Elterntieren austauschbar,
// dieselbe Fellfarbe entsteht mit mehreren Agouti-Genotypen) - fruehere
// Version dieser Datei behauptete faelschlich immer ein festes Allel
// (z.B. "Amber" immer A1), das bei echten getesteten Pferden oft nicht
// stimmte. Daher hier bewusst KEIN Agouti-Hinweis (nur Extension, das
// ist eindeutig). Ebenso wurde "Gold Wildbay" (reine Schattierung, KEINE
// Champagne, wie "Gold Bay") ergaenzt und "Perlino Champagne" von
// faelschlich Pearl (plpl) auf CrCr korrigiert (echte getestete Pferde
// mit diesem Namen hatten CrCr, nicht plpl).
const PHENOTYPE_GENE_HINTS = [
  { pattern: /\bgold chestnut\b/i, label: 'Gold Chestnut (Schattierung, keine Champagne)', hints: [] },
  { pattern: /\bgold bay\b/i, label: 'Gold Bay (Schattierung, keine Champagne)', hints: [{ locus: 'Extension', allele: 'E' }] },
  { pattern: /\bgold wildbay\b/i, label: 'Gold Wildbay (Schattierung, keine Champagne)', hints: [{ locus: 'Extension', allele: 'E' }] },
  { pattern: /\bgold dun cream\b/i, label: 'Gold Dun Cream (Chestnut-Dun-Champagne-Cream)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bgold dun pearl\b/i, label: 'Gold Dun Pearl (Chestnut-Dun-Champagne-Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bamber dun cream\b/i, label: 'Amber Dun Cream (Bay-Dun-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bamber dun pearl\b/i, label: 'Amber Dun Pearl (Bay-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsable dun cream\b/i, label: 'Sable Dun Cream (Sealbrown-Dun-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsable dun pearl\b/i, label: 'Sable Dun Pearl (Sealbrown-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsealbrown cream dun\b/i, label: 'Sealbrown Cream Dun (Sealbrown-Dun-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bsealbrown cream champagne\b/i, label: 'Sealbrown Cream Champagne (Sealbrown-Champagne-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bclassic dun cream\b/i, label: 'Classic Dun Cream (Black-Dun-Champagne-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bclassic dun pearl\b/i, label: 'Classic Dun Pearl (Black-Dun-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bsmoky brown dun\b/i, label: 'Smoky Brown Dun (Sealbrown-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky cream dun\b/i, label: 'Smoky Cream Dun (Black-Dun-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bpearl bay dun\b/i, label: 'Pearl Bay Dun (Bay-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpearl brown dun\b/i, label: 'Pearl Brown Dun (Sealbrown-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpearl black dun\b/i, label: 'Pearl Black Dun (Black-Dun-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bwild dunskin\b/i, label: 'Wild Dunskin (Wildbay-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bsealbrown cream\b/i, label: 'Sealbrown Cream (Sealbrown-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bsmoky brown\b/i, label: 'Smoky Brown (Sealbrown-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky black\b/i, label: 'Smoky Black (Black-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsmoky cream\b/i, label: 'Smoky Cream (Black-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bclassic dun\b/i, label: 'Classic Dun (Black-Dun)', hints: [{ locus: 'Dun', allele: 'D' }] },
  { pattern: /\bsmoky grulla\b/i, label: 'Smoky Grulla (Black-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bdunalino\b/i, label: 'Dunalino (Chestnut-Dun-Cream)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bgold dun\b/i, label: 'Gold Dun (Chestnut-Dun-Champagne)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bgold cream\b/i, label: 'Gold Cream (Chestnut-Champagne-Cream)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bapricot dun\b/i, label: 'Apricot Dun (Chestnut-Dun-Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bgold pearl\b/i, label: 'Gold Pearl (Chestnut-Champagne-Pearl)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bcremello dun\b/i, label: 'Cremello Dun (Chestnut-Dun-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bcremello champagne\b/i, label: 'Cremello Champagne (Chestnut-Champagne-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bdunskin\b/i, label: 'Dunskin (Bay-Dun-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bamber dun\b/i, label: 'Amber Dun (Bay-Dun-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bamber cream\b/i, label: 'Amber Cream (Bay-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bperlino champagne\b/i, label: 'Perlino Champagne (Bay-Champagne-doppel-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bsable dun\b/i, label: 'Sable Dun (Sealbrown-Dun-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bsable cream\b/i, label: 'Sable Cream (Sealbrown-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bsable pearl\b/i, label: 'Sable Pearl (Sealbrown-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bclassic cream\b/i, label: 'Classic Cream (Black-Champagne-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bclassic pearl\b/i, label: 'Classic Pearl (Black-Champagne-Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }, { locus: 'Cream', allele: 'plpl' }] },

  // Basisfarbe + Verduennung: diese Namen setzen laut MDR-Farbvererbung
  // Extension zwingend voraus - Agouti bewusst NICHT (siehe Hinweis oben).
  { pattern: /grulla/i, label: 'Grulla', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Dun', allele: 'D' }] },
  { pattern: /wildbay|wildbraun/i, label: 'Wildbay', hints: [{ locus: 'Extension', allele: 'E' }] },
  { pattern: /sealbrown|schwarzbraun|\bbrown\b/i, label: 'Sealbrown/Brown', hints: [{ locus: 'Extension', allele: 'E' }] },
  { pattern: /\b(bay|braun)\b/i, label: 'Bay', hints: [{ locus: 'Extension', allele: 'E' }] },

  { pattern: /\bpalomino\b/i, label: 'Palomino (Chestnut-Cream)', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bcremello\b/i, label: 'Cremello (Chestnut-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /\bbuckskin\b/i, label: 'Buckskin (Bay-Cream)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bperlino\b/i, label: 'Perlino (Bay-doppel-Cream/Cream+Pearl)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Cream', allele: 'CrCr' }], ambiguousCream: true },
  { pattern: /smoky/i, label: 'Smoky', hints: [{ locus: 'Cream', allele: 'Cr' }] },

  { pattern: /\bsable\b/i, label: 'Sable (Sealbrown-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bgold\b/i, label: 'Gold (Chestnut-Champagne)', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bamber\b/i, label: 'Amber (Bay-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bclassic\b/i, label: 'Classic (Black-Champagne)', hints: [{ locus: 'Extension', allele: 'E' }, { locus: 'Champagne', allele: 'Ch' }] },

  { pattern: /varnish roan/i, label: 'Varnish Roan', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  { pattern: /\bchampagne\b/i, label: 'Champagne', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\broan\b/i, label: 'Roan', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\btovero\b/i, label: 'Tovero (Tobiano + Overo)', hints: [{ locus: 'KIT', allele: 'TO' }, { locus: 'Overo', allele: 'O' }] },
  // allele-Schreibweise ("TO"/"SB", komplett grossgeschrieben) MUSS exakt
  // den echten Rohwerten der getesteten Loci entsprechen (siehe
  // COLOR_WISH_OPTIONS in ../../js/verpaarung.js) - vorher stand hier
  // faelschlich "To"/"Sb" (nur Anfangsbuchstabe gross), das in dieser
  // Datei zwar nur die Anzeige betraf (der Bot filtert nicht danach),
  // aber inkonsistent zum Hauptrepo war.
  { pattern: /\btobiano\b/i, label: 'Tobiano', hints: [{ locus: 'KIT', allele: 'TO' }] },
  { pattern: /\bsabino\b/i, label: 'Sabino', hints: [{ locus: 'KIT', allele: 'SB' }] },
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
  { pattern: /\b(leopard|fewspot|blanket|snowcap|appaloosa)\b/i, label: 'Leopard-Musterung', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },

  { pattern: /\bSPLSPL\b/i, label: 'Splashed White homozygot (Kuerzel)', hints: [{ locus: 'Splashed', allele: 'SPLSPL' }] },
  { pattern: /\bSBSB\b/i, label: 'Sabino homozygot (Kuerzel)', hints: [{ locus: 'KIT', allele: 'SBSB' }] },
  { pattern: /\bTOTO\b/i, label: 'Tobiano homozygot (Kuerzel)', hints: [{ locus: 'KIT', allele: 'TOTO' }] },
  { pattern: /\bRNRN\b/i, label: 'Roan homozygot (Kuerzel)', hints: [{ locus: 'KIT', allele: 'RnRn' }] },
  { pattern: /\bCHCH\b/i, label: 'Champagne homozygot (Kuerzel)', hints: [{ locus: 'Champagne', allele: 'ChCh' }] },
  { pattern: /\bCRCR\b/i, label: 'Cream homozygot (Kuerzel)', hints: [{ locus: 'Cream', allele: 'CrCr' }] },
  { pattern: /\bLPLP\b/i, label: 'Appaloosa homozygot (Kuerzel)', hints: [{ locus: 'Appaloosa', allele: 'LpLp' }] },
  { pattern: /\bSTYSTY\b/i, label: 'Sooty homozygot (Kuerzel)', hints: [{ locus: 'Sooty', allele: 'stysty' }] },
  { pattern: /\bRCRC\b/i, label: 'Rabicano homozygot (Kuerzel)', hints: [{ locus: 'Rabicano', allele: 'rcrc' }] },

  { pattern: /\bSPL\b/i, label: 'Splashed White (Kuerzel)', hints: [{ locus: 'Splashed', allele: 'SPL' }] },
  { pattern: /\bSB\b/i, label: 'Sabino (Kuerzel)', hints: [{ locus: 'KIT', allele: 'SB' }] },
  { pattern: /\bTO\b/i, label: 'Tobiano (Kuerzel)', hints: [{ locus: 'KIT', allele: 'TO' }] },
  { pattern: /\bRn\b/i, label: 'Roan (Kuerzel)', hints: [{ locus: 'KIT', allele: 'Rn' }] },
  { pattern: /\bCh\b/i, label: 'Champagne (Kuerzel)', hints: [{ locus: 'Champagne', allele: 'Ch' }] },
  { pattern: /\bCr\b/i, label: 'Cream (Kuerzel)', hints: [{ locus: 'Cream', allele: 'Cr' }] },
  { pattern: /\bLp\b/i, label: 'Appaloosa (Kuerzel)', hints: [{ locus: 'Appaloosa', allele: 'Lp' }] },
  { pattern: /\bO\b/, label: 'Overo (Kuerzel)', hints: [{ locus: 'Overo', allele: 'O' }] },
  { pattern: /\bplpl\b/i, label: 'Pearl (Kuerzel)', hints: [{ locus: 'Cream', allele: 'plpl' }] },
  { pattern: /\bpl\b/i, label: 'Pearl (Kuerzel)', hints: [{ locus: 'Cream', allele: 'pl' }] },
  { pattern: /\bflfl\b/i, label: 'Flaxen (Kuerzel)', hints: [{ locus: 'Flaxen', allele: 'flfl' }] },
  { pattern: /\bfl\b/i, label: 'Flaxen (Kuerzel)', hints: [{ locus: 'Flaxen', allele: 'fl' }] },
  { pattern: /\bsty\b/i, label: 'Sooty (Kuerzel)', hints: [{ locus: 'Sooty', allele: 'sty' }] },
  { pattern: /\brc\b/i, label: 'Rabicano (Kuerzel)', hints: [{ locus: 'Rabicano', allele: 'rc' }] },
];

// "parentMightHavePearl" (siehe parentsMightHavePearl weiter unten, 1:1 aus
// ../../js/parser.js) stuft bei als "ambiguousCream" markierten Eintraegen
// (Cremello/Perlino/Smoky Cream/...) das abgeleitete "CrCr" auf das
// vorsichtigere "Cr" herunter, falls ein Elternteil nachweislich pl traegt -
// sonst zeigt der Bot faelschlich "doppelt Cr" fuer ein Pferd, das in
// Wirklichkeit Cr+pl ist (Bugreport "4Leafs Celestial Benjiro": Vater
// reinerbig Pearl, Fohlen dadurch zwingend Cr+pl statt CrCr). Der Bot hat
// dafuer KEINE eigene Zusatzabfrage noetig - /mdrdb pferd laedt Vater/Mutter
// (per select('*'), siehe horses.js/index.js) ohnehin schon fuer das
// "Eltern"-Feld, computeParentGeneticHints() wertet dieselben Datensaetze
// nur zusaetzlich aus.
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

// Manuelle Gen-Bestaetigung je Locus (color_gene_overrides) - 1:1 aus
// ../../js/parser.js (LOCUS_PRIMARY_ALLELE/LOCUS_MULTI_ALLELES/
// localeOfOverrideKey), siehe dort fuer Details zum Klick-Zyklus in der
// Weboberflaeche. Wird hier nur GELESEN (nie vom Bot gesetzt).
const LOCUS_PRIMARY_ALLELE = {
  Extension: 'E', Dun: 'D', Champagne: 'Ch', Grey: 'G', Silver: 'Z',
  Overo: 'O', Splashed: 'SPL', Appaloosa: 'Lp', PATN1: 'P1',
  Flaxen: 'fl',
};
const LOCUS_MULTI_ALLELES = {
  KIT: ['To', 'Sb', 'Rn'],
  Agouti: ['A1', 'At', 'Ap'],
  Cream: ['Cr', 'pl'],
};
function localeOfOverrideKey(key) {
  return key.split(':')[0];
}

// Isst ein Allel-Anzeigewert reinerbig/doppelt (z.B. "DD", "plpl")? 1:1 aus
// ../../js/parser.js - wird fuer parentHomozygousLoci gebraucht (garantierte
// Vererbung eines reinerbigen Elternteils).
function isDoubledAllele(alleleStr) {
  if (!alleleStr) return false;
  const half = alleleStr.length / 2;
  if (!Number.isInteger(half) || half < 1) return false;
  return alleleStr.slice(0, half) === alleleStr.slice(half);
}
function halveDoubledAllele(alleleStr) {
  return alleleStr.slice(0, alleleStr.length / 2);
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

// Liefert {locus, alleles, source}[] - "getestet" (aus colorRows), "manuell"
// (aus color_gene_overrides) und "abgeleitet"/"elternteil" (aus Fellfarbe/
// Notiz/Name bzw. Eltern-Hinweisen). 1:1 aus ../../js/parser.js (Reihenfolge
// der Parameter bewusst identisch gehalten, um beide Dateien synchron
// vergleichen zu koennen) - anders als der Pferdename wird hier NICHT nach
// Farbwoertern durchsucht (siehe parser.js-Kommentar zum Bugreport "Sir
// Classic"/"Pearl Mirrow"), horseName bleibt aber als Parameter fuer
// bestehende Aufrufer erhalten.
function presentGenesSummary(colorRows, coatColorName, notes, horseName, parentHints, overrides, parentMightHavePearl) {
  const rows = colorRows || [];
  const confirmed = [];
  const testedLoci = new Set();
  const ov = overrides || {};

  for (const r of rows) {
    if (isUntestedLocusValue(r.value)) continue;
    testedLoci.add(r.label);
    const alleles = extractPresentAlleles(r.value);
    if (alleles) confirmed.push({ locus: r.label, alleles, source: 'getestet' });
  }

  const overriddenKeys = new Set(Object.keys(ov).filter((k) => ov[k] && !testedLoci.has(localeOfOverrideKey(k))));
  const manual = [];
  for (const key of overriddenKeys) {
    const state = ov[key];
    const locus = localeOfOverrideKey(key);
    const primary = key.includes(':') ? key.split(':')[1] : LOCUS_PRIMARY_ALLELE[key];
    if (!primary || state === 'absent') continue;
    const alleleCode = state === 'hom' ? primary + primary : primary;
    manual.push({ locus, alleles: alleleCode, source: 'manuell' });
  }

  const hints = [
    ...inferGeneticHintsFromPhenotype(coatColorName, parentMightHavePearl).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...inferGeneticHintsFromPhenotype(notes, parentMightHavePearl).map((h) => ({ ...h, source: 'abgeleitet' })),
    ...(parentHints || []).map((h) => ({ locus: h.locus, allele: h.alleles, source: 'elternteil' })),
  ];
  const seen = new Set();
  const inferred = [];
  for (const h of hints) {
    if (testedLoci.has(h.locus)) continue;
    const multiAlleles = LOCUS_MULTI_ALLELES[h.locus];
    const primaryAllele = multiAlleles ? multiAlleles.find((a) => h.allele.startsWith(a)) : null;
    const hKey = multiAlleles ? `${h.locus}:${primaryAllele || h.allele}` : h.locus;
    if (overriddenKeys.has(hKey)) continue;
    const key = h.locus + h.allele;
    if (seen.has(key)) continue;
    seen.add(key);
    inferred.push({ locus: h.locus, alleles: h.allele, source: h.source });
  }

  return sortGenesForDisplay([...confirmed, ...manual, ...inferred]);
}

// Reinerbig vorhandene Loci eines Elternteils (getestet ODER abgeleitet,
// z.B. aus "Cremello" im Namen) - ein reinerbiger Elternteil vererbt sein
// Allel garantiert. 1:1 aus ../../js/parser.js (parentHomozygousLoci).
function parentHomozygousLoci(parent) {
  const genes = presentGenesSummary(parent.colors, parent.coat_color, parent.notes, parent.name, null, parent.color_gene_overrides);
  const map = {};
  for (const g of genes) {
    if (isDoubledAllele(g.alleles)) map[g.locus] = halveDoubledAllele(g.alleles);
  }
  return map;
}

// 1:1 aus ../../js/parser.js (parentColorHints) - garantiert vererbte Loci
// beider Eltern zusammenfassen (reinerbig bei BEIDEN Eltern -> selbst
// reinerbig garantiert, sonst mindestens mischerbig).
function parentColorHints(parents) {
  const perParent = parents.map(parentHomozygousLoci);
  const loci = new Set();
  perParent.forEach((m) => Object.keys(m).forEach((l) => loci.add(l)));

  const hints = [];
  for (const locus of loci) {
    const values = perParent.map((m) => m[locus]).filter(Boolean);
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 1 && values.length >= 2) {
      hints.push({ locus, alleles: uniqueValues[0] + uniqueValues[0] });
    } else {
      for (const v of uniqueValues) hints.push({ locus, alleles: v });
    }
  }
  return hints;
}

// 1:1 aus ../../js/parser.js (pintoPatternsFromColors/PINTO_ALLELE_LOCUS/
// pintoParentHints) - "Pinto" heisst mindestens 2 der 4 Scheckungs-Muster
// gleichzeitig; stehen bei den Eltern zusammen genau 2 davon getestet
// vorhanden, muss ein als "Pinto" bezeichnetes Fohlen genau diese geerbt
// haben.
function pintoPatternsFromColors(colorRows) {
  const found = new Set();
  for (const r of colorRows || []) {
    if (isUntestedLocusValue(r.value)) continue;
    const present = extractPresentAlleles(r.value);
    if (!present) continue;
    if (r.label === 'Splashed') found.add('SPL');
    else if (r.label === 'Overo') found.add('O');
    else if (r.label === 'KIT') {
      if (present.includes('TO')) found.add('TO');
      if (present.includes('SB')) found.add('SB');
    }
  }
  return found;
}
const PINTO_ALLELE_LOCUS = { SPL: 'Splashed', O: 'Overo', TO: 'KIT', SB: 'KIT' };
function pintoParentHints(parents, coatColorName, notes, horseName) {
  const isPinto = /\bpinto\b/i.test(`${coatColorName || ''} ${notes || ''}`);
  if (!isPinto) return [];

  const combined = new Set();
  for (const parent of parents) {
    for (const p of pintoPatternsFromColors(parent.colors)) combined.add(p);
  }
  if (combined.size !== 2) return [];

  return [...combined].map((allele) => ({ locus: PINTO_ALLELE_LOCUS[allele], alleles: allele }));
}

// 1:1 aus ../../js/parser.js (parentsMightHavePearl) - ob mindestens ein
// Elternteil nachweislich (getestet oder abgeleitet) ein pl-Allel zeigt.
// Genau das entscheidet, ob ein "ambiguousCream"-Phaenotyp (Cremello/
// Perlino/Smoky Cream/...) beim Fohlen tatsaechlich Cr+pl statt CrCr sein
// koennte (siehe inferGeneticHintsFromPhenotype).
function parentsMightHavePearl(parents) {
  return parents.some((p) => {
    const entry = (p.colors || []).find((c) => c.label === 'Cream');
    if (entry && !isUntestedLocusValue(entry.value) && /pl/i.test(entry.value)) return true;
    const genes = presentGenesSummary(p.colors, p.coat_color, p.notes, p.name, null, p.color_gene_overrides);
    return genes.some((g) => g.locus === 'Cream' && /pl/i.test(g.alleles));
  });
}

// Bequemlichkeits-Wrapper fuer den Bot: anders als fetchParentColorHints in
// ../../js/horseForm.js macht dieser KEINE eigene DB-Abfrage - /mdrdb pferd
// hat Vater/Mutter (per select('*'), siehe horses.js/index.js) zu diesem
// Zeitpunkt bereits geladen (fuers "Eltern"-Feld), diese Datensaetze werden
// hier nur zusaetzlich wiederverwendet. "parents" ist ein Array bereits
// geladener Pferde-Zeilen (leere Eintraege/nicht in der DB gefundene Eltern
// vorher herausfiltern).
function computeParentGeneticHints(parents, coatColorName, notes, horseName) {
  if (!parents.length) return { hints: [], parentMightHavePearl: false };
  return {
    hints: [
      ...parentColorHints(parents),
      ...pintoParentHints(parents, coatColorName, notes, horseName),
    ],
    parentMightHavePearl: parentsMightHavePearl(parents),
  };
}

module.exports = { presentGenesSummary, computeParentGeneticHints };
