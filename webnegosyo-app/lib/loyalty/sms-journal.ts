export type SmsJournalEntry = {
  jobId: string;
  leaseToken: string;
  outcome: "pending" | "sent" | "failed";
};
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type Scope = { tenantId: string; actorId: string; deviceId: string };

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 36 &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}
function valid(value: unknown): value is SmsJournalEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).length === 3 &&
    uuid(entry.jobId) &&
    uuid(entry.leaseToken) &&
    typeof entry.outcome === "string" &&
    ["pending", "sent", "failed"].includes(entry.outcome)
  );
}

export function createSmsDeliveryJournal(storage: Storage, scope: Scope) {
  if (![scope.tenantId, scope.actorId, scope.deviceId].every(uuid))
    throw new Error("Invalid SMS journal scope");
  const key = `loyalty.sms.ack.v1.${scope.tenantId.toLowerCase()}.${scope.actorId.toLowerCase()}.${scope.deviceId.toLowerCase()}`;
  async function read(): Promise<SmsJournalEntry | null> {
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    try {
      if (raw.length > 2048) throw new Error();
      const entry: unknown = JSON.parse(raw);
      if (!valid(entry)) throw new Error();
      return entry;
    } catch {
      throw new Error("SMS journal requires recovery");
    }
  }
  return {
    read,
    async write(entry: SmsJournalEntry): Promise<void> {
      if (!valid(entry)) throw new Error("Invalid SMS journal entry");
      const current = await read();
      if (
        current &&
        (current.jobId !== entry.jobId ||
          current.leaseToken !== entry.leaseToken ||
          (current.outcome !== "pending" && current.outcome !== entry.outcome))
      )
        throw new Error("SMS journal conflict");
      await storage.setItem(
        key,
        JSON.stringify({
          jobId: entry.jobId,
          leaseToken: entry.leaseToken,
          outcome: entry.outcome,
        }),
      );
    },
    async clear(): Promise<void> {
      await storage.removeItem(key);
    },
  };
}

export type SmsDeliveryJournal = ReturnType<typeof createSmsDeliveryJournal>;
