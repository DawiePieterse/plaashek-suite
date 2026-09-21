/**
 * Copy for the panels both office tools draw. Each app keeps its own copy
 * file for the bits only it has (its title, its login, its device screen);
 * anything that appears in both tools is worded once, here, so the Farm
 * Admin Tool and the Owner Module never say the same thing two ways.
 *
 * Plan §6: English in the database, the farm's language on screen.
 */
export type Lang = "af" | "en";

const af = {
  loading: "Laai…",
  offline: "Kan nie aan die bediener koppel nie.",

  farmSettings: "Plaasinstellings",
  farmLabel: "Plaas",
  languageLabel: "Taal",
  languageName: { af: "Afrikaans", en: "Engels" } as Record<Lang, string>,
  licensedModules: "Programme aan",
  noLicence: "Die plaas het nog geen aktiewe lisensie nie. Kontak Plaashek.",
  heldWaiting: (count: number) => `Lisensie het verval — ${count} opname(s) wag. Praat met Plaashek.`,
  withoutSeason: (count: number) => `${count} opname(s) sonder seisoen.`,

  seasonsHeading: "Seisoene",
  seasonName: "Naam",
  startsOn: "Begin",
  endsOn: "Einde",
  activeSeason: "Aktief",
  saveSeason: "Stoor",
  addSeason: "Voeg seisoen by",
  noSeasons: "Nog geen seisoen nie. Opnames word gemerk vir die kantoor totdat daar een is.",
  noActiveSeason: "Geen aktiewe seisoen nie. Stel een op onder Plaasinstellings.",

  harvestHeading: "Oes",
  noHarvest: "Nog geen oes gevang vir hierdie seisoen nie.",
  block: "Blok",
  crates: "Kratte",
  kg: "kg",

  attendanceHeading: "Span",
  noAttendance: "Nog geen klokke vir hierdie seisoen nie.",
  person: "Werker",
  days: "Dae",
  hours: "Ure",
  open: "Oop",
  openNote: "\"Oop\" is 'n inklok sonder uitklok (of andersom) — die ure tel eers wanneer die paar volledig is.",

  stockHeading: "Voorraad",
  noStockItems: "Nog geen voorraaditems nie.",
  item: "Item",
  unit: "Eenheid",
  onHand: "Op hand",

  waterHeading: "Water",
  noWaterPoints: "Nog geen waterpunte nie.",
  point: "Punt",
  latestReading: "Jongste lesing",
  noReadingYet: "nog geen lesing nie",
  delta: "Verskil",

  werkswinkelHeading: "Werkswinkel",
  noOpenJobs: "Geen oop werkkaarte nie.",
  asset: "Bate",
  jobDescription: "Beskrywing",
  noDescription: "geen beskrywing nie",
  openedAt: "Oopgemaak",

  payoutHeading: "Uitbetaling",
  payoutPeriod: (season: string, from: string, to: string) => `${season} · ${from} tot ${to}`,
  noPiecework: "Nog geen kratte aan 'n werker gekoppel nie.",
  rand: "Rand",
  unattributed: (crates: number, kg: number) =>
    `${crates} krat(te) (${kg.toFixed(1)} kg) is nog aan niemand gekoppel nie — die kaart is nie herken nie. Kyk na die kaarte.`,
  payoutDisclaimer:
    "Hierdie bedrag is wat die plaas se eie tarief uitwerk. Plaashek betaal niemand nie en toets nie of dit die minimumloon haal nie — daar is geen ure vir seisoenwerkers nie.",

  kuddeHeading: "Kudde",
  noAnimalsRegistered: "Nog geen diere geregistreer nie.",
  camp: "Kamp",
  headcount: "Getal",
  unplacedAnimals: (count: number) => `${count} dier(e) nog nie na 'n kamp geskuif nie.`,
  treatmentsHeading: "Behandelings",
  noTreatments: "Nog geen behandelings vir hierdie seisoen nie.",
  animalTag: "Oormerk",
  treatmentType: "Tipe",
  dose: "Dosis",
  weightsHeading: "Gewigte",
  noWeights: "Nog geen gewigte vir hierdie seisoen nie.",
  weightKg: "Gewig (kg)",

  total: "Totaal",

  exportHeading: "Uitvoer",
  exportNotes: "Voer veldnotas uit (CSV)",
  exportHarvest: "Voer oes uit (CSV)",
  exportAttendance: "Voer span uit (CSV)",
  exportStock: "Voer voorraad uit (CSV)",
  exportWater: "Voer water uit (CSV)",
  exportWorkOrders: "Voer werkkaarte uit (CSV)",
  exportFuel: "Voer brandstof uit (CSV)",
  exportPiecework: "Voer stukwerk uit (CSV)",
  exportAnimals: "Voer diere uit (CSV)",
  exportMovements: "Voer bewegings uit (CSV)",
  exportTreatments: "Voer behandelings uit (CSV)",
  exportWeights: "Voer gewigte uit (CSV)",
};

