import { screenTopInset } from "./screen-top-inset";

describe("screenTopInset", () => {
  it("clears the notch itself when nothing sits above the screen", () => {
    expect(screenTopInset(47, false)).toBe(47);
  });

  it("clears nothing under the impersonation banner, which already did", () => {
    // The double clearance was the empty band above every title while a
    // superadmin viewed a store.
    expect(screenTopInset(47, true)).toBe(0);
  });
});
