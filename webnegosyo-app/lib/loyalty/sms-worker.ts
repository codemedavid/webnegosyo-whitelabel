import type { LoyaltySmsTransport } from "./sms-transport";
import type { SmsDeliveryJournal } from "./sms-journal";

type JobReference = { jobId: string; leaseToken: string };
type Lease = JobReference & { leaseExpiresAt: string };
type DispatchGrant = JobReference & {
  phone: string;
  code: string;
  expiresAt: string;
};
type Dependencies = {
  api: {
    claim(): Promise<Lease | null>;
    authorize(job: JobReference): Promise<DispatchGrant | null>;
    finish(job: JobReference, outcome: "sent" | "failed"): Promise<boolean>;
    recover(job: JobReference, outcome: "sent" | "failed"): Promise<boolean>;
  };
  transport: LoyaltySmsTransport;
  journal: SmsDeliveryJournal;
  canSend(): boolean;
  now(): number;
};
type RunResult =
  | "sent"
  | "idle"
  | "busy"
  | "unavailable"
  | "uncertain"
  | "sent_unconfirmed"
  | "recovered"
  | "recovery_required";

function validGrant(
  grant: DispatchGrant,
  job: JobReference,
  now: number,
): boolean {
  return (
    grant.jobId === job.jobId &&
    grant.leaseToken === job.leaseToken &&
    typeof grant.phone === "string" &&
    grant.phone.length === 13 &&
    /^\+639[0-9]{9}$/.test(grant.phone) &&
    typeof grant.code === "string" &&
    grant.code.length === 6 &&
    /^[0-9]{6}$/.test(grant.code) &&
    typeof grant.expiresAt === "string" &&
    Number.isFinite(now) &&
    Date.parse(grant.expiresAt) > now + 5_000
  );
}

function validLease(lease: Lease, now: number): boolean {
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return (
    typeof lease.jobId === "string" &&
    lease.jobId.length === 36 &&
    uuid.test(lease.jobId) &&
    typeof lease.leaseToken === "string" &&
    lease.leaseToken.length === 36 &&
    uuid.test(lease.leaseToken) &&
    typeof lease.leaseExpiresAt === "string" &&
    Number.isFinite(now) &&
    Date.parse(lease.leaseExpiresAt) > now
  );
}

// One coordinator per signed-in device session. HTTP/enrollment wiring is
// deliberately separate; the API port must be authenticated and tenant-bound.
export function createLoyaltySmsWorker({
  api,
  transport,
  journal,
  canSend,
  now,
}: Dependencies) {
  let running = false;
  async function finish(
    job: JobReference,
    outcome: "sent" | "failed",
    recovery = false,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await (recovery
          ? api.recover(job, outcome)
          : api.finish(job, outcome));
      } catch {
        /* Retry acknowledgement only. */
      }
    }
    return false;
  }
  async function finishRecorded(
    job: JobReference,
    outcome: "sent" | "failed",
    recovery = false,
  ) {
    await journal.write({ ...job, outcome });
    const applied = await finish(job, outcome, recovery);
    if (applied) await journal.clear();
    return applied;
  }
  return {
    async runOnce(): Promise<RunResult> {
      if (running) return "busy";
      running = true;
      try {
        if (!transport.isAvailable || !canSend()) return "unavailable";
        const pending = await journal.read();
        if (!canSend()) return "unavailable";
        if (pending) {
          const job = { jobId: pending.jobId, leaseToken: pending.leaseToken };
          const outcome =
            pending.outcome === "pending" ? "failed" : pending.outcome;
          if (!(await finishRecorded(job, outcome, true)))
            return "recovery_required";
          return "recovered";
        }
        if (!(await transport.prepare()) || !canSend()) return "unavailable";
        const lease = await api.claim();
        if (!lease) return "idle";
        if (!validLease(lease, now()) || !canSend()) return "unavailable";
        const job = { jobId: lease.jobId, leaseToken: lease.leaseToken };
        await journal.write({ ...job, outcome: "pending" });
        let grant: DispatchGrant | null;
        try {
          grant = await api.authorize(job);
        } catch {
          await finishRecorded(job, "failed");
          return "uncertain";
        }
        if (!grant) {
          await finishRecorded(job, "failed");
          return "idle";
        }
        if (!validGrant(grant, job, now()) || !canSend()) {
          await finishRecorded(job, "failed");
          return "unavailable";
        }
        try {
          await transport.send(
            grant.phone,
            `Your loyalty verification code is ${grant.code}. Do not share this code.`,
            () => canSend() && validGrant(grant, job, now()),
          );
        } catch {
          await finishRecorded(job, "failed");
          return "uncertain";
        }
        return (await finishRecorded(job, "sent"))
          ? "sent"
          : "sent_unconfirmed";
      } catch {
        return "unavailable";
      } finally {
        running = false;
      }
    },
  };
}
