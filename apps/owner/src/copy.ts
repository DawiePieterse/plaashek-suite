/**
 * Screen copy in the farm's own language (plan §6). The login response
 * carries it, so the screen is right from first render.
 */
export type Lang = "af" | "en";

const LANG_KEY = "plaashek.owner.lang";

const af = {
  appTitle: "Plaashek — Eienaar",
  signOut: "Meld af",

  email: "E-pos",
  password: "Wagwoord",
  signIn: "Meld aan",
  signingIn: "Wag…",
  offline: "Kan nie aan die bediener koppel nie.",
  loading: "Laai…",
  farmSettings: "Plaasinstellings",

  errors: {
    invalid_credentials: "Verkeerde e-pos of wagwoord.",
    unauthenticated: "Jou sessie het verval. Meld weer aan.",
    forbidden: "Jy het nie regte vir hierdie aksie nie.",
    unknown: "Iets het verkeerd geloop. Probeer weer.",
  } as Record<string, string>,
};

const en: typeof af = {
  appTitle: "Plaashek — Owner",
  signOut: "Sign out",

  email: "Email",
  password: "Password",
  signIn: "Sign in",
  signingIn: "Wait…",
  offline: "Cannot reach the server.",
  loading: "Loading…",
  farmSettings: "Farm settings",

  errors: {
    invalid_credentials: "Incorrect email or password.",
    unauthenticated: "Your session expired. Sign in again.",
    forbidden: "You do not have rights for this action.",
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
