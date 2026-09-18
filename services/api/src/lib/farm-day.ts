/**
 * Which calendar day a timestamp belongs to, from the farm's point of view.
 *
 * Plaashek hosts and sells in one country (plan §10), so the farm's day is
 * SAST. Give `farms` a timezone column the day that stops being true — this
 * is the only place that decides it, and both the attendance rollup and the
 * piece-work payout read it, so a night shift lands on the same day in both.
 */
const FARM_TIME_ZONE = "Africa/Johannesburg";

export const farmDayKey = (at: Date) => at.toLocaleDateString("en-CA", { timeZone: FARM_TIME_ZONE });

/** SAST is UTC+2 year round — no DST, so a farm day's edges are a fixed offset. */
const FARM_UTC_OFFSET = "+02:00";

/** The first and last instant of a farm-local `YYYY-MM-DD`, for bounding a query to whole farm days. */
export const farmDayStart = (day: string) => new Date(`${day}T00:00:00${FARM_UTC_OFFSET}`);
export const farmDayEnd = (day: string) => new Date(`${day}T23:59:59.999${FARM_UTC_OFFSET}`);
