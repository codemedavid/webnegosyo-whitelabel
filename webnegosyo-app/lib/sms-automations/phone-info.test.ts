import {
  PHONE_INFO_INTERVAL_MS,
  createPhoneInfoReporter,
  encodePhoneInfo,
  toPhoneInfo,
} from "./phone-info";

const decode = (header: string | null) => (header === null ? null : JSON.parse(decodeURIComponent(header)));

describe("toPhoneInfo", () => {
  test("keeps only usable fields and drops anything that is the wrong type", () => {
    expect(toPhoneInfo({
      manufacturer: " samsung ", model: "SM-A155F", os: "14", app: "1.0.13", sms: true, bat: "yes", extra: 1,
    })).toEqual({ manufacturer: "samsung", model: "SM-A155F", os: "14", app: "1.0.13", sms: true });
    expect(toPhoneInfo({ manufacturer: null, model: undefined, os: "", sms: undefined })).toEqual({});
  });

  test("bounds long values", () => {
    expect(toPhoneInfo({ model: "x".repeat(200) }).model).toHaveLength(60);
  });
});

describe("encodePhoneInfo", () => {
  test("is a URI-encoded JSON header, or null when there is nothing to say", () => {
    expect(decode(encodePhoneInfo({ model: "Pixel 7", sms: false }))).toEqual({ model: "Pixel 7", sms: false });
    expect(encodePhoneInfo({})).toBeNull();
  });

  test("stays plain ASCII whatever the phone calls itself", () => {
    expect(encodePhoneInfo({ model: "Galaxy A15 ✓" })).toMatch(/^[\x21-\x7e]+$/);
  });
});

function reporter(overrides: Partial<Parameters<typeof createPhoneInfoReporter>[0]> = {}) {
  let clock = 1_000_000;
  let version = "1.0.13";
  const collect = jest.fn(async () => ({ model: "Pixel 7", app: version }));
  const port = createPhoneInfoReporter({
    collect, appVersion: () => version, now: () => clock, collectTimeoutMs: 50, ...overrides,
  });
  return {
    port, collect,
    advance: (ms: number) => { clock += ms; },
    setVersion: (next: string) => { version = next; },
  };
}

describe("createPhoneInfoReporter", () => {
  test("reports on the first claim, then not again until it was sent and 6 hours passed", async () => {
    const { port, advance } = reporter();
    expect(decode(await port.next())).toEqual({ model: "Pixel 7", app: "1.0.13" });
    // Not acknowledged (the claim failed): ask again next time.
    expect(await port.next()).not.toBeNull();
    port.sent();
    expect(await port.next()).toBeNull();
    advance(PHONE_INFO_INTERVAL_MS - 1);
    expect(await port.next()).toBeNull();
    advance(1);
    expect(await port.next()).not.toBeNull();
  });

  test("reports again as soon as the app version changes", async () => {
    const { port, setVersion } = reporter();
    await port.next();
    port.sent();
    setVersion("1.0.14");
    expect(decode(await port.next())).toMatchObject({ app: "1.0.14" });
  });

  test("never throws and never holds a claim up", async () => {
    const failing = reporter({ collect: async () => { throw new Error("native module missing"); } });
    expect(await failing.port.next()).toBeNull();
    const hanging = reporter({ collect: () => new Promise(() => undefined) });
    expect(await hanging.port.next()).toBeNull();
  });

  test("sent() without a pending report changes nothing", async () => {
    const { port } = reporter();
    port.sent();
    expect(await port.next()).not.toBeNull();
  });
});
