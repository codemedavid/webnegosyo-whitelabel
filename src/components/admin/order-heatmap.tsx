"use client";

import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const hour = i % 12 || 12;
  const ampm = i < 12 ? "a" : "p";
  return `${hour}${ampm}`;
});

const VISIBLE_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

interface OrderHeatmapProps {
  heatmap: HeatmapCell[];
  peakHour: { day: number; hour: number; count: number };
}

function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-muted";
  const ratio = count / maxCount;
  if (ratio <= 0.25) return "bg-green-100 dark:bg-green-950";
  if (ratio <= 0.5) return "bg-green-300 dark:bg-green-800";
  if (ratio <= 0.75) return "bg-green-500 dark:bg-green-600 text-white";
  return "bg-green-700 dark:bg-green-400 text-white dark:text-black";
}

export function OrderHeatmap({ heatmap, peakHour }: OrderHeatmapProps) {
  const maxCount = Math.max(...heatmap.map((c) => c.count), 1);

  const cellMap = new Map<string, number>();
  for (const cell of heatmap) {
    cellMap.set(`${cell.day}-${cell.hour}`, cell.count);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Hour headers */}
          <div className="mb-1 flex">
            <div className="w-10" />
            {VISIBLE_HOURS.map((hour) => (
              <div
                key={hour}
                className="flex-1 text-center text-[10px] text-muted-foreground"
              >
                {HOUR_LABELS[hour]}
              </div>
            ))}
          </div>

          {/* Day rows */}
          {DAY_LABELS.map((dayLabel, dayIndex) => (
            <div key={dayLabel} className="mb-0.5 flex items-center">
              <div className="w-10 text-xs text-muted-foreground">{dayLabel}</div>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = cellMap.get(`${dayIndex}-${hour}`) ?? 0;
                  return (
                    <div
                      key={hour}
                      className={cn(
                        "flex-1 rounded-sm aspect-square min-h-[14px] flex items-center justify-center text-[8px]",
                        getIntensityClass(count, maxCount)
                      )}
                      title={`${dayLabel} ${HOUR_LABELS[hour]}: ${count} orders`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Peak hour annotation */}
      {peakHour.count > 0 && (
        <p className="text-xs text-muted-foreground">
          Peak: <span className="font-medium text-foreground">{DAY_LABELS[peakHour.day]} {HOUR_LABELS[peakHour.hour]}</span> — {peakHour.count} orders
        </p>
      )}
    </div>
  );
}
