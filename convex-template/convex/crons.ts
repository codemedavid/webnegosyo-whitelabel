import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "aggregate daily stats",
  { hourUTC: 23, minuteUTC: 59 },
  internal.statsAggregator.aggregateToday
);

crons.daily(
  "aggregate product analytics",
  { hourUTC: 16, minuteUTC: 0 },
  internal.productAnalyticsAggregator.computeAnalytics
);

export default crons;
