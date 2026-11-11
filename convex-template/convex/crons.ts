import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 04:00 UTC = 12:00 PM Manila: after the latest business-day cutoff a store
// may set (11:45 AM), so yesterday's business day has always ended.
crons.daily(
  "aggregate daily stats",
  { hourUTC: 4, minuteUTC: 0 },
  internal.statsAggregator.aggregateBusinessDay
);

crons.daily(
  "aggregate product analytics",
  { hourUTC: 16, minuteUTC: 0 },
  internal.productAnalyticsAggregator.computeAnalytics
);

export default crons;
