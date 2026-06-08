import { dayInTz, tzOffsetMinutes } from "@/lib/time";

/**
 * Reporting periods are richer than the Finance "today/week/month" selector:
 * they carry preset ranges, a chart granularity, and — crucially — an
 * equal-length *previous* window for vs-period deltas. All math is done in the
 * org's IANA timezone so day boundaries line up with the dashboard/finance.
 */
export type ReportPeriodKind =
  | "7d"
  | "30d"
  | "month"
  | "lastMonth"
  | "quarter"
  | "custom";

export type ReportGranularity = "day" | "week" | "month";

export interface DateRange {
  from: Date;
  to: Date;
  fromStr: string; // YYYY-MM-DD (local)
  toStr: string;
}

export interface ReportPeriod extends DateRange {
  kind: ReportPeriodKind;
  label: string;
  granularity: ReportGranularity;
  /** Immediately-preceding window of equal length (for deltas). */
  previous: DateRange;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC instant of local midnight for a `YYYY-MM-DD` in `tz`. */
function localMidnightOf(tz: string, dateStr: string): Date {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const off = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - off * 60_000);
}

/** Last instant (local) of `YYYY-MM-DD` in `tz`. */
function endOfLocalDay(tz: string, dateStr: string): Date {
  return new Date(localMidnightOf(tz, dateStr).getTime() + 86_400_000 - 1);
}

function daysInclusive(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function granularityFor(from: Date, to: Date): ReportGranularity {
  const days = daysInclusive(from, to);
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

/** Last calendar day of (year, month-1-indexed+1). */
function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * Resolve a reporting period from URL params, scoped to the org timezone.
 * The default is the last 30 days.
 */
export function resolveReportPeriod(
  tz: string,
  raw: { period?: string; from?: string; to?: string }
): ReportPeriod {
  const now = new Date();
  const today = dayInTz(tz, 0, now); // YYYY-MM-DD
  const [y, m] = today.split("-").map(Number);

  const kinds: ReportPeriodKind[] = [
    "7d",
    "30d",
    "month",
    "lastMonth",
    "quarter",
    "custom",
  ];
  const kind: ReportPeriodKind = kinds.includes(raw.period as ReportPeriodKind)
    ? (raw.period as ReportPeriodKind)
    : "30d";

  let fromStr = today;
  let toStr = today;
  let label: string;

  if (kind === "7d") {
    fromStr = dayInTz(tz, 6, now);
    label = "7 derniers jours";
  } else if (kind === "30d") {
    fromStr = dayInTz(tz, 29, now);
    label = "30 derniers jours";
  } else if (kind === "month") {
    fromStr = `${y}-${pad(m)}-01`;
    label = "Ce mois-ci";
  } else if (kind === "lastMonth") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    fromStr = `${py}-${pad(pm)}-01`;
    toStr = `${py}-${pad(pm)}-${pad(lastDayOfMonth(py, pm))}`;
    label = "Mois dernier";
  } else if (kind === "quarter") {
    const qStart = m - ((m - 1) % 3); // 1,4,7,10
    fromStr = `${y}-${pad(qStart)}-01`;
    label = "Ce trimestre";
  } else {
    // custom
    const re = /^\d{4}-\d{2}-\d{2}$/;
    fromStr = raw.from && re.test(raw.from) ? raw.from : dayInTz(tz, 29, now);
    toStr = raw.to && re.test(raw.to) ? raw.to : today;
    if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
    label = `Du ${fromStr} au ${toStr}`;
  }

  const from = localMidnightOf(tz, fromStr);
  const to = endOfLocalDay(tz, toStr);

  // Equal-length window ending the instant before `from`.
  const spanMs = to.getTime() - from.getTime() + 1;
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - spanMs);

  return {
    kind,
    from,
    to,
    fromStr,
    toStr,
    label,
    granularity: granularityFor(from, to),
    previous: {
      from: prevFrom,
      to: prevTo,
      fromStr: dayInTz(tz, 0, prevFrom),
      toStr: dayInTz(tz, 0, prevTo),
    },
  };
}
