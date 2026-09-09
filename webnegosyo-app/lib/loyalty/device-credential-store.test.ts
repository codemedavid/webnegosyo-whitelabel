import { createDeviceCredentialStore, subscribeDeviceEnrollment } from "./device-credential-store";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const credential = "A".repeat(43);

function setup() {
  const rows = new Map<string, string>();
  const secure = {
    getItemAsync: jest.fn(async (key: string) => rows.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      rows.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      rows.delete(key);
    }),
  };
  return { rows, secure, store: createDeviceCredentialStore(secure, { tenantId, actorId }) };
}

test("round-trips an enrollment under a tenant/actor-scoped key", async () => {
  const { store, rows, secure } = setup();
  expect(await store.read()).toBeNull();
  await store.write({ deviceId, credential });
  expect(await store.read()).toEqual({ deviceId, credential });
  const [key] = secure.setItemAsync.mock.calls[0];
  expect(key).toBe(`loyalty.sms.device.v1.${tenantId}.${actorId}`);
  expect(rows.size).toBe(1);
  await store.clear();
  expect(await store.read()).toBeNull();
});

test("a different actor on the same handset cannot read another's credential", async () => {
  const { store, secure } = setup();
  await store.write({ deviceId, credential });
  const other = createDeviceCredentialStore(secure, {
    tenantId,
    actorId: "99999999-9999-4999-8999-999999999999",
  });
  expect(await other.read()).toBeNull();
});

test.each([
  { deviceId: "nope", credential },
  { deviceId, credential: "short" },
  { deviceId, credential: `${"a".repeat(42)}=` },
  { deviceId, credential, extra: 1 },
])("refuses to store a malformed enrollment: %j", async (entry) => {
  const { store, secure } = setup();
  await expect(store.write(entry as never)).rejects.toThrow("Invalid loyalty device enrollment");
  expect(secure.setItemAsync).not.toHaveBeenCalled();
});

test("treats corrupt or foreign stored values as absent and clears them", async () => {
  const { store, rows, secure } = setup();
  rows.set(`loyalty.sms.device.v1.${tenantId}.${actorId}`, '{"deviceId":"x"}');
  expect(await store.read()).toBeNull();
  expect(secure.deleteItemAsync).toHaveBeenCalledTimes(1);
});

test("rejects a scope that is not two UUIDs", () => {
  const { secure } = setup();
  expect(() => createDeviceCredentialStore(secure, { tenantId: "t", actorId })).toThrow(
    "Invalid loyalty device scope",
  );
});

test("read failures from the secure store surface as absent, never as a throw", async () => {
  const secure = {
    getItemAsync: jest.fn(async () => {
      throw new Error("keychain locked");
    }),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  };
  const store = createDeviceCredentialStore(secure, { tenantId, actorId });
  expect(await store.read()).toBeNull();
});

test("notifies mounted readers immediately after enrollment and revocation", async () => {
  const { store } = setup();
  const changed = jest.fn();
  const unsubscribe = subscribeDeviceEnrollment({ tenantId, actorId }, changed);
  await store.write({ deviceId, credential });
  expect(changed).toHaveBeenCalledTimes(1);
  await store.clearIfMatches({ deviceId, credential });
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
});

test("a delayed revocation cannot delete a replacement enrollment", async () => {
  const { store, secure } = setup();
  const old = { deviceId, credential };
  const replacement = { deviceId: "44444444-4444-4444-8444-444444444444", credential: "B".repeat(43) };
  await store.write(old);
  const otherStore = createDeviceCredentialStore(secure, { tenantId, actorId });
  await otherStore.write(replacement);
  expect(await store.clearIfMatches(old)).toBe(false);
  expect(await store.read()).toEqual(replacement);
});

test("serializes conditional removal with concurrent replacement writes", async () => {
  const { store, secure } = setup();
  const old = { deviceId, credential };
  const replacement = { deviceId, credential: "B".repeat(43) };
  await store.write(old);
  const otherStore = createDeviceCredentialStore(secure, { tenantId, actorId });
  await Promise.all([store.clearIfMatches(old), otherStore.write(replacement)]);
  expect(await store.read()).toEqual(replacement);
});
