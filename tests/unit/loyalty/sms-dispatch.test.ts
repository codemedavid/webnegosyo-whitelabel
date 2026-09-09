/** @jest-environment node */
jest.mock("server-only", () => ({}));
import { createLoyaltyClaimCrypto } from "@/lib/loyalty/claim-crypto";
import { authorizeLoyaltySmsDispatch } from "@/lib/loyalty/sms-dispatch";

const tenant = "11111111-1111-1111-1111-111111111111";
const actor = "22222222-2222-2222-2222-222222222222";
const device = "33333333-3333-3333-3333-333333333333";
const job = "44444444-4444-4444-4444-444444444444";
const lease = "55555555-5555-5555-5555-555555555555";
const challenge = "66666666-6666-6666-6666-666666666666";
const input = {
  tenantId: tenant,
  actorId: actor,
  deviceId: device,
  credentialHash: "a".repeat(64),
  jobId: job,
  leaseToken: lease,
};
const crypto = createLoyaltyClaimCrypto({
  hashKey: Buffer.alloc(32, 1),
  encryptionKey: Buffer.alloc(32, 2),
});
const now = () => Date.parse("2026-09-09T12:00:00Z");
function setup() {
  const payloadEncrypted = crypto.encryptSms(
    { tenantId: tenant, challengeId: challenge },
    { phone: "+639171234567", code: "012345" },
  );
  const grant = {
    ok: true,
    jobId: job,
    leaseToken: lease,
    challengeId: challenge,
    expiresAt: "2026-09-09T12:05:00Z",
    payloadEncrypted,
  };
  const database = {
    rpc: jest.fn().mockResolvedValue({ data: grant, error: null }),
  };
  return { crypto, now, database, grant };
}
test("decrypts only an authorized grant and returns only the device dispatch fields", async () => {
  const deps = setup();
  expect(await authorizeLoyaltySmsDispatch(input, deps)).toEqual({
    ok: true,
    jobId: job,
    leaseToken: lease,
    phone: "+639171234567",
    code: "012345",
    expiresAt: deps.grant.expiresAt,
  });
  expect(deps.database.rpc).toHaveBeenCalledWith(
    "authorize_loyalty_sms_dispatch",
    {
      p_tenant_id: tenant,
      p_actor_id: actor,
      p_device_id: device,
      p_credential_hash: input.credentialHash,
      p_job_id: job,
      p_lease_token: lease,
    },
  );
});

test.each([
  { ok: false },
  { jobId: device },
  { leaseToken: device },
  { challengeId: device },
  { payloadEncrypted: "corrupt" },
  { expiresAt: "invalid" },
  { expiresAt: "2026-09-09T11:59:59Z" },
])(
  "refuses denied, mismatched, stale, and corrupt grants %#",
  async (patch) => {
    const deps = setup();
    deps.database.rpc.mockResolvedValue({
      data: { ...deps.grant, ...patch },
      error: null,
    });
    await expect(authorizeLoyaltySmsDispatch(input, deps)).resolves.toEqual({
      ok: false,
    });
  },
);
test("uncertain authorization is not retried and internal errors are hidden", async () => {
  const deps = setup();
  deps.database.rpc.mockRejectedValue(new Error("private details"));
  await expect(authorizeLoyaltySmsDispatch(input, deps)).resolves.toEqual({
    ok: false,
  });
  expect(deps.database.rpc).toHaveBeenCalledTimes(1);
});

test("invalid credentials are refused before calling storage", async () => {
  const deps = setup();
  expect(
    await authorizeLoyaltySmsDispatch(
      { ...input, credentialHash: "invalid" },
      deps,
    ),
  ).toEqual({ ok: false });
  expect(deps.database.rpc).not.toHaveBeenCalled();
});

test("database errors cannot be masked by a success-shaped payload", async () => {
  const deps = setup();
  deps.database.rpc.mockResolvedValue({
    data: deps.grant,
    error: { message: "private database error" },
  });
  expect(await authorizeLoyaltySmsDispatch(input, deps)).toEqual({ ok: false });
});

test("an invalid server clock fails closed", async () => {
  const deps = setup();
  expect(
    await authorizeLoyaltySmsDispatch(input, { ...deps, now: () => NaN }),
  ).toEqual({ ok: false });
});
