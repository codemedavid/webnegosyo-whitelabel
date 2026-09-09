/**
 * Guardrails for where the query cache is allowed to be touched.
 *
 * Jest here only runs pure roots, so — as with the other mount guardrails in
 * this directory — this asserts on the source. What it locks down cannot be
 * seen from any unit test of the modules themselves:
 *  - the cache provider sits ABOVE the Convex provider, so the tree shape the
 *    Convex placeholder client exists to keep stable stays stable;
 *  - `lib/hooks.ts` remains the ONE dispatch point — no screen reaches the
 *    cache or the platform hook directly;
 *  - the five pull-to-refresh screens really refetch instead of showing a timer.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** Every non-test .ts/.tsx source under the given top-level directories. */
function sourceFiles(dirs: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
  };
  dirs.forEach((dir) => walk(join(ROOT, dir)));
  return out;
}

const REFRESH_SCREENS = ["dashboard", "orders", "analytics", "trends", "growth"] as const;

describe("query layer wiring", () => {
  it("mounts the cache provider above the Convex provider in the root layout", () => {
    const layout = read("app", "_layout.tsx");
    const queryAt = layout.indexOf("<QueryProvider>");
    const convexAt = layout.indexOf("<ConvexAuthProvider>");
    expect(queryAt).toBeGreaterThan(-1);
    expect(convexAt).toBeGreaterThan(queryAt);
  });

  it("keeps lib/hooks.ts the sole importer of the platform query hook", () => {
    const importers = sourceFiles(["app", "components", "hooks", "lib", "stores"]).filter((file) =>
      /from\s+["'][^"']*use-platform-query["']/.test(readFileSync(file, "utf8"))
    );
    expect(importers.map((f) => f.replace(ROOT, ""))).toEqual(["/lib/hooks.ts"]);
  });

  it("lets no screen or component import TanStack directly", () => {
    const offenders = sourceFiles(["app", "components", "hooks"]).filter((file) =>
      /@tanstack\/(react-query|query-core)/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it.each(REFRESH_SCREENS)("%s pull-to-refresh awaits its queries instead of a timer", (screen) => {
    const source = read("app", "(main)", `${screen}.tsx`);
    expect(source).not.toMatch(/setTimeout\(\(\) => setRefreshing\(false\)/);
    expect(source).toMatch(/refreshWithMinSpinner\(/);
  });

  it("closes the previous Convex client when its URL changes", () => {
    expect(read("lib", "convex-provider.tsx")).toMatch(/\.close\(\)/);
  });
});
