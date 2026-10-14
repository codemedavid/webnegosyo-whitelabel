import { createOutboxApi } from "./outbox-api";
import { DeviceRevokedError } from "../loyalty/sms-delivery-api";
import { PHONE_INFO_HEADER, type PhoneInfoReporter } from "./phone-info";

const tenantId = "11111111-1111-1111-1111-111111111111";
const device = { deviceId: "22222222-2222-2222-2222-222222222222", credential: "c".repeat(43) };
const messageId = "33333333-3333-3333-3333-333333333333";
const leaseToken = "44444444-4444-4444-4444-444444444444";

function api(status: number, json: unknown, onRevoked = jest.fn(), phoneInfo: PhoneInfoReporter | null = null) {
  const fetchImpl = jest.fn(async () => ({ status, text: async () => JSON.stringify(json) }) as unknown as Response);
  const port = createOutboxApi({
    webAppUrl: "https://webnegosyo.com/",
    fetchImpl,
    getSession: async () => ({ data: { session: { access_token: "token" } } }),
  }, { tenantId, device }, { onRevoked, phoneInfo });
  return { port, fetchImpl, onRevoked };
}

const headersOf = (fetchImpl: jest.Mock, call = 0) =>
  ((fetchImpl.mock.calls[call] as unknown as [string, RequestInit])[1].headers ?? {}) as Record<string, string>;

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

describe("the phone's report (x-wn-phone-info)", () => {
  const wait = { message: null, wait: { reason: "no_job", retryAt: null } };
  const reporter = (header: string | null) => ({ next: jest.fn(async () => header), sent: jest.fn() });

  test("rides on a claim as a header, never in the body, and is acknowledged once the claim worked", async () => {
    const info = reporter("%7B%22model%22%3A%22Pixel%207%22%7D");
    const { port, fetchImpl } = api(200, wait, jest.fn(), info);
    await port.claim();
    expect(headersOf(fetchImpl)[PHONE_INFO_HEADER]).toBe("%7B%22model%22%3A%22Pixel%207%22%7D");
    expect(headersOf(fetchImpl).Authorization).toBe("Bearer token");
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ tenantId, ...device });
    expect(info.sent).toHaveBeenCalledTimes(1);
  });

  test("is not acknowledged when the claim fails, so the next claim reports again", async () => {
    const info = reporter("x");
    const { port } = api(503, { error: "down" }, jest.fn(), info);
    await expect(port.claim()).rejects.toThrow();
    expect(info.sent).not.toHaveBeenCalled();
  });

  test("sends no header when there is nothing to report, and never on finish", async () => {
    const info = reporter(null);
    const { port, fetchImpl } = api(200, wait, jest.fn(), info);
    await port.claim();
    expect(headersOf(fetchImpl)[PHONE_INFO_HEADER]).toBeUndefined();
    await port.finish({ messageId, leaseToken }, "sent");
    expect(headersOf(fetchImpl, 1)[PHONE_INFO_HEADER]).toBeUndefined();
    expect(info.next).toHaveBeenCalledTimes(1);
    expect(info.sent).not.toHaveBeenCalled();
  });

  test("a reporter that fails never stops the claim", async () => {
    const info = { next: jest.fn(async () => { throw new Error("boom"); }), sent: jest.fn() };
    const { port, fetchImpl } = api(200, wait, jest.fn(), info as unknown as PhoneInfoReporter);
    expect(await port.claim()).toEqual(wait);
    expect(headersOf(fetchImpl)[PHONE_INFO_HEADER]).toBeUndefined();
  });
});
