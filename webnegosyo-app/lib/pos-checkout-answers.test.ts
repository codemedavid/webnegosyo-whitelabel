import { answeredCount, answersCustomerData, withAnswer } from "./pos-checkout-answers";
import type { PosCheckoutField } from "./pos-checkout-fields";

const field = (name: string): PosCheckoutField => ({
  id: name,
  orderTypeId: "ot-delivery",
  name,
  label: name,
  type: "text",
  placeholder: null,
  options: [],
  role: "custom",
});

describe("withAnswer", () => {
  it("returns a new object and never touches the old one", () => {
    const before = { Landmark: "Blue gate" };
    const after = withAnswer(before, "Notes", "Ring twice");

    expect(after).toEqual({ Landmark: "Blue gate", Notes: "Ring twice" });
    expect(before).toEqual({ Landmark: "Blue gate" });
  });

  it("removes the answer when it is blanked", () => {
    expect(withAnswer({ Landmark: "Blue gate" }, "Landmark", "")).toEqual({});
  });
});

describe("answersCustomerData", () => {
  it("writes only the current order type's questions, trimmed, skipping blanks", () => {
    const answers = { Landmark: "  Blue gate ", Notes: "   ", "Table area": "Patio" };

    expect(answersCustomerData([field("Landmark"), field("Notes")], answers)).toEqual({
      Landmark: "Blue gate",
    });
  });
});

describe("answeredCount", () => {
  it("counts non-blank answers to the given questions", () => {
    expect(answeredCount([field("Landmark"), field("Notes")], { Landmark: "x", Notes: " " })).toBe(1);
  });
});
