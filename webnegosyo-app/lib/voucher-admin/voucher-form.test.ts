/**
 * The voucher editor's form: what the text boxes hold, how that becomes the
 * draft the shared validator (`lib/vouchers/admin-validation.ts`, a verbatim
 * copy of the web's) judges, and the few checks the database needs on top.
 */

import type { Voucher } from "../vouchers/types";
import {
  buildVoucherForm,
  endOfDayIso,
  endPresetIso,
  formToDraft,
  formFromTemplate,
  formToPreview,
  isFormDirty,
  startOfDayIso,
  suggestVoucherCode,
  validateVoucherForm,
  VOUCHER_TEMPLATES,
  type VoucherForm,
} from "./voucher-form";

const NOW = new Date(2026, 8, 26, 12, 0, 0);

function form(overrides: Partial<VoucherForm> = {}): VoucherForm {
  return { ...buildVoucherForm(null), code: "SAVE10", name: "Launch", discountValue: "10", ...overrides };
}

const SAVED: Voucher = {
  id: "v1",
  code: "LUNCH50",
  name: "Lunch deal",
  discountType: "fixed",
  discountValue: 50,
  maxDiscountAmount: null,
  minOrderAmount: 300,
  scope: "products",
  targetIds: ["p1", "p2"],
  isStackable: true,
  usageLimitTotal: 100,
  usageLimitPerCustomer: null,
  usedCount: 4,
  startsAt: null,
  endsAt: "2026-10-01T15:59:59.999Z",
  channels: ["pos"],
  outletIds: null,
  isActive: true,
};

describe("buildVoucherForm", () => {
  it("starts a new voucher as a whole-order percentage that works everywhere", () => {
    const fresh = buildVoucherForm(null);
    expect(fresh).toMatchObject({
      code: "",
      discountType: "percent",
      discountValue: "",
      scope: "universal",
      targetIds: [],
      channels: ["checkout", "pos", "admin"],
      isStackable: false,
    });
  });

  it("hands out a fresh copy each time, so one draft never bleeds into the next", () => {
    const a = buildVoucherForm(null);
    const b = buildVoucherForm(null);
    expect(a).not.toBe(b);
    expect(a.targetIds).not.toBe(b.targetIds);
    expect(a.channels).not.toBe(b.channels);
  });

  it("loads a saved voucher into text boxes, blank where it is unlimited", () => {
    expect(buildVoucherForm(SAVED)).toEqual({
      code: "LUNCH50",
      name: "Lunch deal",
      discountType: "fixed",
      discountValue: "50",
      maxDiscountAmount: "",
      minOrderAmount: "300",
      scope: "products",
      targetIds: ["p1", "p2"],
      isStackable: true,
      usageLimitTotal: "100",
      usageLimitPerCustomer: "",
      startsAt: null,
      endsAt: "2026-10-01T15:59:59.999Z",
      channels: ["pos"],
    });
  });

  it("shows no minimum as a blank box, not a zero", () => {
    expect(buildVoucherForm({ ...SAVED, minOrderAmount: 0 }).minOrderAmount).toBe("");
  });
});

describe("formToDraft", () => {
  it("round-trips a saved voucher", () => {
    expect(formToDraft(buildVoucherForm(SAVED))).toEqual({
      code: "LUNCH50",
      name: "Lunch deal",
      discountType: "fixed",
      discountValue: 50,
      maxDiscountAmount: null,
      minOrderAmount: 300,
      scope: "products",
      targetIds: ["p1", "p2"],
      isStackable: true,
      usageLimitTotal: 100,
      usageLimitPerCustomer: null,
      startsAt: null,
      endsAt: "2026-10-01T15:59:59.999Z",
      channels: ["pos"],
    });
  });

  it("reads peso signs, commas and spaces the way a merchant types them", () => {
    const draft = formToDraft(form({ minOrderAmount: "₱1,500", discountValue: " 12.5 " }));
    expect(draft.minOrderAmount).toBe(1500);
    expect(draft.discountValue).toBe(12.5);
  });

  it("normalises the code the way the server does", () => {
    expect(formToDraft(form({ code: " save 10 " })).code).toBe("SAVE10");
  });

  it("keeps a cap only on a percentage", () => {
    expect(formToDraft(form({ maxDiscountAmount: "100" })).maxDiscountAmount).toBe(100);
    expect(
      formToDraft(form({ discountType: "fixed", maxDiscountAmount: "100" })).maxDiscountAmount,
    ).toBeNull();
  });

  it("makes free delivery a whole-order code, since it ignores items", () => {
    const draft = formToDraft(
      form({ discountType: "free_delivery", discountValue: "", scope: "products", targetIds: ["p1"] }),
    );
    expect(draft).toMatchObject({ discountValue: 0, scope: "universal", targetIds: [] });
  });

  it("drops the picked items when the code goes back to the whole order", () => {
    expect(formToDraft(form({ scope: "universal", targetIds: ["p1"] })).targetIds).toEqual([]);
  });
});

