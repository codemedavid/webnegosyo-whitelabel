import { DEVICE_EXPECTED_MAX_AGE_MS, deviceExpectedFor, forgetDeviceExpected, rememberDeviceExpected } from "./shift-device-expected";

describe("the tablet's own expected figure for End shift", () => {
  it("hands over the latest figure for that shift only", () => {
    rememberDeviceExpected("s1", 846500, 1_000);
    rememberDeviceExpected("s2", 100, 1_000);
    expect(deviceExpectedFor("s1", 2_000)).toBe(846500);
    expect(deviceExpectedFor("s3", 2_000)).toBeNull();
  });

  it("drops a figure once it is too old to count against, or unknown", () => {
    rememberDeviceExpected("s1", 846500, 0);
    expect(deviceExpectedFor("s1", DEVICE_EXPECTED_MAX_AGE_MS + 1)).toBeNull();
    rememberDeviceExpected("s1", null);
    expect(deviceExpectedFor("s1", 1)).toBeNull();
    rememberDeviceExpected("s1", 5, 0);
    forgetDeviceExpected("s1");
    expect(deviceExpectedFor("s1", 1)).toBeNull();
  });
});
