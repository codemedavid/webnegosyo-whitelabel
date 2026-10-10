/**
 * App Store compliance guardrails (Apple Guideline 3.1.1 — Business).
 *
 * Apple rejected the merchant admin app (submission c39cb5b7, build 18) because
 * it shipped a business/organization ACCOUNT REGISTRATION flow ("Create your
 * store" sign-up), which Apple treats as an external purchase/subscription
 * mechanism for a B2B app. The fix (b349cc0) only ever landed on an unmerged
 * branch, so main kept shipping the screen; later versions passing review was
 * luck, not clearance. Stores are provisioned out of the app (paid-first web
 * onboarding), so the binary exposes ONLY sign-in for existing accounts plus
 * the read-only demo. These tests fail if any registration entry point returns.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const APP_DIR = join(__dirname, "..", "app");
const AUTH_DIR = join(APP_DIR, "(auth)");

const readAuthFile = (name: string): string =>
  readFileSync(join(AUTH_DIR, name), "utf8");

/** Every .tsx/.ts route file under app/, so an entry point anywhere is caught. */
const listRouteFiles = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listRouteFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });

const routeFilesMatching = (pattern: RegExp): readonly string[] =>
  listRouteFiles(APP_DIR).filter((file) => pattern.test(readFileSync(file, "utf8")));

describe("Apple Guideline 3.1.1 — no business account registration", () => {
  it("does not ship a signup screen file", () => {
    expect(existsSync(join(AUTH_DIR, "signup.tsx"))).toBe(false);
  });

  it("auth navigator does not register a signup screen", () => {
    expect(readAuthFile("_layout.tsx")).not.toMatch(/name=["']signup["']/);
  });

  it("no screen links to a signup route", () => {
    expect(routeFilesMatching(/\(auth\)\/signup/)).toEqual([]);
  });

  it("no screen shows a 'Create your store' registration call-to-action", () => {
    expect(routeFilesMatching(/create your store/i)).toEqual([]);
  });

  it("no screen writes to the app_signup_requests table", () => {
    expect(routeFilesMatching(/app_signup_requests/)).toEqual([]);
  });
});