describe("validateVoucherForm", () => {
  it("passes a complete percentage voucher", () => {
    expect(validateVoucherForm(form()).errors).toEqual([]);
  });

  it("uses the shared rules for the basics", () => {
    const fields = validateVoucherForm(form({ code: "", name: "", discountValue: "" })).errors.map(
      (e) => e.field,
    );
    expect(fields).toEqual(["code", "name", "discountValue"]);
  });

  it("refuses a scoped code with nothing picked", () => {
    const { errors } = validateVoucherForm(form({ scope: "categories" }));
    expect(errors.map((e) => e.field)).toEqual(["targetIds"]);
  });

  it("refuses a zero limit, which the database would reject, with a hint to leave it blank", () => {
    const { errors } = validateVoucherForm(form({ usageLimitTotal: "0", maxDiscountAmount: "0" }));
    expect(errors).toEqual([
      { field: "maxDiscountAmount", message: "Leave blank for no cap, or enter more than zero." },
      { field: "usageLimitTotal", message: "Leave blank for unlimited, or enter 1 or more." },
    ]);
  });

  it("refuses a fraction of a use", () => {
    const { errors } = validateVoucherForm(form({ usageLimitPerCustomer: "1.5" }));
    expect(errors).toEqual([{ field: "usageLimitPerCustomer", message: "Use a whole number." }]);
  });

  it("refuses text where a number belongs instead of saving it as unlimited", () => {
    const { errors } = validateVoucherForm(form({ minOrderAmount: "abc" }));
    expect(errors).toEqual([{ field: "minOrderAmount", message: "Enter a number." }]);
  });

  it("warns about a large percentage with no cap", () => {
    const { warnings } = validateVoucherForm(form({ discountValue: "50" }));
    expect(warnings.map((w) => w.field)).toEqual(["maxDiscountAmount"]);
  });
});

describe("formToPreview", () => {
  it("prices the ticket from whatever is typed so far", () => {
    const preview = formToPreview(form({ discountValue: "25", code: "" }), SAVED);
    expect(preview).toMatchObject({ discountValue: 25, code: "", usedCount: 4, isActive: true });
  });

  it("reads an unparseable amount as zero rather than crashing the ticket", () => {
    expect(formToPreview(form({ discountValue: "abc" }), null).discountValue).toBe(0);
  });
});

describe("suggestVoucherCode", () => {
  const random = () => 0;

  it("builds a code from the name and the value", () => {
    expect(suggestVoucherCode(form({ name: "Launch week", discountValue: "20" }), random)).toBe(
      "LAUNCH20",
    );
  });

  it("uses FREEDEL for free delivery", () => {
    expect(
      suggestVoucherCode(form({ name: "", discountType: "free_delivery", discountValue: "" }), random),
    ).toBe("FREEDEL");
  });

  it("falls back to SAVE when the name has no letters", () => {
    expect(suggestVoucherCode(form({ name: "!!!", discountValue: "" }), random)).toBe("SAVE");
  });

  it("adds a random tail when the suggestion is already the code", () => {
    const next = suggestVoucherCode(form({ name: "Launch", discountValue: "20", code: "LAUNCH20" }), random);
    expect(next).toBe("LAUNCH20AA");
  });
});

describe("dates", () => {
  it("snaps a start to the first moment of that day and an end to the last", () => {
    const day = new Date(2026, 9, 5, 15, 30);
    expect(new Date(startOfDayIso(day)).getHours()).toBe(0);
    const end = new Date(endOfDayIso(day));
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([5, 23, 59]);
  });

  it("ends a preset at the close of the day N days from now", () => {
    const end = new Date(endPresetIso(7, NOW));
    expect([end.getMonth(), end.getDate(), end.getHours()]).toEqual([9, 3, 23]);
  });
});

describe("isFormDirty", () => {
  it("notices an edit and ignores a no-op", () => {
    const initial = buildVoucherForm(SAVED);
    expect(isFormDirty(initial, buildVoucherForm(SAVED))).toBe(false);
    expect(isFormDirty(initial, { ...initial, name: "Other" })).toBe(true);
  });
});

describe("templates", () => {
  it.each(VOUCHER_TEMPLATES.map((t) => t.id))("%s fills a form that saves without errors", (id) => {
    const filled = formFromTemplate(id, NOW);
    expect(filled).not.toBeNull();
    expect(validateVoucherForm(filled as VoucherForm).errors).toEqual([]);
  });

  it("returns null for an unknown template", () => {
    expect(formFromTemplate("nope", NOW)).toBeNull();
  });
});
