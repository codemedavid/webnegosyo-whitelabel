import { billCandidates } from "./bill-candidates";

const base = { _creationTime: 1, customerName: "Jun", total: 100, paymentStatus: "pending", status: "confirmed", amountPaid: 0 };

describe("billCandidates", () => {
  it("offers unpaid live orders that are not on the bill, its own table first, newest next", () => {
    const rows = billCandidates(
      [
        { ...base, _id: "on-bill", customerData: { table_number: "4" } },
        { ...base, _id: "other-table", _creationTime: 9, customerData: { table_number: "7" } },
        { ...base, _id: "same-table", _creationTime: 2, customerData: { table_number: "4" } },
        { ...base, _id: "cancelled", status: "cancelled" },
        { ...base, _id: "paid", paymentStatus: "paid" },
      ],
      { onBill: ["on-bill"], table: "4" },
    );

    expect(rows.map((row) => row._id)).toEqual(["same-table", "other-table"]);
    expect(rows[0].table).toBe("4");
  });
});
