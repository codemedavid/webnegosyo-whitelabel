"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered"] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-orange-500",
  confirmed: "bg-blue-500",
  preparing: "bg-amber-500",
  ready: "bg-green-500",
  delivered: "bg-purple-500",
};

interface OrderStatusStepperProps {
  currentStatus: string;
}

export function OrderStatusStepper({ currentStatus }: OrderStatusStepperProps) {
  const isCancelled = currentStatus === "cancelled";
  const currentIndex = STATUSES.indexOf(currentStatus as (typeof STATUSES)[number]);

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">
        <span className="size-3 rounded-full bg-red-500" />
        Order Cancelled
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {STATUSES.map((status, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={status} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-bold",
                  isCompleted && cn(STATUS_COLORS[status], "text-white"),
                  isCurrent && cn(STATUS_COLORS[status], "text-white ring-2 ring-offset-2"),
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="size-4" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>
            {index < STATUSES.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-0.5 flex-1",
                  index < currentIndex ? STATUS_COLORS[status] : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
