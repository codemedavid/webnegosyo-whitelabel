/**
 * Print-job planning. The native thermal-printer lib holds ONE active
 * connection — connectPrinter simply switches the target — and printBill is
 * fire-and-forget (resolved on a 1.5s timer). Two consequences the planner
 * encodes:
 *
 *  - a job for the already-connected printer must NOT reconnect (today's fast
 *    path for single-printer devices);
 *  - switching targets needs a settle pause first, so the previous job's bytes
 *    finish draining before the connection moves.
 */

import {
  planPrintJobs,
  jobsForRole,
  SWITCH_SETTLE_MS,
  type PrintJob,
} from "./print-queue";
import type { RegisteredPrinter } from "./printer-registry";

const PRINTERS: RegisteredPrinter[] = [
  { id: "cash", type: "bluetooth", name: "Front", address: "AA:BB", roles: ["cashier"] },
  { id: "kit1", type: "network", name: "Hot line", address: "10.0.0.5:9100", roles: ["kitchen"] },
  { id: "kit2", type: "bluetooth", name: "Expo", address: "CC:DD", roles: ["kitchen"] },
];

const SEGMENTS = [{ type: "text" as const, text: "hello" }];

const job = (targetId: string): PrintJob => ({ targetId, segments: SEGMENTS });

describe("planPrintJobs", () => {
  it("skips connect entirely when the target is already connected", () => {
    const steps = planPrintJobs([job("cash")], PRINTERS, "AA:BB");

    expect(steps).toHaveLength(1);
    expect(steps[0]!.needsConnect).toBe(false);
    expect(steps[0]!.settleBeforeConnectMs).toBe(0);
  });

  it("connects without settling when nothing was connected before", () => {
    const steps = planPrintJobs([job("cash")], PRINTERS, null);

    expect(steps[0]!.needsConnect).toBe(true);
    expect(steps[0]!.settleBeforeConnectMs).toBe(0);
  });

  it("settles before switching away from a live connection", () => {
    const steps = planPrintJobs([job("kit1")], PRINTERS, "AA:BB");

    expect(steps[0]!.needsConnect).toBe(true);
    expect(steps[0]!.settleBeforeConnectMs).toBe(SWITCH_SETTLE_MS);
  });

  it("chains jobs: consecutive jobs to the same printer connect once", () => {
    const steps = planPrintJobs([job("kit1"), job("kit1")], PRINTERS, null);

    expect(steps.map((s) => s.needsConnect)).toEqual([true, false]);
  });

  it("settles between jobs whenever the target changes mid-queue", () => {
    const steps = planPrintJobs([job("cash"), job("kit2")], PRINTERS, null);

    expect(steps.map((s) => s.needsConnect)).toEqual([true, true]);
    expect(steps.map((s) => s.settleBeforeConnectMs)).toEqual([0, SWITCH_SETTLE_MS]);
  });

  it("drops jobs whose target printer no longer exists", () => {
    const steps = planPrintJobs([job("gone"), job("cash")], PRINTERS, null);

    expect(steps).toHaveLength(1);
    expect(steps[0]!.printer.id).toBe("cash");
  });
});

describe("jobsForRole", () => {
  it("kitchen fans out to EVERY kitchen-role printer", () => {
    const jobs = jobsForRole(PRINTERS, "kitchen", SEGMENTS);

    expect(jobs.map((j) => j.targetId)).toEqual(["kit1", "kit2"]);
  });

  it("cashier prints one receipt — the first cashier-role printer only", () => {
    const both: RegisteredPrinter[] = [
      ...PRINTERS,
      { id: "cash2", type: "network", name: "Back office", address: "10.0.0.9:9100", roles: ["cashier"] },
    ];
    const jobs = jobsForRole(both, "cashier", SEGMENTS);

    expect(jobs.map((j) => j.targetId)).toEqual(["cash"]);
  });

  it("yields nothing when no printer holds the role", () => {
    expect(jobsForRole([PRINTERS[0]!], "kitchen", SEGMENTS)).toEqual([]);
  });
});
