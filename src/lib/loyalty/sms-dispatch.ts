import "server-only";
import { z } from "zod";
import type { createLoyaltyClaimCrypto } from "./claim-crypto";

type DispatchInput = {
  tenantId: string;
  actorId: string;
  deviceId: string;
  credentialHash: string;
  jobId: string;
  leaseToken: string;
};
type Dependencies = {
  crypto: ReturnType<typeof createLoyaltyClaimCrypto>;
  now(): number;
  database: {
    rpc(
      name: string,
      args: Record<string, string>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
};
type Grant = {
  ok: true;
  jobId: string;
  leaseToken: string;
  phone: string;
  code: string;
  expiresAt: string;
};
const uuid = z
  .string()
  .length(36)
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  .transform((value) => value.toLowerCase());
const inputSchema = z
  .object({
    tenantId: uuid,
    actorId: uuid,
    deviceId: uuid,
    jobId: uuid,
    leaseToken: uuid,
    credentialHash: z
      .string()
      .length(64)
      .regex(/^[a-f0-9]+$/),
  })
  .strict();
const grantSchema = z.object({
  ok: z.literal(true),
  jobId: uuid,
  leaseToken: uuid,
  challengeId: uuid,
  payloadEncrypted: z.string().max(4096),
  expiresAt: z.string().datetime({ offset: true }),
});

// Internal trusted-server boundary. The HTTP adapter must authenticate actorId,
// derive the device credential hash, and prohibit caching/logging this response.
export async function authorizeLoyaltySmsDispatch(
  rawInput: DispatchInput,
  { crypto, database, now }: Dependencies,
): Promise<Grant | { ok: false }> {
  try {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false };
    const input = parsed.data;
    const { data, error } = await database.rpc(
      "authorize_loyalty_sms_dispatch",
      {
        p_tenant_id: input.tenantId,
        p_actor_id: input.actorId,
        p_device_id: input.deviceId,
        p_credential_hash: input.credentialHash,
        p_job_id: input.jobId,
        p_lease_token: input.leaseToken,
      },
    );
    const validated = grantSchema.safeParse(data);
    if (error || !validated.success) return { ok: false };
    const grant = validated.data;
    const currentTime = now();
    if (
      grant.jobId !== input.jobId ||
      grant.leaseToken !== input.leaseToken ||
      !Number.isFinite(currentTime) ||
      Date.parse(grant.expiresAt) <= currentTime + 5_000
    )
      return { ok: false };
    const payload = crypto.decryptSms(
      { tenantId: input.tenantId, challengeId: grant.challengeId },
      grant.payloadEncrypted,
    );
    return {
      ok: true,
      jobId: input.jobId,
      leaseToken: input.leaseToken,
      ...payload,
      expiresAt: grant.expiresAt,
    };
  } catch {
    return { ok: false };
  }
}
