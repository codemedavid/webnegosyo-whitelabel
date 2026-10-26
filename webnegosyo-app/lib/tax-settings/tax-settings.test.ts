import { defaultTaxProfile, type TaxProfile } from "../gov-discount";
import {
  BRANCH_CODE_PATTERN,
  TIN_PATTERN,
  formatBranchCodeInput,
  formatTinInput,
  splitTin,
} from "./tin";
import {
  MAX_APPROVAL_THRESHOLD,
  OPTIONAL_GOV_KINDS,
  formFromProfile,
  isFormDirty,
  profileFromForm,
  toggleKind,
  validateTaxSettingsForm,
  type TaxSettingsForm,
} from "./form";
import { exampleLine, formatExamplePeso, seniorMealExample } from "./vat-example";
import { canHoldApprovalPin, formatPinInput, validateApprovalPin } from "./approval-pin";
import { canEditTaxSettings, canOpenTaxSettings, canReviewGovDiscounts } from "./access";

function validForm(overrides: Partial<TaxSettingsForm> = {}): TaxSettingsForm {
  return { ...formFromProfile(null), vatStatus: "vat", ...overrides };
}

describe("TIN input", () => {
  it("groups digits as 000-000-000-00000 while typing and ignores anything else", () => {
    expect(formatTinInput("123")).toBe("123");
    expect(formatTinInput("1234")).toBe("123-4");
    expect(formatTinInput("123 456 789")).toBe("123-456-789");
    expect(formatTinInput("12345678900000999")).toBe("123-456-789-00000");
    expect(formatTinInput("abc")).toBe("");
  });

  it("keeps the branch code to five digits", () => {
    expect(formatBranchCodeInput("0a0-0001")).toBe("00000");
  });

  it("separates a branch code typed after the nine digits", () => {
    expect(splitTin("123-456-789-00002")).toEqual({ base: "123-456-789", branch: "00002" });
    expect(splitTin("123456789")).toEqual({ base: "123-456-789", branch: "" });
    expect(splitTin("")).toEqual({ base: "", branch: "" });
  });

  it("accepts exactly what the database constraints accept", () => {
    expect(TIN_PATTERN.test("123-456-789")).toBe(true);
    expect(TIN_PATTERN.test("123-456-789-000")).toBe(true);
    expect(TIN_PATTERN.test("123-456-78")).toBe(false);
    expect(BRANCH_CODE_PATTERN.test("00")).toBe(false);
    expect(BRANCH_CODE_PATTERN.test("000")).toBe(true);
  });
});

describe("formFromProfile", () => {
  it("starts a store without a profile on the recommended defaults but no VAT choice", () => {
    const form = formFromProfile(null);
    expect(form.vatStatus).toBeNull();
    expect(form.enabledKinds).toEqual(["senior", "pwd"]);
    expect(form.approvalRule).toBe("above");
    expect(form.approvalThreshold).toBe("500");
    expect(form.allowSharedTable).toBe(true);
    expect(form.serviceChargeMode).toBe("full");
  });

  it("fills the form from a saved profile, with the TIN grouped", () => {
    const profile: TaxProfile = {
      ...defaultTaxProfile("non_vat"),
      registeredName: "Karamotan Grill",
      tin: "123456789",
      tinBranchCode: "00000",
    };
    const form = formFromProfile(profile);
    expect(form.vatStatus).toBe("non_vat");
    expect(form.tin).toBe("123-456-789");
    expect(form.tinBranchCode).toBe("00000");
    expect(form.registeredName).toBe("Karamotan Grill");
  });
});

