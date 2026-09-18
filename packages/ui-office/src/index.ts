/**
 * The shared office-side UI. Both farm-facing tools — the Farm Admin Tool
 * and the Owner Module — are the same tab strip over the same panels; what
 * differs is what each one may write (plan §4.2, §4.3). Anything drawn in
 * both lives here so the two tools cannot drift into saying the same thing
 * two ways.
 *
 * The look (`office.css`) is imported separately, by each app's entry point.
 */
export { OfficeProvider, useOffice, useOfficeLoader, type OfficeContextValue, type OfficeSession } from "./context.js";
export { officeCopy, type Lang, type OfficeCopy } from "./copy.js";
export { FARM_SETTINGS_TAB, MODULE_TABS, moduleName, officeTabs, TabPanel, Tabs, useActiveTab, type Tab } from "./tabs.js";
export { Exports, type ExportKind } from "./panels/exports.js";
export { FarmSummary, type FarmContext } from "./panels/farm-summary.js";
export { AttendanceRollup, HarvestRollup, PieceworkPayout, type AttendanceSummary, type HarvestSummary, type PayoutSummary } from "./panels/rollups.js";
export { Seasons } from "./panels/seasons.js";
