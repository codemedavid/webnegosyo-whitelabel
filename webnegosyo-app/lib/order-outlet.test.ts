import { posOutletContext } from "./order-outlet";


describe("posOutletContext", () => {
  it("stamps the branch a confined register belongs to", () => {
    expect(posOutletContext("outlet-central", "Central Cignal")).toEqual({
      id: "outlet-central",
      name: "Central Cignal",
    });
  });

  it("still attributes the sale when the branch name is unknown", () => {
    // The name is a display snapshot; the id is the attribution. Requiring both
    // meant a failed outlets lookup sent a counter sale out unattributed even
    // though the session knew which branch rang it. Falling back to the id
    // mirrors branch-kpis' label handling.
    expect(posOutletContext("outlet-central", null)).toEqual({
      id: "outlet-central",
      name: "outlet-central",
    });
  });

  it("stamps nothing for a single-location register", () => {
    expect(posOutletContext(null, null)).toBeNull();
    expect(posOutletContext("", "Central Cignal")).toBeNull();
  });
});
