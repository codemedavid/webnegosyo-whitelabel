// The demo store's sample shift is the first shift report a reviewer or a
// prospect ever sees. Its figures must add up the way a real one does: QA
// found "Cash ₱810 · 4 payments" over receipts that took ₱820 in 3 cash sales.
import { sampleShiftSales } from "./shift-sales-sample";

const NOW = Date.parse("2026-11-05T11:35:00.000Z");
const sum = (values: readonly (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0);

describe("the demo store's sample shift", () => {
  const report = sampleShiftSales(NOW);
  const summary = report.summary!;
  const sold = report.receipts.filter((r) => r.status !== "void");
  const paid = report.receipts.filter((r) => r.status === "paid");
  const voided = report.receipts.filter((r) => r.status === "void");
  const payments = report.payments ?? [];
  const orderTypes = report.orderTypes ?? [];
  const channels = report.channels ?? [];
  const items = report.items ?? [];

  it("counts its orders, voids and net sales from its own receipts", () => {
    expect(summary.orders).toBe(sold.length);
    expect(summary.voidCount).toBe(voided.length);
    expect(summary.voidCents).toBe(sum(voided.map((r) => r.totalCents)));
    expect(summary.netCents).toBe(sum(sold.map((r) => r.totalCents)));
    expect(summary.grossCents).toBe(summary.netCents + summary.discountCents);
  });

  it("splits net sales into collected + unpaid", () => {
    expect(summary.collectedCents).toBe(sum(paid.map((r) => r.totalCents)));
    expect(summary.unpaidCents).toBe(
      sum(report.receipts.filter((r) => r.status === "unpaid").map((r) => r.totalCents)),
    );
    expect(summary.collectedCents + summary.unpaidCents).toBe(summary.netCents);
  });

  it("fills every breakdown", () => {
    expect([payments.length, orderTypes.length, channels.length, items.length].every((n) => n > 0)).toBe(true);
  });

  it("gives each payment method exactly its paid receipts' money and count", () => {
    for (const payment of payments) {
      const mine = paid.filter((r) => r.methodLabel === payment.label);
      expect({ method: payment.label, cents: payment.cents, count: payment.count }).toEqual({
        method: payment.label,
        cents: sum(mine.map((r) => r.totalCents)),
        count: mine.length,
      });
    }
    expect(sum(payments.map((p) => p.cents))).toBe(summary.collectedCents);
  });

  it("breaks net sales down by order type, channel and item without a centavo of drift", () => {
    for (const type of orderTypes) {
      const mine = sold.filter((r) => r.orderTypeLabel === type.label);
      expect({ type: type.label, orders: type.orders, net: type.netCents }).toEqual({
        type: type.label,
        orders: mine.length,
        net: sum(mine.map((r) => r.totalCents)),
      });
    }
    expect(sum(channels.map((c) => c.netCents))).toBe(summary.netCents);
    expect(sum(channels.map((c) => c.orders))).toBe(summary.orders);
    expect(sum(items.map((i) => i.netCents))).toBe(summary.netCents);
  });

  it("numbers its receipts first to last", () => {
    expect(report.firstNumber).toBe(report.receipts[0].number);
    expect(report.lastNumber).toBe(report.receipts[report.receipts.length - 1].number);
  });
});
