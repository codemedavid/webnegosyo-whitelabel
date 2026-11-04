// Guardrails for End shift & remit and the remittance slip (CONTRACTS W2.4).
// Source-reading, like the other mount guardrails: the count goes through
// count_shift (one recount), the close through close_shift, offline and
// unsynced work are refused with the designed copy, the draft is saved per
// shift, and the slip loads by remittance id.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const read = (...segments: string[]) => readFileSync(join(ROOT, ...segments), "utf8");
const endShift = () => read("app", "(main)", "end-shift.tsx");
const slip = () => read("app", "(main)", "remittance.tsx");

describe("End shift & remit", () => {
  it("counts through count_shift with this tablet's figure, and closes through close_shift", () => {
    expect(endShift()).toMatch(/countShift\(\{/);
    expect(endShift()).toMatch(/deviceExpectedCents: deviceExpectedFor\(shift\.id\)/);
    expect(endShift()).toMatch(/closeShiftRpc\(\{/);
  });

  it("refuses to count while offline or with sales/expenses still to sync, and to remit offline", () => {
    expect(endShift()).toMatch(/canSubmitCount\(\{[\s\S]*pendingSales[\s\S]*waitingExpenses/);
    expect(endShift()).toMatch(/canRemit\(\{ isOffline/);
  });

  it("keeps the count on the tablet per shift and drops it once closed", () => {
    expect(endShift()).toMatch(/useEndShiftDraft\(/);
    expect(endShift()).toMatch(/await clearDraft\(\)/);
  });

  it("is built on the shared cash parts", () => {
    for (const part of ["StepBar", "toCloseNonCash", "remitCloseArgs", "isRemitReady"]) expect(endShift()).toContain(part);
    const steps = read("components", "end-shift", "EndShiftSteps.tsx");
    for (const part of ["DenominationCounter", "NonCashCheck", "VerdictCard", "ReasonChips", "RemitToPicker", "Keypad"]) expect(steps).toContain(part);
  });

  it("refuses in the demo store", () => {
    expect(endShift()).toMatch(/DEMO_READONLY_MESSAGE/);
  });

  it("ends on the slip, replacing the flow so Back goes to the Drawer", () => {
    expect(endShift()).toMatch(/router\.replace\(`\$\{remittanceHref\(remittanceId\)\}/);
  });
});

describe("Remittance slip", () => {
  it("loads by remittance id, prints and shares through the shared slip helpers", () => {
    expect(slip()).toMatch(/useRemittance\(id\)/);
    expect(slip()).toMatch(/printRemittanceSlip/);
    expect(slip()).toMatch(/shareRemittanceSlip/);
  });

  it("offers PIN here now only for a pending remittance, through the web route", () => {
    expect(slip()).toMatch(/pinFor && remittance\.status === "pending"/);
    expect(slip()).toMatch(/acceptRemittanceByPin\(/);
  });
});
