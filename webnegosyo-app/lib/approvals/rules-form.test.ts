import {
  RULE_FIELDS,
  changeSentence,
  diffRules,
  formatRuleValue,
  lastChangedLine,
  parseRuleText,
  rulesPatch,
  stepRule,
} from "./rules-form";
import type { ApprovalRules } from "./types";

const RULES: ApprovalRules = {
  directRefundCap: 300,
  managerApproveCap: 1000,
  staffRefundWindow: "same_day",
  discountPctNeedsApproval: 20,
  writeoffCostNeedsApproval: 500,
  expiryMinutes: 30,
  maxPendingPerStaff: 3,
  updatedAt: "2026-10-12T02:00:00.000Z",
  updatedByName: "Lorna Cruz",
};

const field = (key: string) => {
  const found = RULE_FIELDS.find((candidate) => candidate.key === key);
  if (!found) throw new Error(key);
  return found;
};

describe("rules as sentences", () => {
  test("covers every numeric rule the server accepts", () => {
    expect(RULE_FIELDS.map((candidate) => candidate.key)).toEqual([
      "directRefundCap",
      "managerApproveCap",
      "discountPctNeedsApproval",
      "writeoffCostNeedsApproval",
      "expiryMinutes",
      "maxPendingPerStaff",
    ]);
  });

  test("values read the way they are spoken", () => {
    expect(formatRuleValue(field("managerApproveCap"), 1000)).toBe("₱1,000");
    expect(formatRuleValue(field("discountPctNeedsApproval"), 20)).toBe("20%");
    expect(formatRuleValue(field("expiryMinutes"), 30)).toBe("30 min");
    expect(formatRuleValue(field("maxPendingPerStaff"), 3)).toBe("3");
  });

  test("steppers jump by presets and stay inside the server's bounds", () => {
    expect(stepRule(field("directRefundCap"), 300, 1)).toBe(400);
    expect(stepRule(field("directRefundCap"), 50, -1)).toBe(0);
    expect(stepRule(field("managerApproveCap"), 1000, 1)).toBe(1500);
    expect(stepRule(field("expiryMinutes"), 5, -1)).toBe(5);
    expect(stepRule(field("expiryMinutes"), 240, 1)).toBe(240);
    expect(stepRule(field("discountPctNeedsApproval"), 98, 1)).toBe(100);
  });

  test("typed values are parsed, whole where the server wants whole numbers", () => {
    expect(parseRuleText(field("directRefundCap"), "₱1,250.50")).toBe(1250.5);
    expect(parseRuleText(field("expiryMinutes"), "45.7")).toBe(46);
    expect(parseRuleText(field("expiryMinutes"), "2")).toBeNull();
    expect(parseRuleText(field("maxPendingPerStaff"), "abc")).toBeNull();
    expect(parseRuleText(field("discountPctNeedsApproval"), "150")).toBeNull();
  });
});

describe("saving", () => {
  test("only what changed is sent, and each change is said back", () => {
    const after: ApprovalRules = { ...RULES, directRefundCap: 500, staffRefundWindow: "any" };
    expect(rulesPatch(RULES, after)).toEqual({ directRefundCap: 500, staffRefundWindow: "any" });
    const changes = diffRules(RULES, after);
    expect(changes.map(changeSentence)).toEqual([
      "Staff refund limit: ₱300 → ₱500",
      "Staff refunds: same day only → any day",
    ]);
    expect(diffRules(RULES, { ...RULES })).toEqual([]);
  });

  test("the footer names who changed the rules last", () => {
    expect(lastChangedLine(RULES)).toBe("Changes are recorded in Activity. Last changed by Lorna, 12 Oct.");
    expect(lastChangedLine({ ...RULES, updatedAt: null, updatedByName: null })).toBe("Changes are recorded in Activity.");
  });
});
