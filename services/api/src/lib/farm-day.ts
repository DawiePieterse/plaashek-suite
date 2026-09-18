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
