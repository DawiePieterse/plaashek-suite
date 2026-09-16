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

  person: "Persoon",
  choose: "Kies…",
  module: "Program",
  labelOptional: "Naam (opsioneel)",
  labelPlaceholder: "Pakhuis tablet",
  addDevice: "Voeg toestel by en druk QR",

  unnamedDevice: "Toestel sonder naam",
  nobodyAssigned: "Niemand toegewys nie",
  modules: (list: string) => `Programme: ${list}`,
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
  makeActive: "Maak aktief",
  saveSeason: "Stoor",
  addSeason: "Voeg seisoen by",
  noSeasons: "Nog geen seisoen nie. Opnames word gemerk vir die kantoor totdat daar een is.",
  heldWaiting: (count: number) => `Lisensie het verval — ${count} opname(s) wag. Praat met Plaashek.`,
  withoutSeason: (count: number) => `${count} opname(s) sonder seisoen.`,

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

  person: "Person",
  choose: "Choose…",
  module: "App",
  labelOptional: "Name (optional)",
  labelPlaceholder: "Packhouse tablet",
  addDevice: "Add device and print QR",

  unnamedDevice: "Unnamed device",
  nobodyAssigned: "Nobody assigned",
  modules: (list: string) => `Apps: ${list}`,
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
  makeActive: "Make active",
  saveSeason: "Save",
  addSeason: "Add season",
  noSeasons: "No season yet. Captures are flagged for the office until there is one.",
  heldWaiting: (count: number) => `Licence has lapsed — ${count} capture(s) waiting. Talk to Plaashek.`,
  withoutSeason: (count: number) => `${count} capture(s) with no season.`,

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
