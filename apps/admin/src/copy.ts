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

  devicesHeading: "Toestelle",
  noDevices: "Nog geen toestelle nie. Voeg die eerste een by.",
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

  peopleHeading: "Mense",
  noPeople: "Nog geen mense nie. Voeg die eerste een by.",
  personNamePlaceholder: "Petrus",
  addPerson: "Voeg persoon by",

  blocksHeading: "Blokke",
  noBlocks: "Nog geen blokke nie. Voeg die eerste een by.",
  blockNamePlaceholder: "Blok A",
  addBlock: "Voeg blok by",

  campsHeading: "Kampe",
  noCamps: "Nog geen kampe nie. Voeg die eerste een by.",
  campNamePlaceholder: "Kamp 1",
  addCamp: "Voeg kamp by",
  campBlockCol: "Blok",
  noBlockOption: "Geen blok",

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
  workerNumber: "Nommer",
  workerNumberPlaceholder: "bv. 014",
  workerActive: "Aktief",
  workerNamePlaceholder: "Naam van die werker",
  registerWorker: "Registreer en druk kaart",
  saveWorker: "Stoor",
  noWorkers: "Nog geen seisoenwerkers nie.",
  printCard: "Druk kaart",
  yes: "Ja",
  no: "Nee",

  importWorkers: "Voer werkerslys in (CSV)",
  exportWorkers: "Voer werkerslys uit (CSV)",
  importNote:
    "Die lêer se kolomme: worker_number, name, active. Die nommer sê wie elke ry is — 'n nommer wat die plaas al ken word bygewerk, 'n nuwe een word bygevoeg. Niemand word uitgevee nie.",
  imported: (created: number, updated: number) => `${created} bygevoeg, ${updated} bygewerk.`,
  importSkipped: (rows: string) => `Oorgeslaan: ${rows}.`,
  importSkippedRow: (row: number, reason: string) => `ry ${row} (${reason})`,
  importReason: {
    no_number: "geen werkernommer nie",
    no_name: "geen naam nie",
    duplicate_number: "nommer kom twee keer voor in hierdie lêer",
  } as Record<string, string>,


  cardTitle: "Werkerskaart",
  cardWorker: "Werker",
  cardNote: "Skandeer hierdie kaart by die skaal voor die krat geweeg word. Verlore kaart? Die kantoor druk dieselfde nommer weer.",


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
    worker_number_taken: "Daardie nommer is al aan 'n ander werker gegee.",
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

  devicesHeading: "Devices",
  noDevices: "No devices yet. Add the first one.",
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

  peopleHeading: "People",
  noPeople: "No people yet. Add the first one.",
  personNamePlaceholder: "Petrus",
  addPerson: "Add person",

  blocksHeading: "Blocks",
  noBlocks: "No blocks yet. Add the first one.",
  blockNamePlaceholder: "Block A",
  addBlock: "Add block",

  campsHeading: "Camps",
  noCamps: "No camps yet. Add the first one.",
  campNamePlaceholder: "Camp 1",
  addCamp: "Add camp",
  campBlockCol: "Block",
  noBlockOption: "No block",

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
  workerNumber: "Number",
  workerNumberPlaceholder: "e.g. 014",
  workerActive: "Active",
  workerNamePlaceholder: "Worker's name",
  registerWorker: "Register and print card",
  saveWorker: "Save",
  noWorkers: "No seasonal workers yet.",
  printCard: "Print card",
  yes: "Yes",
  no: "No",

  importWorkers: "Import worker list (CSV)",
  exportWorkers: "Export worker list (CSV)",
  importNote:
    "The file's columns: worker_number, name, active. The number says who each row is — a number the farm already knows is updated, a new one is added. Nobody is deleted.",
  imported: (created: number, updated: number) => `${created} added, ${updated} updated.`,
  importSkipped: (rows: string) => `Skipped: ${rows}.`,
  importSkippedRow: (row: number, reason: string) => `row ${row} (${reason})`,
  importReason: {
    no_number: "no worker number",
    no_name: "no name",
    duplicate_number: "number appears twice in this file",
  },


  cardTitle: "Worker card",
  cardWorker: "Worker",
  cardNote: "Scan this card at the scale before the crate is weighed. Lost card? The office prints the same number again.",


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
    worker_number_taken: "Another worker already has that number.",
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
