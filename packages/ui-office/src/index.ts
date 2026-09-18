/**
 * The shared office-side UI. Both farm-facing tools — the Farm Admin Tool
 * and the Owner Module — are the same tab strip over the same panels; what
 * differs is what each one may write (plan §4.2, §4.3). Anything drawn in
 * both lives here so the two tools cannot drift into saying the same thing
 * two ways.
 *
 * The look (`office.css`) is imported separately, by each app's entry point.
 */
export { useOffice, useOfficeLoader } from "./context.js";
export { officeCopy, type Lang } from "./copy.js";
export { OfficeShell, type OfficeShellProps } from "./shell.js";
export type { Asset, Block, Camp, FarmContext } from "./farm-context.js";
export { moduleName } from "./tabs.js";
