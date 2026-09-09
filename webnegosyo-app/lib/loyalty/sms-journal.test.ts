import { createSmsDeliveryJournal } from "./sms-journal";

const tenantId = "11111111-1111-1111-1111-111111111111";
const actorId = "22222222-2222-2222-2222-222222222222";
const deviceId = "33333333-3333-3333-3333-333333333333";
const entry = {
  jobId: tenantId,
  leaseToken: actorId,
  outcome: "pending" as const,
};
function storage() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: async (key: string) => {
      rows.delete(key);
    },
  };
}
test("a restarted journal reads the same pending acknowledgement without message content", async () => {
  const store = storage();
  const scope = { tenantId, actorId, deviceId };
  await createSmsDeliveryJournal(store, scope).write(entry);
  expect(await createSmsDeliveryJournal(store, scope).read()).toEqual(entry);
  expect([...store.rows.values()][0]).not.toContain("phone");
  expect(
    await createSmsDeliveryJournal(store, {
      ...scope,
      actorId: deviceId,
    }).read(),
  ).toBeNull();
});

test("malformed or extended persisted data fails closed and remains available for recovery", async () => {
  const store = storage();
  const journal = createSmsDeliveryJournal(store, {
    tenantId,
    actorId,
    deviceId,
  });
  await journal.write(entry);
  const key = [...store.rows.keys()][0];
  for (const raw of [
    "{}",
    "{",
    JSON.stringify({ ...entry, phone: "+639171234567" }),
    "x".repeat(2049),
  ]) {
    store.rows.set(key, raw);
    await expect(journal.read()).rejects.toThrow();
    expect(store.rows.get(key)).toBe(raw);
  }
});

test("a pending job cannot be overwritten by another job or a conflicting known outcome", async () => {
  const journal = createSmsDeliveryJournal(storage(), {
    tenantId,
    actorId,
    deviceId,
  });
  await journal.write(entry);
  await expect(journal.write({ ...entry, jobId: deviceId })).rejects.toThrow();
  await journal.write({ ...entry, outcome: "sent" });
  await expect(
    journal.write({ ...entry, outcome: "failed" }),
  ).rejects.toThrow();
  expect(await journal.read()).toEqual({ ...entry, outcome: "sent" });
});
