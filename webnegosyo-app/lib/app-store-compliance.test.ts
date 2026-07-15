/**
 * App Store compliance guardrails (Apple Guideline 3.1.1 — Business).
 *
 * Apple rejected the merchant admin app (submission c39cb5b7, build 18) because
 * it shipped a business/organization ACCOUNT REGISTRATION flow ("Create your
 * store" sign-up), which Apple treats as an external purchase/subscription
 * mechanism for a B2B app. Merchant stores are provisioned by the WebNegosyo
 * team out-of-app; the binary must expose ONLY sign-in for existing accounts
 * plus the read-only demo. These tests fail if any registration entry point is
 * re-introduced into the shipped auth flow.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const AUTH_DIR = join(__dirname, "..", "app", "(auth)");
const readAuthFile = (name: string) => readFileSync(join(AUTH_DIR, name), "utf8");

describe("Apple Guideline 3.1.1 — no business account registration", () => {
  it("does not ship a signup screen file", () => {
    expect(existsSync(join(AUTH_DIR, "signup.tsx"))).toBe(false);
  });

  it("login screen exposes no route to a signup screen", () => {
    const login = readAuthFile("login.tsx");
    expect(login).not.toContain("(auth)/signup");
  });

  it("login screen shows no 'Create your store' registration call-to-action", () => {
    const login = readAuthFile("login.tsx");
    expect(login).not.toMatch(/create your store/i);
  });

  it("auth navigator does not register a signup screen", () => {
    const layout = readAuthFile("_layout.tsx");
    expect(layout).not.toMatch(/name=["']signup["']/);
  });

  it("no auth screen writes to the app_signup_requests table", () => {
    const login = readAuthFile("login.tsx");
    const layout = readAuthFile("_layout.tsx");
    expect(login).not.toContain("app_signup_requests");
    expect(layout).not.toContain("app_signup_requests");
  });
});
