/**
 * Screen copy in the farm's own language (plan §6: English in the database,
 * the farm's language on screen). The farm picks it when it is set up; the
 * login response carries it, so the office screen is right from first render.
 */
export type Lang = "af" | "en";

const LANG_KEY = "plaashek.admin.lang";

const af = {
  appTitle: "Plaashek — Plaaskantoor",
  signOut: "Meld af",

  email: "E-pos",
  password: "Wagwoord",
  signIn: "Meld aan",
  signingIn: "Wag…",

  offline: "Kan nie aan die bediener koppel nie.",
  loading: "Laai…",

  devicesHeading: (farm: string) => `Toestelle — ${farm}`,
  noDevices: "Nog geen toestelle nie. Voeg die eerste een by.",
  noLicence: "Die plaas het nog geen aktiewe lisensie nie. Kontak Plaashek.",
  deviceCol: "Toestel",
  pendingCol: "Wagtend",
  actionsCol: "Aksies",

  person: "Persoon",
  choose: "Kies…",
  module: "Program",
  labelOptional: "Naam (opsioneel)",
  labelPlaceholder: "Pakhuis tablet",
  addDevice: "Voeg toestel by en druk QR",

  unnamedDevice: "Toestel sonder naam",
  nobodyAssigned: "Niemand toegewys nie",
  modulesNone: "nog geen — wag vir die eerste skandering",
  pendingPairing: (module: string, printed: string, expires: string) =>
    `Wag vir paring: ${module} — gedruk ${printed}, verval ${expires}`,

  reprint: "Herdruk",
  cancel: "Kanselleer",
  revoke: "Herroep",
  revokeConfirm: "Herroep hierdie toestel? Alle programme gaan dood by die volgende sync.",
  addApp: "Voeg program by…",
  printQr: "Druk QR",

  seasonsHeading: "Seisoene",
  seasonName: "Naam",
  startsOn: "Begin",
  endsOn: "Einde",
  activeSeason: "Aktief",
  saveSeason: "Stoor",
  addSeason: "Voeg seisoen by",
  noSeasons: "Nog geen seisoen nie. Opnames word gemerk vir die kantoor totdat daar een is.",
  heldWaiting: (count: number) => `Lisensie het verval — ${count} opname(s) wag. Praat met Plaashek.`,
  withoutSeason: (count: number) => `${count} opname(s) sonder seisoen.`,

  pieceworkHeading: "Stukwerk — seisoenwerkers",
  rateHeading: "Tarief",
  noRate: "Nog geen tarief nie. Sonder 'n tarief tel die kilogramme, maar die rande bly leeg.",
  rateFlat: (base: string, from: string) => `R${base}/kg vanaf ${from}.`,
  rateTiered: (base: string, target: number, bonus: string, from: string) =>
    `R${base}/kg tot ${target} kg per dag, daarna R${bonus}/kg — vanaf ${from}.`,
  effectiveFrom: "Geldig vanaf",
  baseRate: "Basistarief (R/kg)",
  targetKgLabel: "Dagteiken (kg)",
  bonusRate: "Bonustarief (R/kg)",
  saveRate: "Stoor tarief",

  workersHeading: "Werkers",
  worker: "Werker",
  workerNamePlaceholder: "Naam van die werker",
  registerWorker: "Registreer en druk kaart",
  cardCode: "Kaartkode",
  noCard: "geen kaart",
  noWorkers: "Nog geen seisoenwerkers nie.",
  printCard: "Druk kaart",
  reissueCard: "Nuwe kaart",
  revokeCard: "Herroep kaart",

  payoutHeading: "Uitbetaling",
  payoutPeriod: (season: string, from: string, to: string) => `${season} · ${from} tot ${to}`,
  noPiecework: "Nog geen kratte aan 'n werker gekoppel nie.",
  noSeason: "Geen aktiewe seisoen nie.",
  days: "Dae",
  kg: "kg",
  rand: "Rand",
  total: "Totaal",
  unattributed: (crates: number, kg: number) =>
    `${crates} krat(te) (${kg.toFixed(1)} kg) is nog aan niemand gekoppel nie — die kaart is nie herken nie. Kyk na die kaarte.`,
  payoutDisclaimer:
    "Hierdie bedrag is wat die plaas se eie tarief uitwerk. Plaashek betaal niemand nie en toets nie of dit die minimumloon haal nie — daar is geen ure vir seisoenwerkers nie.",

  cardTitle: "Werkerskaart",
  cardWorker: "Werker",
  cardNote: "Skandeer hierdie kaart by die skaal voor die krat geweeg word. Verlore kaart? Die kantoor druk 'n nuwe een.",

  exportHeading: "Uitvoer",
  exportNotes: "Voer veldnotas uit (CSV)",
  exportHarvest: "Voer oes uit (CSV)",
  exportAttendance: "Voer span uit (CSV)",
  exportPiecework: "Voer stukwerk uit (CSV)",

  slipTitle: "Paringstrokie",
  slipFarm: "Plaas",
  slipPerson: "Persoon",
  slipModule: "Program",
  slipPrinted: "Gedruk",
  slipExpires: "Verval",
  qrLoading: "QR laai…",
  slipNote: "Skandeer hierdie QR met die foon, by die kantoor waar daar sein is. Een keer geldig.",
  print: "Druk",
  close: "Toemaak",

  /** Server messages are English; these are the Afrikaans equivalents by error code. */
  errors: {
    invalid_credentials: "Verkeerde e-pos of wagwoord.",
    unauthenticated: "Jou sessie het verval. Meld weer aan.",
    forbidden: "Jy het nie regte vir hierdie aksie nie.",
    not_licensed: "Die plaas het nie 'n lisensie vir hierdie program nie.",
    not_found: "Nie gevind nie.",
    token_used: "Hierdie strokie is reeds geskandeer.",
    token_cancelled: "Hierdie strokie is gekanselleer.",
    token_expired: "Hierdie strokie het verval. Druk 'n nuwe een.",
    unknown: "Iets het verkeerd geloop. Probeer weer.",
  } as Record<string, string>,
};

