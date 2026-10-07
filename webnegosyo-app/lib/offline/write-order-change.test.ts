import { isQueuedOrderWrite, writeOrderChange, type WriteOrderChangeInput } from "./write-order-change";
import type { QueuedOrderEdit } from "./order-edits";

jest.mock("./connectivity", () => ({
  isOffline: jest.fn(() => false),
  reportOffline: jest.fn(),
  reportOnline: jest.fn(),
}));

function networkError(): Error {
  return new TypeError("Network request failed");
}

function setup(overrides: Partial<WriteOrderChangeInput> = {}) {
  const live = jest.fn().mockResolvedValue("ok");
  const enqueue = jest.fn<Promise<void>, [QueuedOrderEdit]>().mockResolvedValue(undefined);
  const input: WriteOrderChangeInput = {
    ref: "orders:updateOrderStatus",
    args: { orderId: "order-1", status: "ready" },
    tenantId: "tenant-1",
    backend: "platform",
    live,
    enqueue,
    isOffline: () => false,
    isOrderOnDeviceOnly: () => false,
    hasEarlierEdits: () => false,
    now: () => 42,
    newEditId: () => "edit-1",
    ...overrides,
  };
  return { input, live, enqueue };
}

describe("writeOrderChange", () => {
  it("writes straight to the server when it can", async () => {
    const { input, live, enqueue } = setup();

    await expect(writeOrderChange(input)).resolves.toBe("ok");

    expect(live).toHaveBeenCalledWith({ orderId: "order-1", status: "ready" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("queues at once while offline", async () => {
    const { input, live, enqueue } = setup({ isOffline: () => true });

    const result = await writeOrderChange(input);

    expect(isQueuedOrderWrite(result)).toBe(true);
    expect(live).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith({
      editId: "edit-1",
      tenantId: "tenant-1",
      backend: "platform",
      orderId: "order-1",
      ref: "orders:updateOrderStatus",
      args: { orderId: "order-1", status: "ready" },
      createdAt: 42,
      attempts: 0,
      lastError: null,
    });
  });

  it("queues a change to an order the server does not hold yet, even online", async () => {
    const { input, live } = setup({ isOrderOnDeviceOnly: () => true });

    expect(isQueuedOrderWrite(await writeOrderChange(input))).toBe(true);
    expect(live).not.toHaveBeenCalled();
  });

  it("queues behind earlier unsynced changes so they land in order", async () => {
    const { input, live } = setup({ hasEarlierEdits: () => true });

    expect(isQueuedOrderWrite(await writeOrderChange(input))).toBe(true);
    expect(live).not.toHaveBeenCalled();
  });

  it("queues a status change when the connection drops mid-write", async () => {
    const { input, enqueue } = setup({ live: jest.fn().mockRejectedValue(networkError()) });

    expect(isQueuedOrderWrite(await writeOrderChange(input))).toBe(true);
    expect(enqueue).toHaveBeenCalled();
  });

  it("shows a refusal instead of queueing it", async () => {
    const { input, enqueue } = setup({ live: jest.fn().mockRejectedValue(new Error("Not allowed")) });

    await expect(writeOrderChange(input)).rejects.toThrow("Not allowed");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("never replays a payment whose write may already have landed", async () => {
    const { input, enqueue } = setup({
      ref: "orders:recordPayment",
      args: { orderId: "order-1", kind: "charge", amount: 100 },
      live: jest.fn().mockRejectedValue(networkError()),
    });

    await expect(writeOrderChange(input)).rejects.toThrow("Network request failed");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("queues a payment taken while known to be offline", async () => {
    const { input, live } = setup({
      ref: "orders:recordPayment",
      args: { orderId: "order-1", kind: "charge", amount: 100 },
      isOffline: () => true,
    });

    expect(isQueuedOrderWrite(await writeOrderChange(input))).toBe(true);
    expect(live).not.toHaveBeenCalled();
  });

  it("refuses a change with no order id", async () => {
    const { input } = setup({ args: { status: "ready" } });
    await expect(writeOrderChange(input)).rejects.toThrow(/order/i);
  });
});
