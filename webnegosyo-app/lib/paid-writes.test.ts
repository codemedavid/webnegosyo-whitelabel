/**
 * Every place the app writes `payment_status = paid`, and why it may.
 *
 * Koko Coffee, 2026-11-24: handing over a "pay later" sale wrote `paid` with
 * no method and no ledger row, so ₱1,610 of their November sat under "Paid,
 * method not picked" and cash + GCash never added up to sales (72 orders,
 * ≈ ₱26,000, eight stores in 30 days). The write itself was one line in a
 * shared helper, called from three screens.
 *
 * So a `paid` write is allowed only where the money is ALREADY recorded under
 * a method: the register's tender (method on the sale), a ledger that squares
 * the bill, or an order that carries the method the customer chose. A new
 * write site fails this test until it is added below with its reason — read
 * `lib/order-payment-prompt.ts` (`handoverPaidRoute`) before adding one.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const SCANNED = ["app", "components", "lib", "stores", "hooks"];
const PAID_WRITE = /(paymentStatus|payment_status)"?\s*:\s*["']paid["']/;

/** file → how many paid writes it holds, and why each is safe. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  "app/(main)/pos-tender.tsx": {
    count: 2,
    why: "a sale paid at the register carries its method (or a split's ledger rows)",
  },
  "lib/use-order-payment-flow.ts": {
    count: 3,
    why: "online method checked at confirm; handover of an order WITH its method; settle once the ledger squares",
  },
  "lib/order-status-change.ts": {
    count: 1,
    why: "syncPaidAfterHandover runs only when the ledger already holds the whole bill (shouldSyncPaid)",
  },
  "lib/bill/use-bill-collect.ts": { count: 1, why: "settleBill marks paid only once the ledger rows square the order" },
  "lib/backends/supabase-adapter.ts": {
    count: 1,
    why: "an idempotent createOrder retry finishing a sale that was paid at the tender",
  },
  "lib/offline/sync-outbox.ts": { count: 1, why: "replaying a sale that was paid at the tender" },
  "lib/tutorial/mock-data.ts": { count: 4, why: "tutorial fixtures, never written" },
  "lib/approvals/test-fixtures.ts": { count: 1, why: "test fixtures, never written" },
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function paidWriteCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const top of SCANNED) {
    const dir = path.join(ROOT, top);
    if (!fs.existsSync(dir)) continue;
    for (const file of sourceFiles(dir)) {
      const hits = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => PAID_WRITE.test(line)).length;
      if (hits > 0) counts[path.relative(ROOT, file).split(path.sep).join("/")] = hits;
    }
  }
  return counts;
}

describe("payment_status = paid writes", () => {
  it("only happen where the money is already recorded under a method", () => {
    const found = paidWriteCounts();
    const unexpected = Object.entries(found)
      .filter(([file, count]) => (ALLOWED[file]?.count ?? 0) < count)
      .map(([file, count]) => `${file} (${count})`);
    expect(unexpected).toEqual([]);
  });

  it("the shared handover helper no longer marks a bill paid on its own", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/order-status-change.ts"), "utf8");
    expect(source).not.toMatch(/markPaidAfterHandover/);
    expect(source).toMatch(/isLedgerSquareAtHandover/);
  });

  it("the allow-list stays honest (no stale entries)", () => {
    const found = paidWriteCounts();
    const stale = Object.keys(ALLOWED).filter((file) => !(file in found));
    expect(stale).toEqual([]);
  });
});
