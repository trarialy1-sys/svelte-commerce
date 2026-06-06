import * as React from "react";

import { cn } from "@/lib/utils";

type StatusTone = "green" | "amber" | "blue" | "violet" | "red" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  green: "bg-green-soft text-green",
  amber: "bg-amber-soft text-amber",
  blue: "bg-blue-soft text-blue",
  violet: "bg-violet-soft text-violet",
  red: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Maps a domain status string to a semantic tone. Tools (later chunks) extend
 * this map; defaults to neutral for unknown statuses.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  // order statuses
  NOUVELLE: "blue",
  CONFIRMEE: "green",
  ANNULEE: "red",
  REPORTEE: "amber",
  PAS_DE_REPONSE: "amber",
  INJOIGNABLE: "amber",
  NUMERO_ERRONE: "red",
  DOUBLON: "violet",
  HORS_ZONE: "neutral",
  // parcel statuses
  CREE: "blue",
  RAMASSE: "violet",
  EN_TRANSIT: "amber",
  LIVRE: "green",
  RETOURNE: "red",
  REFUSE: "red",
  // generic
  active: "green",
  connected: "green",
  disconnected: "neutral",
  DRAFT: "amber",
  SAVED: "green",
};

interface StatusBadgeProps {
  status: string;
  /** Override the auto-derived tone. */
  tone?: StatusTone;
  /** Human label; defaults to the status string. */
  label?: string;
  className?: string;
}

export function StatusBadge({
  status,
  tone,
  label,
  className,
}: StatusBadgeProps) {
  const resolved = tone ?? STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[resolved],
        className
      )}
    >
      {label ?? status}
    </span>
  );
}
