// Guardrails for the approvals screens (Phase 3). Like the other mount
// guardrails this reads sources: both screens are routable utility screens,
// never tabs (no tab bar changes for anyone), each gates itself, reaches the
// server only through the bearer client in lib/approvals/api, and has its
// doors: To review, Home, the order screen, the register and a push for the
// review screen; Manage (owner only) for the rules.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const layout = () => read("app", "(main)", "_layout.tsx");
const review = () => read("app", "(main)", "approval", "[approvalId].tsx");
const rules = () => read("app", "(main)", "approval-rules.tsx");

describe("approval screens mounting", () => {
  it.each(["approval/\\[approvalId\\]", "approval-rules"])("registers %s as a utility screen, never a tab", (name) => {
    const registration = layout().match(new RegExp(`name="${name}"[\\s\\S]{0,120}`))?.[0] ?? "";
    expect(registration).toMatch(/href:\s*null/);
  });

  it("draws both with BackHeader", () => {
    expect(review()).toMatch(/import \{ BackHeader \} from "\.\.\/\.\.\/\.\.\/components\/BackHeader";/);
    expect(read("components", "approvals", "ApprovalReview.tsx")).toMatch(/<BackHeader/);
    expect(rules()).toMatch(/<BackHeader[\s\S]{0,40}title="Approval rules"/);
  });

  it("gates each screen on its own rule", () => {
    expect(review()).toMatch(/canOpenApprovalReview\(/);
    expect(rules()).toMatch(/canEditApprovalRules\(/);
  });

  it("talks to the server only through the approvals client", () => {
    for (const source of [review(), rules(), read("components", "approvals", "ApprovalReview.tsx")]) {
      expect(source).not.toMatch(/from\(["']approval_/);
      expect(source).not.toMatch(/supabase/);
    }
    expect(rules()).toMatch(/approvalsApi\.saveRules/);
  });
});

describe("approval doors", () => {
  it("Manage offers the rules to the owner only", () => {
    const manage = read("app", "(main)", "menu.tsx");
    expect(manage).toMatch(/canEditApprovalRules/);
    expect(manage).toMatch(/\/\(main\)\/approval-rules/);
  });

  it("Activity's To review is the real inbox, and opens on it while anything waits", () => {
    const activity = read("app", "(main)", "activity.tsx");
    expect(activity).toMatch(/<ApprovalsInboxSlot/);
    expect(activity).toMatch(/useApprovalInbox\(/);
    expect(read("components", "activity", "ApprovalsInboxSlot.tsx")).toMatch(/<ApprovalsInbox /);
  });

  it("Home, the order screen and the register each mount their entry", () => {
    expect(read("app", "(main)", "dashboard.tsx")).toMatch(/<HomeNeedsReview \/>/);
    expect(read("app", "(main)", "order", "[orderId].tsx")).toMatch(/<OrderApprovalsPanel/);
    expect(read("app", "(main)", "pos-tender.tsx")).toMatch(/<AskManagerRefund/);
  });

  it("the register mirrors the refund limit and turns the server's refusal into the ask path (H1)", () => {
    const tender = read("app", "(main)", "pos-tender.tsx");
    expect(tender).toMatch(/decideRefundGate\(/);
    expect(tender).toMatch(/refundGate\.needsApproval/);
    expect(tender).toMatch(/isRefundNeedsApprovalError\(err\)/);
    expect(tender).not.toMatch(/canIssueRefund\(/);
  });

  it("pushes route through the one router and the device reports its channels", () => {
    const root = read("app", "_layout.tsx");
    expect(root).toMatch(/planPushRoute\(/);
    // Consumed responses are persisted (a cold start never replays an Approve).
    expect(root).toMatch(/readConsumed\(AsyncStorage/);
    expect(root).toMatch(/rememberConsumed\(AsyncStorage/);
    expect(root).toMatch(/channels: deviceChannels\(\)/);
    expect(root).not.toMatch(/announcementRouteFromPushData/);
  });
});

describe("no discount or write-off requests in the app (security review H3)", () => {
  it("the request sheet only knows refunds and paid cancels", () => {
    expect(read("lib", "approvals", "request-draft.ts")).toMatch(/export type RequestSheetKind = "refund" \| "cancel_paid";/);
  });

  it("no approvals component or screen files a discount or write-off request", () => {
    const dir = join(ROOT, "components", "approvals");
    const sources = [
      ...readdirSync(dir).filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx")).map((name) => read("components", "approvals", name)),
      read("app", "(main)", "order", "[orderId].tsx"),
      read("app", "(main)", "pos-tender.tsx"),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/kind[=:]\s*\{?["']discount["']/);
      expect(source).not.toMatch(/kind[=:]\s*\{?["']stock_writeoff["']/);
    }
  });
});
