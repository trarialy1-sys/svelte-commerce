import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** e.g. "+12%" — colored by sign. */
  delta?: string;
  deltaDirection?: "up" | "down" | "neutral";
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaDirection = "neutral",
  className,
}: StatCardProps) {
  return (
    <Card className={cn("gap-3 p-5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "font-mono text-xs font-medium",
              deltaDirection === "up" && "text-green",
              deltaDirection === "down" && "text-destructive",
              deltaDirection === "neutral" && "text-muted-foreground"
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
