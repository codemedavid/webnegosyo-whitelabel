import {
  canScanFor,
  healthActionLabel,
  healthNotice,
  healthSummary,
  healthTone,
  shouldTestPrint,
  UNKNOWN_HEALTH,
  type PrinterHealth,
} from "./printer-health";

describe("lib/printer-health.ts — what a printer row is allowed to offer", () => {
  it("offers Test only once a connection exists", () => {
    // Arrange / Act / Assert — the whole point of the module: a printer
    // nobody has reached must not advertise a test print.
    expect(shouldTestPrint("ready")).toBe(true);
    expect(shouldTestPrint("unknown")).toBe(false);
    expect(shouldTestPrint("unreachable")).toBe(false);
    expect(shouldTestPrint("connecting")).toBe(false);
  });

  it("labels the action for the state the printer is actually in", () => {
    expect(healthActionLabel("ready")).toBe("Test");
    expect(healthActionLabel("unknown")).toBe("Connect");
    expect(healthActionLabel("unreachable")).toBe("Reconnect");
    expect(healthActionLabel("connecting")).toBe("Connecting");
  });

  it("marks a lost printer amber, not grey — grey means never tried", () => {
    expect(healthTone("ready")).toBe("on");
    expect(healthTone("unreachable")).toBe("warn");
    expect(healthTone("unknown")).toBe("off");
    expect(healthTone("connecting")).toBe("off");
  });

  it("summarises each state for screen readers", () => {
    expect(healthSummary("ready")).toBe("Connected");
    expect(healthSummary("unreachable")).toBe("Not reachable");
    expect(healthSummary("unknown")).toBe("Not connected yet");
  });

  it("says nothing under a healthy printer", () => {
    expect(healthNotice({ status: "ready" })).toBeNull();
    expect(healthNotice({ status: "connecting" })).toBeNull();
  });

  it("tells an untouched printer it needs connecting first", () => {
    expect(healthNotice(UNKNOWN_HEALTH)).toMatch(/Connect/);
  });

  it("keeps the print path's own explanation when there is one", () => {
    // Arrange
    const health: PrinterHealth = {
      status: "unreachable",
      message: "The printer dropped the connection. Check it is switched on.",
    };

    // Act
    const notice = healthNotice(health);

    // Assert — a specific reason beats a generic one, so it is not overwritten.
    expect(notice).toBe(health.message);
  });

  it("falls back to an actionable line when the failure carried no message", () => {
    expect(healthNotice({ status: "unreachable" })).toMatch(/Reconnect/);
  });

  it("offers a rescan only for a Bluetooth printer that failed", () => {
    expect(canScanFor({ type: "bluetooth" }, "unreachable")).toBe(true);
    expect(canScanFor({ type: "bluetooth" }, "ready")).toBe(false);
    expect(canScanFor({ type: "bluetooth" }, "unknown")).toBe(false);
    // A network printer sits at a fixed address — scanning finds nothing.
    expect(canScanFor({ type: "network" }, "unreachable")).toBe(false);
  });
});
