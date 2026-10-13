import { createOutboxApi } from "./outbox-api";
import { DeviceRevokedError } from "../loyalty/sms-delivery-api";

const tenantId = "11111111-1111-1111-1111-111111111111";
const device = { deviceId: "22222222-2222-2222-2222-222222222222", credential: "c".repeat(43) };
const messageId = "33333333-3333-3333-3333-333333333333";
const leaseToken = "44444444-4444-4444-4444-444444444444";

function api(status: number, json: unknown, onRevoked = jest.fn()) {
  const fetchImpl = jest.fn(async () => ({ status, text: async () => JSON.stringify(json) }) as unknown as Response);
  const port = createOutboxApi({
    webAppUrl: "https://webnegosyo.com/",
    fetchImpl,
    getSession: async () => ({ data: { session: { access_token: "token" } } }),
  }, { tenantId, device }, { onRevoked });
  return { port, fetchImpl, onRevoked };
}

test("claims one text with the device credential", async () => {
  const message = { messageId, leaseToken, phone: "+639171234567", body: "Hi" };
  const { port, fetchImpl } = api(200, { message, wait: null });
  expect(await port.claim()).toEqual({ message, wait: null });
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://webnegosyo.com/api/sms/outbox/claim");
  expect(JSON.parse(init.body as string)).toEqual({ tenantId, ...device });
});

test("reads a wait", async () => {
  const { port } = api(200, { message: null, wait: { reason: "quiet_hours", retryAt: null } });
  expect(await port.claim()).toEqual({ message: null, wait: { reason: "quiet_hours", retryAt: null } });
});

test("a 403 means this phone was revoked", async () => {
  const { port, onRevoked } = api(403, { error: "Forbidden" });
  await expect(port.claim()).rejects.toBeInstanceOf(DeviceRevokedError);
  expect(onRevoked).toHaveBeenCalled();
});

test("finish sends the error code only when there is one", async () => {
  const { port, fetchImpl } = api(200, { applied: true });
  expect(await port.finish({ messageId, leaseToken }, "sent")).toBe(true);
  expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
    .toEqual({ tenantId, ...device, messageId, leaseToken, outcome: "sent" });
  await port.finish({ messageId, leaseToken }, "failed", "send_failed");
  expect(JSON.parse((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string))
    .toMatchObject({ outcome: "failed", error: "send_failed" });
});

test("refuses an answer it does not understand", async () => {
  await expect(api(200, { message: null, wait: { reason: "party" } }).port.claim()).rejects.toThrow();
});
