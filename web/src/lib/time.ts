/**
 * Timezone helpers that work for any IANA zone (DST-aware), so the org's
 * configured timezone actually drives date math (e.g. the dashboard's
 * "aujourd'hui" boundary) instead of a hardcoded offset.
 */

/** Offset of `timeZone` from UTC, in minutes, at instant `at`. */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = dtf.formatToParts(at).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** UTC instant of the most recent local midnight in `timeZone`. */
export function localMidnightUTC(timeZone: string, now: Date = new Date()): Date {
  const off = tzOffsetMinutes(timeZone, now);
  const local = new Date(now.getTime() + off * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - off * 60_000);
}

/** Local calendar day (YYYY-MM-DD) in `timeZone` for `daysAgo` days back. */
export function dayInTz(timeZone: string, daysAgo = 0, now: Date = new Date()): string {
  const d = new Date(now.getTime() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** UTC instant of the start (local midnight) of the day `daysAgo` back in `timeZone`. */
export function startOfLocalDayUTC(
  timeZone: string,
  daysAgo = 0,
  now: Date = new Date()
): Date {
  const dateStr = dayInTz(timeZone, daysAgo, now);
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const off = tzOffsetMinutes(timeZone, guess);
  return new Date(guess.getTime() - off * 60_000);
}
