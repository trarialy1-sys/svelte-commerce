import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-6" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {message ? (
        <p className="max-w-sm text-sm text-muted-foreground text-balance">
          {message}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