describe("validateTaxSettingsForm", () => {
  it("passes the defaults once a VAT status is chosen", () => {
    expect(validateTaxSettingsForm(validForm())).toEqual({});
  });

  it("asks for the VAT choice first", () => {
    expect(validateTaxSettingsForm(formFromProfile(null)).vatStatus).toBeDefined();
  });

  it("refuses a malformed TIN and branch code", () => {
    expect(validateTaxSettingsForm(validForm({ tin: "123-45" })).tin).toMatch(/TIN/);
    expect(validateTaxSettingsForm(validForm({ tinBranchCode: "1" })).tinBranchCode).toMatch(/3 to 5/);
  });

  it("refuses two different branch codes", () => {
    const errors = validateTaxSettingsForm(validForm({ tin: "123-456-789-00001", tinBranchCode: "00002" }));
    expect(errors.tinBranchCode).toMatch(/already ends in branch 00001/);
  });

  it("allows the same branch code in both places", () => {
    expect(validateTaxSettingsForm(validForm({ tin: "123-456-789-00001", tinBranchCode: "00001" }))).toEqual({});
  });

  it("needs the MIN and PTU only for a BIR-registered POS", () => {
    const errors = validateTaxSettingsForm(validForm({ isBirRegisteredPos: true }));
    expect(Object.keys(errors).sort()).toEqual(["posMin", "posPtuNo"]);
    expect(validateTaxSettingsForm(validForm({ isBirRegisteredPos: true, posMin: "M1", posPtuNo: "P1" }))).toEqual({});
  });

  it("checks the threshold only when approval is above an amount", () => {
    expect(validateTaxSettingsForm(validForm({ approvalThreshold: "abc" })).approvalThreshold).toBeDefined();
    expect(validateTaxSettingsForm(validForm({ approvalThreshold: "0" })).approvalThreshold).toBeDefined();
    expect(
      validateTaxSettingsForm(validForm({ approvalThreshold: String(MAX_APPROVAL_THRESHOLD + 1) })).approvalThreshold,
    ).toBeDefined();
    expect(validateTaxSettingsForm(validForm({ approvalThreshold: "750.50" }))).toEqual({});
    expect(validateTaxSettingsForm(validForm({ approvalRule: "never", approvalThreshold: "" }))).toEqual({});
  });

  it("refuses text longer than the database allows", () => {
    expect(validateTaxSettingsForm(validForm({ registeredName: "x".repeat(161) })).registeredName).toBeDefined();
  });
});

describe("profileFromForm", () => {
  it("returns nothing before a VAT status is chosen", () => {
    expect(profileFromForm(formFromProfile(null))).toBeNull();
  });

  it("moves a branch code typed after the TIN into its own column", () => {
    const profile = profileFromForm(validForm({ tin: "123-456-789-00003" }));
    expect(profile?.tin).toBe("123-456-789");
    expect(profile?.tinBranchCode).toBe("00003");
  });

  it("stores blank text as null and keeps Senior/PWD on", () => {
    const profile = profileFromForm(validForm({ registeredName: "  ", enabledKinds: [] }));
    expect(profile?.registeredName).toBeNull();
    expect(profile?.enabledKinds).toEqual(["senior", "pwd"]);
  });

  it("round-trips a saved profile unchanged", () => {
    const saved: TaxProfile = {
      ...defaultTaxProfile("vat"),
      tin: "123-456-789",
      tinBranchCode: "000",
      enabledKinds: ["senior", "pwd", "athlete"],
      approvalRule: "always",
      approvalThreshold: 900,
    };
    expect(profileFromForm(formFromProfile(saved))).toEqual(saved);
  });

  it("falls back to the default threshold for an unreadable amount", () => {
    expect(profileFromForm(validForm({ approvalRule: "never", approvalThreshold: "" }))?.approvalThreshold).toBe(500);
  });
});

describe("online Senior/PWD claims", () => {
  it("start off, so the discount is given on the register", () => {
    expect(formFromProfile(null).onlineClaimsEnabled).toBe(false);
    expect(profileFromForm(validForm())?.onlineClaimsEnabled).toBe(false);
  });

  it("save what the owner switched on", () => {
    const saved: TaxProfile = { ...defaultTaxProfile("vat"), onlineClaimsEnabled: true };
    expect(formFromProfile(saved).onlineClaimsEnabled).toBe(true);
    expect(profileFromForm(formFromProfile(saved))?.onlineClaimsEnabled).toBe(true);
  });
});

