import {
  describeBalance,
  describeMemberStatus,
  describeRemaining,
  newAdjustmentRequestId,
  type LoyaltyMemberProgress,
  type LoyaltyMemberStatus,
} from "./members";

function progress(overrides: Partial<LoyaltyMemberProgress> = {}): LoyaltyMemberProgress {
  return {
    programId: "p1",
    programName: "Loyalty Card",
    programStatus: "active",
    earnMode: "stamp",
    threshold: 10,
    rewardLabel: "₱200 off",
    balance: 7,
    lifetimeEarned: 7,
    rewardsIssued: 0,
    rewardsAvailable: 0,
    lastActivityAt: null,
    remaining: 3,
    percent: 70,
    isDormant: false,
    ...overrides,
  };
}

describe("describeRemaining", () => {
  it("says how many visits are left, in the singular when one", () => {
    expect(describeRemaining(progress())).toBe("3 more visits");
    expect(describeRemaining(progress({ remaining: 1 }))).toBe("1 more visit");
  });

  it("counts points rather than visits on a points card", () => {
    expect(describeRemaining(progress({ earnMode: "points", remaining: 40 }))).toBe(
      "40 more points",
    );
  });

  it("never says zero more — that is a claim, not a countdown", () => {
    expect(describeRemaining(progress({ remaining: 0 }))).toBe("Ready to claim");
    expect(describeRemaining(progress({ rewardsAvailable: 1, remaining: 8 }))).toBe(
      "Ready to claim",
    );
  });

  it("admits when progress cannot be worked out", () => {
    expect(describeRemaining(progress({ remaining: null }))).toBe("Progress unavailable");
    expect(describeRemaining(null)).toBe("No card yet");
  });
});

describe("describeBalance", () => {
  it("shows the balance against the threshold", () => {
    expect(describeBalance(progress({ balance: 9 }))).toBe("9 / 10");
  });

  it("drops the threshold when the rules cannot be read", () => {
    expect(describeBalance(progress({ balance: 4, threshold: 0 }))).toBe("4");
  });

  it("keeps a fractional points balance readable", () => {
    expect(describeBalance(progress({ balance: 96.4, threshold: 100 }))).toBe("96.40 / 100");
  });
});

describe("describeMemberStatus", () => {
  it("labels every status the platform can send", () => {
    const statuses: LoyaltyMemberStatus[] = [
      "reward_ready",
      "almost_there",
      "dormant",
      "new",
      "earning",
    ];
    for (const status of statuses) {
      expect(describeMemberStatus(status).label.length).toBeGreaterThan(0);
    }
  });

  it("falls back rather than rendering undefined for a status it does not know", () => {
    expect(describeMemberStatus("invented" as LoyaltyMemberStatus).label).toBe("Collecting");
  });
});

describe("newAdjustmentRequestId", () => {
  it("mints an id the platform's idempotency check will accept", () => {
    const id = newAdjustmentRequestId();

    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("mints a different id each time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newAdjustmentRequestId()));

    expect(ids.size).toBe(50);
  });
});
