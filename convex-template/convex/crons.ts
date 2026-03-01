import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "aggregate daily stats",
  { hourUTC: 23, minuteUTC: 59 },
  internal.statsAggregator.aggregateToday
);

export default crons;
