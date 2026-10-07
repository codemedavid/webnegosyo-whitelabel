/**
 * Guardrail: no screen may hard-code the backend it tells the platform about.
 *
 * The QR scanner sent `backend: "convex"` on every customer capture even though
 * `useSafeMutation` had written the order to the platform Supabase for platform
 * stores. The capture was then filed in the external-order ledger instead of on
 * the order: the sale vanished from the guest's history and their lifetime
 * totals were restated from the ledger alone.
 *
 * Jest here runs only the pure-logic roots, so — like the other mount
 * guardrails in this package — this asserts on the sources.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..");
const SOURCE_DIRS = ["app", "components", "lib", "stores"];
// A VALUE (followed by `,`, `}` or end of line), not a type union member.
const LITERAL_BACKEND =
  /\bbackend:\s*["'](convex|platform|supabase|platform_supabase|tenant_supabase)["'](\s+as\s+const)?\s*(,|\}|$)/m;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) return [];
    return [path];
  });
}

describe("order bookkeeping names the backend that wrote the order", () => {
  it("no app source passes a literal backend value", () => {
    const offenders = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((file) => LITERAL_BACKEND.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("the scanner derives the capture backend from the write path", () => {
    const scan = readFileSync(join(ROOT, "app", "(main)", "scan.tsx"), "utf8");

    expect(scan).toMatch(/useOrderWriteBackend\(\)/);
    expect(scan).toMatch(/backend: writeBackend/);
  });
});
