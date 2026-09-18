/**
 * What `/farm` answers: everything both office tools need before they can
 * draw anything — which farm, its people, which modules Plaashek Management
 * has switched on, and what the office has to act on.
 *
 * Its own module so the context and the panel that renders it can both name
 * the type without importing each other.
 */
export interface FarmContext {
  farm: { id: string; name: string };
  people: { id: string; name: string }[];
  modules: string[];
  waiting: { held: number; withoutSeason: number };
}
