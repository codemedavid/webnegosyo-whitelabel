import { canActivate, statusActionsFor, statusLabel } from "./campaign-status";

describe("statusActionsFor — what the merchant may do next", () => {
  it("offers to activate a draft", () => {
    expect(statusActionsFor("draft").map((a) => a.next)).toEqual(["active", "archived"]);
  });

  it("offers to pause an active campaign", () => {
    expect(statusActionsFor("active").map((a) => a.next)).toContain("paused");
  });

  it("offers to resume a paused campaign", () => {
    expect(statusActionsFor("paused").map((a) => a.next)).toContain("active");
  });

  it("offers nothing on an archived campaign", () => {
    // Archived is the end of the line. Reviving one would resurrect a schedule
    // the merchant deliberately retired, possibly firing it immediately.
    expect(statusActionsFor("archived")).toEqual([]);
  });

  it("labels the resume action as Resume, not Activate", () => {
    // "Activate" on something already set up reads like starting over.
    const resume = statusActionsFor("paused").find((a) => a.next === "active");
    expect(resume?.label).toBe("Resume");
  });

  it("labels the draft action as Activate", () => {
    const activate = statusActionsFor("draft").find((a) => a.next === "active");
    expect(activate?.label).toBe("Activate");
  });

  it("marks archiving as destructive so the UI can style it apart", () => {
    const archive = statusActionsFor("active").find((a) => a.next === "archived");
    expect(archive?.isDestructive).toBe(true);
  });
});

describe("canActivate — an invalid campaign must not go live", () => {
  it("allows activating a valid draft", () => {
    expect(canActivate("draft", true)).toBe(true);
  });

  it("refuses to activate a draft that does not validate", () => {
    // Activating an invalid campaign would put it on a schedule it can never
    // satisfy, so it sits looking live and never sends.
    expect(canActivate("draft", false)).toBe(false);
  });

  it("refuses to activate an archived campaign whatever its validity", () => {
    expect(canActivate("archived", true)).toBe(false);
  });
});

describe("statusLabel", () => {
  it("reads in the merchant's words, not the database's", () => {
    expect(statusLabel("draft")).toBe("Draft");
    expect(statusLabel("active")).toBe("Active");
    expect(statusLabel("paused")).toBe("Paused");
    expect(statusLabel("archived")).toBe("Archived");
  });
});
