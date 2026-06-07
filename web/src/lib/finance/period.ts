import { dayInTz, tzOffsetMinutes } from "@/lib/time";

export type PeriodKind = "today" | "week" | "month" | "custom";
export type Granularity = "day" | "week";

export interface Period {
  kind: PeriodKind;
  from: Date;
  to: Date;
  label: string;
  granularity: Granularity;
  /** echoed back for custom inputs (YYYY-MM-DD) */
  fromStr: string;
  toStr: string;
}

/** UTC instant of local midnight for a `YYYY-MM-DD` in `tz`. */
function localMidnightOf(tz: string, dateStr: string): Date {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const off = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - off * 60_000);
}

function endOfLocalDay(tz: string, dateStr: string): Date {
  return new Date(localMidnightOf(tz, dateStr).getTime() + 86_400_000 - 1);
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

/** Resolve a period from URL params, scoped to the org timezone. */
export function resolvePeriod(
  tz: string,
  raw: { period?: string; from?: string; to?: string }
): Period {
  const now = new Date();
  const today = dayInTz(tz, 0, now); // YYYY-MM-DD
  const kind: PeriodKind =
    raw.period === "today" ||
    raw.period === "week" ||
    raw.period === "custom"
      ? raw.period
      : raw.period === "month"
        ? "month"
        : "month";

  let from: Date;
  let to: Date = endOfLocalDay(tz, today);
  let label: string;
  let fromStr = today;
  let toStr = today;

  if (kind === "today") {
    from = localMidnightOf(tz, today);
    label = "Aujourd'hui";
    fromStr = today;
  } else if (kind === "week") {
    fromStr = dayInTz(tz, 6, now);
    from = localMidnightOf(tz, fromStr);
    label = "7 derniers jours";
  } else if (kind === "custom") {
    fromStr = raw.from && /^\d{4}-\d{2}-\d{2}$/.test(raw.from) ? raw.from : today;
    toStr = raw.to && /^\d{4}-\d{2}-\d{2}$/.test(raw.to) ? raw.to : today;
    if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
    from = localMidnightOf(tz, fromStr);
    to = endOfLocalDay(tz, toStr);
    label = `Du ${fromStr} au ${toStr}`;
  } else {
    // month (default): first day of the current local month
    fromStr = `${today.slice(0, 7)}-01`;
    from = localMidnightOf(tz, fromStr);
    label = "Ce mois-ci";
  }

  const granularity: Granularity = daysBetween(from, to) > 62 ? "week" : "day";
  return { kind, from, to, label, granularity, fromStr, toStr };
}
