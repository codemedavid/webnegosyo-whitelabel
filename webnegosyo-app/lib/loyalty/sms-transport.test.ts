import { createLoyaltySmsTransport } from "./sms-transport";

test("permission prompts happen during preparation, never after a dispatch grant", async () => {
  const permissions = {
    check: jest.fn().mockResolvedValue(false),
    request: jest.fn().mockResolvedValue("granted"),
  };
  const native = { sendSms: jest.fn().mockResolvedValue(undefined) };
  const transport = createLoyaltySmsTransport({
    platform: "android",
    permissions,
    native,
  });
  expect(await transport.prepare()).toBe(true);
  await expect(
    transport.send("+639171234567", "code", () => true),
  ).rejects.toThrow();
  expect(permissions.request).toHaveBeenCalledTimes(1);
  expect(native.sendSms).not.toHaveBeenCalled();
  permissions.check.mockResolvedValue(true);
  await expect(
    transport.send("+639171234567", "code", () => false),
  ).rejects.toThrow();
  expect(native.sendSms).not.toHaveBeenCalled();
  await transport.send("+639171234567", "code", () => true);
  expect(native.sendSms).toHaveBeenCalledWith("+639171234567", "code", null);
});
