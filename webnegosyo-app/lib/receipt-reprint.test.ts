import { markReprint } from "./receipt-reprint";

const order = {
  _id: "o1",
  _creationTime: 1,
  customerName: "Walk-in",
  customerContact: "",
  total: 100,
};

describe("markReprint", () => {
  it("stamps the copy with when it was printed", () => {
    expect(markReprint(order, 42).reprint).toEqual({ at: 42 });
  });

  it("returns a new object and leaves the order as it was", () => {
    const marked = markReprint(order, 42);
    expect(marked).not.toBe(order);
    expect(order).not.toHaveProperty("reprint");
    expect({ ...marked, reprint: undefined }).toEqual({ ...order, reprint: undefined });
  });
});