const en: typeof af = {
  appTitle: "Plaashek — Farm office",
  signOut: "Sign out",

  email: "Email",
  password: "Password",
  signIn: "Sign in",
  signingIn: "Wait…",

  offline: "Cannot reach the server.",
  loading: "Loading…",

  devicesHeading: (farm: string) => `Devices — ${farm}`,
  noDevices: "No devices yet. Add the first one.",
  noLicence: "This farm has no active licence yet. Contact Plaashek.",
  deviceCol: "Device",
  pendingCol: "Pending",
  actionsCol: "Actions",

  person: "Person",
  choose: "Choose…",
  module: "App",
  labelOptional: "Name (optional)",
  labelPlaceholder: "Packhouse tablet",
  addDevice: "Add device and print QR",

  unnamedDevice: "Unnamed device",
  nobodyAssigned: "Nobody assigned",
  modulesNone: "none yet — waiting for the first scan",
  pendingPairing: (module: string, printed: string, expires: string) =>
    `Waiting to pair: ${module} — printed ${printed}, expires ${expires}`,

  reprint: "Reprint",
  cancel: "Cancel",
  revoke: "Revoke",
  revokeConfirm: "Revoke this device? Every app on it dies at the next sync.",
  addApp: "Add an app…",
  printQr: "Print QR",

  seasonsHeading: "Seasons",
  seasonName: "Name",
  startsOn: "Starts",
  endsOn: "Ends",
  activeSeason: "Active",
  saveSeason: "Save",
  addSeason: "Add season",
  noSeasons: "No season yet. Captures are flagged for the office until there is one.",
  heldWaiting: (count: number) => `Licence has lapsed — ${count} capture(s) waiting. Talk to Plaashek.`,
  withoutSeason: (count: number) => `${count} capture(s) with no season.`,

  pieceworkHeading: "Piece-work — seasonal workers",
  rateHeading: "Rate",
  noRate: "No rate yet. Without one the kilograms still count, but the rand stay empty.",
  rateFlat: (base: string, from: string) => `R${base}/kg from ${from}.`,
  rateTiered: (base: string, target: number, bonus: string, from: string) =>
    `R${base}/kg up to ${target} kg a day, then R${bonus}/kg — from ${from}.`,
  effectiveFrom: "Effective from",
  baseRate: "Base rate (R/kg)",
  targetKgLabel: "Daily target (kg)",
  bonusRate: "Bonus rate (R/kg)",
  saveRate: "Save rate",

  workersHeading: "Workers",
  worker: "Worker",
  workerNamePlaceholder: "Worker's name",
  registerWorker: "Register and print card",
  cardCode: "Card code",
  noCard: "no card",
  noWorkers: "No seasonal workers yet.",
  printCard: "Print card",
  reissueCard: "New card",
  revokeCard: "Revoke card",

  payoutHeading: "Payout",
  payoutPeriod: (season: string, from: string, to: string) => `${season} · ${from} to ${to}`,
  noPiecework: "No crates tied to a worker yet.",
  noSeason: "No active season.",
  days: "Days",
  kg: "kg",
  rand: "Rand",
  total: "Total",
  unattributed: (crates: number, kg: number) =>
    `${crates} crate(s) (${kg.toFixed(1)} kg) are not tied to anyone — the card was not recognised. Check the cards.`,
  payoutDisclaimer:
    "This is what the farm's own rate works out to. Plaashek pays nobody and does not check it against the minimum wage — there are no hours for seasonal workers.",

  cardTitle: "Worker card",
  cardWorker: "Worker",
  cardNote: "Scan this card at the scale before the crate is weighed. Lost card? The office prints a new one.",

  exportHeading: "Export",
  exportNotes: "Export veldnotas (CSV)",
  exportHarvest: "Export harvest (CSV)",
  exportAttendance: "Export attendance (CSV)",
  exportPiecework: "Export piece-work (CSV)",

  slipTitle: "Pairing slip",
  slipFarm: "Farm",
  slipPerson: "Person",
  slipModule: "App",
  slipPrinted: "Printed",
  slipExpires: "Expires",
  qrLoading: "Loading QR…",
  slipNote: "Scan this QR with the phone, at the office where there is signal. Valid once.",
  print: "Print",
  close: "Close",

  errors: {
    invalid_credentials: "Incorrect email or password.",
    unauthenticated: "Your session expired. Sign in again.",
    forbidden: "You do not have rights for this action.",
    not_licensed: "This farm is not licensed for that app.",
    not_found: "Not found.",
    token_used: "This slip has already been scanned.",
    token_cancelled: "This slip was cancelled.",
    token_expired: "This slip expired. Print a new one.",
    unknown: "Something went wrong. Try again.",
  },
};

const DICT = { af, en };

let lang: Lang = localStorage.getItem(LANG_KEY) === "en" ? "en" : "af";

export function setLang(next: Lang) {
  lang = next;
  localStorage.setItem(LANG_KEY, next);
}

export const t = () => DICT[lang];

export const locale = () => (lang === "af" ? "af-ZA" : "en-ZA");