describe("toggleKind", () => {
  it("offers only the optional kinds as switches", () => {
    expect(OPTIONAL_GOV_KINDS).toEqual(["athlete", "medal_of_valor"]);
  });

  it("switches an optional kind on and off", () => {
    const on = toggleKind(["senior", "pwd"], "medal_of_valor", true);
    expect(on).toEqual(["senior", "pwd", "medal_of_valor"]);
    expect(toggleKind(on, "medal_of_valor", false)).toEqual(["senior", "pwd"]);
  });

  it("never switches Senior or PWD off", () => {
    expect(toggleKind(["senior", "pwd"], "senior", false)).toEqual(["senior", "pwd"]);
  });
});

describe("isFormDirty", () => {
  it("is false for the loaded values and true after a change", () => {
    const loaded = validForm();
    expect(isFormDirty({ ...loaded }, loaded)).toBe(false);
    expect(isFormDirty({ ...loaded, posMin: "1" }, loaded)).toBe(true);
  });
});

describe("the ₱560 example", () => {
  it("takes VAT off first, then 20%, at a VAT store", () => {
    expect(seniorMealExample("vat")).toEqual({ price: 560, pays: 400, vatRemoved: 60, discount: 100 });
    expect(exampleLine("vat")).toBe("₱560 meal → a senior or PWD pays ₱400");
  });

  it("takes 20% straight off at a non-VAT store", () => {
    expect(seniorMealExample("non_vat")?.pays).toBe(448);
  });

  it("keeps centavos only when there are some", () => {
    expect(formatExamplePeso(448.5)).toBe("₱448.50");
    expect(formatExamplePeso(1200)).toBe("₱1,200");
  });
});

describe("approval PIN", () => {
  it("wants 4 to 6 digits typed twice", () => {
    expect(validateApprovalPin("12", "12").pin).toBeDefined();
    expect(validateApprovalPin("1234567", "1234567").pin).toBeDefined();
    expect(validateApprovalPin("4821", "4822").confirmPin).toBeDefined();
    expect(validateApprovalPin("482193", "482193")).toEqual({});
  });

  it("keeps digits only while typing", () => {
    expect(formatPinInput("12a3-4567")).toBe("123456");
  });

  const holder = { role: "admin", isOwner: false, permissions: ["discount_review"], isDemo: false, isImpersonating: false };

  it("is for discount reviewers and owners on a real store account", () => {
    expect(canHoldApprovalPin(holder)).toBe(true);
    expect(canHoldApprovalPin({ ...holder, permissions: ["pos"] })).toBe(false);
    expect(canHoldApprovalPin({ ...holder, isOwner: true, permissions: null })).toBe(true);
    expect(canHoldApprovalPin({ ...holder, isDemo: true })).toBe(false);
    expect(canHoldApprovalPin({ ...holder, isImpersonating: true, isOwner: true })).toBe(false);
  });
});

describe("access", () => {
  const staff = (permissions: string[]) => ({ role: "admin", isOwner: false, permissions, isDemo: false });

  it("lists the screen for store setup and discount reviewers, not for a cashier", () => {
    expect(canOpenTaxSettings(staff(["store_setup"]))).toBe(true);
    expect(canOpenTaxSettings(staff(["discount_review"]))).toBe(true);
    expect(canOpenTaxSettings(staff(["pos"]))).toBe(false);
    expect(canOpenTaxSettings({ ...staff([]), isDemo: true, isOwner: true })).toBe(false);
  });

  it("lets only the owner edit", () => {
    expect(canEditTaxSettings({ ...staff([]), isOwner: true })).toBe(true);
    expect(canEditTaxSettings(staff(["store_setup", "discount_review"]))).toBe(false);
  });

  it("opens the sales book for discount reviewers only", () => {
    expect(canReviewGovDiscounts(staff(["discount_review"]))).toBe(true);
    expect(canReviewGovDiscounts(staff(["analytics"]))).toBe(false);
    expect(canReviewGovDiscounts({ ...staff([]), permissions: null })).toBe(true);
  });
});