const en: typeof af = {
  loading: "Loading…",
  offline: "Cannot reach the server.",

  farmSettings: "Farm settings",
  farmLabel: "Farm",
  languageLabel: "Language",
  languageName: { af: "Afrikaans", en: "English" },
  licensedModules: "Apps switched on",
  noLicence: "This farm has no active licence yet. Contact Plaashek.",
  heldWaiting: (count: number) => `Licence has lapsed — ${count} capture(s) waiting. Talk to Plaashek.`,
  withoutSeason: (count: number) => `${count} capture(s) with no season.`,

  seasonsHeading: "Seasons",
  seasonName: "Name",
  startsOn: "Starts",
  endsOn: "Ends",
  activeSeason: "Active",
  saveSeason: "Save",
  addSeason: "Add season",
  noSeasons: "No season yet. Captures are flagged for the office until there is one.",
  noActiveSeason: "No active season. Set one up under Farm settings.",

  harvestHeading: "Harvest",
  noHarvest: "No harvest captured for this season yet.",
  block: "Block",
  crates: "Crates",
  kg: "kg",

  attendanceHeading: "Attendance",
  noAttendance: "No punches for this season yet.",
  person: "Worker",
  days: "Days",
  hours: "Hours",
  open: "Open",
  openNote: '"Open" is a clock-in with no clock-out (or the other way round) — hours only count once the pair is complete.',

  stockHeading: "Stock",
  noStockItems: "No stock items yet.",
  item: "Item",
  unit: "Unit",
  onHand: "On hand",

  waterHeading: "Water",
  noWaterPoints: "No water points yet.",
  point: "Point",
  latestReading: "Latest reading",
  noReadingYet: "no reading yet",
  delta: "Delta",

  werkswinkelHeading: "Workshop",
  noOpenJobs: "No open jobs.",
  asset: "Asset",
  jobDescription: "Description",
  noDescription: "no description",
  openedAt: "Opened",

  payoutHeading: "Payout",
  payoutPeriod: (season: string, from: string, to: string) => `${season} · ${from} to ${to}`,
  noPiecework: "No crates tied to a worker yet.",
  rand: "Rand",
  unattributed: (crates: number, kg: number) =>
    `${crates} crate(s) (${kg.toFixed(1)} kg) are not tied to anyone — the card was not recognised. Check the cards.`,
  payoutDisclaimer:
    "This is what the farm's own rate works out to. Plaashek pays nobody and does not check it against the minimum wage — there are no hours for seasonal workers.",

  kuddeHeading: "Kudde",
  noAnimalsRegistered: "No animals registered yet.",
  camp: "Camp",
  headcount: "Head",
  unplacedAnimals: (count: number) => `${count} animal(s) not yet moved to a camp.`,
  treatmentsHeading: "Treatments",
  noTreatments: "No treatments for this season yet.",
  animalTag: "Tag",
  treatmentType: "Type",
  dose: "Dose",
  weightsHeading: "Weights",
  noWeights: "No weights for this season yet.",
  weightKg: "Weight (kg)",

  total: "Total",

  exportHeading: "Export",
  exportNotes: "Export veldnotas (CSV)",
  exportHarvest: "Export harvest (CSV)",
  exportAttendance: "Export attendance (CSV)",
  exportStock: "Export stock (CSV)",
  exportWater: "Export water (CSV)",
  exportWorkOrders: "Export work orders (CSV)",
  exportFuel: "Export fuel (CSV)",
  exportPiecework: "Export piece-work (CSV)",
  exportAnimals: "Export animals (CSV)",
  exportMovements: "Export movements (CSV)",
  exportTreatments: "Export treatments (CSV)",
  exportWeights: "Export weights (CSV)",
};

export type OfficeCopy = typeof af;

export const officeCopy = (lang: Lang): OfficeCopy => (lang === "en" ? en : af);
