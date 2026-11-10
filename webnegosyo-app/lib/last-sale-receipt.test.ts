/**
 * The sale-complete banner's receipt button reads "Reprint" only once a
 * receipt for that sale really came out of the printer. `isReceiptPrinted`
 * used to record that the register SENT the receipt — with the printer off,
 * the cashier's first real copy was stamped REPRINT.
 */
import { usePosLastSaleStore } from "../stores/pos-last-sale-store";
import { printLastSaleReceipt, trackTenderReceiptPrint } from "./last-sale-receipt";
import type { LastSale } from "../stores/pos-last-sale-store";

const receipt = { _id: "order-1", _creationTime: 1, customerName: "Walk-in", customerContact: "", total: 450 };
const notice = { tone: "paid" as const, title: "Give ₱50.00 change", detail: "₱450.00 sale saved · paid" };

function showSale(extra: Partial<Omit<LastSale, "shownAt">> = {}) {
  usePosLastSaleStore.getState().show({ orderId: "order-1", notice, canOpenOrder: true, receipt, isReceiptPrinted: false, ...extra });
  return usePosLastSaleStore.getState().lastSale as LastSale;
}

const latest = () => usePosLastSaleStore.getState().lastSale;
const markPrinted = (orderId: string) => usePosLastSaleStore.getState().markReceiptPrinted(orderId);

beforeEach(() => usePosLastSaleStore.setState({ lastSale: null }));

describe("markReceiptPrinted", () => {
  it("marks the sale on screen, and ignores an older sale's late answer", () => {
    showSale();
    markPrinted("order-0");
    expect(latest()?.isReceiptPrinted).toBe(false);
    markPrinted("order-1");
    expect(latest()?.isReceiptPrinted).toBe(true);
  });
});

describe("trackTenderReceiptPrint", () => {
  it("marks the sale printed only after the tender print succeeds", async () => {
    showSale();
    await trackTenderReceiptPrint("order-1", Promise.resolve(true), markPrinted);
    expect(latest()?.isReceiptPrinted).toBe(true);
  });

  it("leaves it unprinted when the printer failed or threw", async () => {
    showSale();
    await expect(trackTenderReceiptPrint("order-1", Promise.resolve(false), markPrinted)).resolves.toBe(false);
    await expect(trackTenderReceiptPrint("order-1", Promise.reject(new Error("bt")), markPrinted)).resolves.toBe(false);
    expect(latest()?.isReceiptPrinted).toBe(false);
  });
});

describe("printLastSaleReceipt (the banner's button)", () => {
  const jobs = () => ({ print: jest.fn(async () => true), reprint: jest.fn(async () => true) });

  it("tender print failed: the banner prints a FIRST copy, then a second tap is a REPRINT", async () => {
    const sale = showSale();
    const { print, reprint } = jobs();
    await printLastSaleReceipt(sale, { print, reprint, latest, markPrinted });
    expect(print).toHaveBeenCalledWith(receipt);
    expect(latest()?.isReceiptPrinted).toBe(true);

    await printLastSaleReceipt(latest() as LastSale, { print, reprint, latest, markPrinted });
    expect(reprint).toHaveBeenCalledTimes(1);
  });

  it("a failed banner print stays unprinted, so the next tap is still a first copy", async () => {
    const sale = showSale();
    const print = jest.fn(async () => false);
    const reprint = jest.fn(async () => true);
    await expect(printLastSaleReceipt(sale, { print, reprint, latest, markPrinted })).resolves.toBe(false);
    expect(latest()?.isReceiptPrinted).toBe(false);
  });

  it("tapped while the tender print is still running: waits for it, then reprints if it came out", async () => {
    let finish: (ok: boolean) => void = () => {};
    const tender = new Promise<boolean>((resolve) => (finish = resolve));
    const job = trackTenderReceiptPrint("order-1", tender, markPrinted);
    const sale = showSale({ receiptPrintJob: job });
    const { print, reprint } = jobs();

    const tap = printLastSaleReceipt(sale, { print, reprint, latest, markPrinted });
    finish(true);
    await tap;
    expect(print).not.toHaveBeenCalled();
    expect(reprint).toHaveBeenCalledWith(receipt);
  });

  it("does nothing for a sale without a receipt (pay later)", async () => {
    const sale = showSale({ receipt: undefined });
    const { print, reprint } = jobs();
    await expect(printLastSaleReceipt(sale, { print, reprint, latest, markPrinted })).resolves.toBe(false);
    expect(print).not.toHaveBeenCalled();
  });
});
