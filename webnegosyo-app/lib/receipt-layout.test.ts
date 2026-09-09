import { formatReceipt } from "./receipt-formatter";
import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  parseReceiptLayout,
  renderReceipt,
  renderReceiptSegments,
  resolveReceiptLayout,
} from "./receipt-layout";

/**
 * The layout engine is what lets a tenant rearrange their receipt. Its one
 * non-negotiable guarantee is that the Classic preset prints byte-for-byte
 * what `formatReceipt` has always printed — every live tenant is on Classic
 * until they publish a custom layout.
 */

const baseOrder = {
  _id: "abcdef1234567890",
  _creationTime: Date.UTC(2026, 6, 26, 4, 30), // fixed instant — no clock reads
  customerName: "Walk-in",
  customerContact: "n/a",
  total: 327.5,
  items: [
    { menuItemName: "Latte", quantity: 2, subtotal: 240 },
    { menuItemName: "Croissant", quantity: 1, subtotal: 87.5 },
  ],
};

const cashOrder = {
  ...baseOrder,
  paymentMethod: "Cash",
  cashTendered: 500,
  changeDue: 172.5,
};

const discountedOrder = {
  ...baseOrder,
  total: 300,
  customerData: {
    discount: {
      total: 27.5,
      deliveryDiscount: 0,
      lines: [{ label: "WELCOME10", amount: 27.5, code: "WELCOME10" }],
      allocationsByLine: {},
    },
  },
};

const config = { storeName: "Kape Co", width: 32 };

function linesOf(receipt: string): string[] {
  return receipt.split("\n");
}

describe("renderReceipt — Classic preset regression lock", () => {
  it("prints the base order byte-for-byte like formatReceipt", () => {
    expect(renderReceipt(baseOrder, config, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(baseOrder, config),
    );
  });

  it("prints a POS cash sale byte-for-byte like formatReceipt", () => {
    expect(renderReceipt(cashOrder, config, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(cashOrder, config),
    );
  });

  it("prints a discounted sale byte-for-byte like formatReceipt", () => {
    expect(renderReceipt(discountedOrder, config, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(discountedOrder, config),
    );
  });

  it("prints a bundle + address receipt byte-for-byte like formatReceipt", () => {
    const bundleOrder = {
      ...baseOrder,
      total: 546.5,
      items: [
        ...baseOrder.items,
        {
          menuItemName: "Burger",
          quantity: 1,
          subtotal: 120,
          isBundleItem: true,
          bundleId: "b1",
          bundleName: "Meal Deal",
          slotName: "Main",
          addons: [{ name: "Cheese", price: 15 }],
        },
        {
          menuItemName: "Fries",
          quantity: 1,
          subtotal: 99,
          isBundleItem: true,
          bundleId: "b1",
          bundleName: "Meal Deal",
          variation: "Large",
          specialInstructions: "Extra salt",
        },
      ],
    };
    const withAddress = { ...config, storeAddress: "12 Mabini St" };
    expect(renderReceipt(bundleOrder, withAddress, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(bundleOrder, withAddress),
    );
  });
});

describe("renderReceipt — custom block arrangements", () => {
  it("renders blocks in the order the layout says, not a fixed order", () => {
    const lines = linesOf(
      renderReceipt(baseOrder, config, {
        version: 1,
        theme: "classic",
        blocks: [
          { kind: "text", text: "Thanks for coming!", align: "center" },
          { kind: "businessName" },
        ],
      }),
    );
    const thanksIdx = lines.findIndex((l) => l.includes("Thanks for coming!"));
    const nameIdx = lines.findIndex((l) => l.includes("KAPE CO"));
    expect(thanksIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeGreaterThan(thanksIdx);
  });

  it("aligns text blocks left, center, and right", () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [
        { kind: "text", text: "left", align: "left" },
        { kind: "text", text: "mid", align: "center" },
        { kind: "text", text: "right", align: "right" },
      ],
    });
    const lines = linesOf(receipt);
    expect(lines[0]).toBe("left");
    expect(lines[1]).toBe(" ".repeat(Math.floor((32 - 3) / 2)) + "mid");
    expect(lines[2]).toBe(" ".repeat(32 - 5) + "right");
  });

  it("summarizes items as a count when the layout asks for itemsSummary", () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "itemsSummary" }],
    });
    expect(receipt).toContain("Items: 3"); // 2 lattes + 1 croissant
    expect(receipt).not.toContain("Latte");
  });

  it("prints the customer contact for a contact block, but never a placeholder", () => {
    const withPhone = renderReceipt(
      { ...baseOrder, customerContact: "09171234567" },
      config,
      { version: 1, blocks: [{ kind: "contact" }] },
    );
    expect(withPhone).toContain("Contact: 09171234567");

    const placeholder = renderReceipt(baseOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "contact" }],
    });
    expect(placeholder).not.toContain("Contact:");
  });

  it("prints a tracking link for a qr block when the config carries one", () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "qr" }],
    });
    expect(receipt).toBe(""); // no tracking URL configured → block is silent

    const withUrl = renderReceipt(
      baseOrder,
      { ...config, trackingUrl: "https://kape.co/t/ABC123" },
      { version: 1, blocks: [{ kind: "qr" }] },
    );
    expect(withUrl).toContain("Scan to track your order");
    expect(withUrl).toContain("https://kape.co/t/ABC123");
  });

  it("keeps every custom-layout line within the paper width", () => {
    const receipt = renderReceipt(
      { ...baseOrder, customerContact: "0".repeat(60) },
      { ...config, trackingUrl: "https://example.com/" + "x".repeat(80) },
      {
        version: 1,
        blocks: [
          { kind: "businessName" },
          { kind: "text", text: "y".repeat(90), align: "center" },
          { kind: "contact" },
          { kind: "qr" },
          { kind: "items" },
          { kind: "totals" },
        ],
      },
    );
    for (const l of linesOf(receipt)) {
      expect(l.length).toBeLessThanOrEqual(32);
    }
  });
});

describe("built-in presets", () => {
  it("Compact still prints the items and the authoritative total", () => {
    const receipt = renderReceipt(baseOrder, config, COMPACT_RECEIPT_LAYOUT);
    expect(receipt).toContain("Latte");
    expect(receipt).toContain("P327.50");
  });

  it("Detailed prints everything Classic does plus the contact line", () => {
    const receipt = renderReceipt(
      { ...baseOrder, customerContact: "09171234567" },
      config,
      DETAILED_RECEIPT_LAYOUT,
    );
    expect(receipt).toContain("KAPE CO");
    expect(receipt).toContain("Contact: 09171234567");
    expect(receipt).toContain("TOTAL");
  });
});

describe("order detail blocks — granular meta + fill-in lines", () => {
  const detailOrder = { ...baseOrder, customerName: "Maria", orderType: "Dine-in" };

  it("prints each order detail as its own block, honoring custom labels", () => {
    const receipt = renderReceipt(detailOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [
        { kind: "orderNumber" },
        { kind: "orderDate" },
        { kind: "customerName", label: "Guest" },
        { kind: "orderType" },
      ],
    });
    const lines = linesOf(receipt);
    expect(lines[0]).toBe("Order #: 34567890");
    expect(lines[1]).toMatch(/^Date: /);
    expect(lines[2]).toBe("Guest: Maria");
    expect(lines[3]).toBe("Type: Dine-in");
  });

  it("stacked in the classic order, the granular blocks match orderMeta exactly", () => {
    const granular = renderReceipt(detailOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [
        { kind: "orderNumber" },
        { kind: "orderDate" },
        { kind: "customerName" },
        { kind: "orderType" },
      ],
    });
    const composite = renderReceipt(detailOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "orderMeta" }],
    });
    expect(granular).toBe(composite);
  });

  it("renders a fill-in line as a label plus a writable rule to the paper edge", () => {
    const receipt = renderReceipt(detailOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "fillIn", label: "Received by" }],
    });
    const [line] = linesOf(receipt);
    expect(line).toHaveLength(32);
    expect(line!.startsWith("Received by: ")).toBe(true);
    expect(line!.endsWith("___")).toBe(true);
  });

  it("parses the detail blocks and rejects malformed ones", () => {
    expect(
      parseReceiptLayout({
        version: 1,
        blocks: [
          { kind: "orderNumber" },
          { kind: "orderDate", label: "Printed" },
          { kind: "customerName" },
          { kind: "orderType" },
          { kind: "fillIn", label: "Name" },
        ],
      }),
    ).not.toBeNull();
    expect(parseReceiptLayout({ version: 1, blocks: [{ kind: "fillIn" }] })).toBeNull();
    expect(parseReceiptLayout({ version: 1, blocks: [{ kind: "fillIn", label: "" }] })).toBeNull();
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "orderNumber", label: 42 }] }),
    ).toBeNull();
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "orderDate", label: "Y".repeat(33) }] }),
    ).toBeNull();
  });
});

describe("logo block — printed as a raster, silent everywhere else", () => {
  it("emits an image segment when the store has a logo", () => {
    const segments = renderReceiptSegments(
      baseOrder,
      { ...config, logoUrl: "https://ik.example/logo.png" },
      { version: 1, blocks: [{ kind: "logo" }, { kind: "businessName" }] },
    );
    expect(segments).toEqual([
      { type: "image", url: "https://ik.example/logo.png" },
      { type: "text", text: expect.stringContaining("KAPE CO") },
    ]);
  });

  it("prints nothing without a configured logo, and nothing in flat text", () => {
    const layout = {
      version: 1 as const,
      blocks: [{ kind: "logo" as const }, { kind: "text" as const, text: "after" }],
    };
    expect(linesOf(renderReceipt(baseOrder, config, layout))).toEqual(["after"]);
    expect(
      linesOf(renderReceipt(baseOrder, { ...config, logoUrl: "https://x/l.png" }, layout)),
    ).toEqual(["after"]);
  });

  it("parses as a simple block", () => {
    expect(parseReceiptLayout({ version: 1, blocks: [{ kind: "logo" }] })).not.toBeNull();
  });
});

describe("parseReceiptLayout — untrusted tenant JSON", () => {
  it("accepts a valid layout", () => {
    const parsed = parseReceiptLayout({
      version: 1,
      blocks: [{ kind: "businessName" }, { kind: "items" }],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.blocks).toHaveLength(2);
  });

  it("rejects garbage, wrong versions, and unknown block kinds", () => {
    expect(parseReceiptLayout(null)).toBeNull();
    expect(parseReceiptLayout("classic")).toBeNull();
    expect(parseReceiptLayout({ version: 2, blocks: [] })).toBeNull();
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "explode" }] }),
    ).toBeNull();
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "text" }] }),
    ).toBeNull(); // text block without text
  });

  it("rejects an empty block list — a blank receipt is never intended", () => {
    expect(parseReceiptLayout({ version: 1, blocks: [] })).toBeNull();
  });
});

describe("resolveReceiptLayout — what the printer actually uses", () => {
  it("prints Modern when the tenant has no saved layout", () => {
    expect(resolveReceiptLayout(null)).toBe(MODERN_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout(undefined)).toBe(MODERN_RECEIPT_LAYOUT);
  });

  it("falls back to Modern when the saved layout is invalid", () => {
    expect(resolveReceiptLayout({ version: 99 })).toBe(MODERN_RECEIPT_LAYOUT);
  });

  it("resolves preset names so a tenant row can store just a string", () => {
    expect(resolveReceiptLayout("compact")).toBe(COMPACT_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout("detailed")).toBe(DETAILED_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout("classic")).toBe(CLASSIC_RECEIPT_LAYOUT);
  });

  it("uses a valid saved custom layout as-is", () => {
    const custom = { version: 1, blocks: [{ kind: "businessName" as const }] };
    const resolved = resolveReceiptLayout(custom);
    expect(resolved.blocks).toHaveLength(1);
    expect(resolved.blocks[0]?.kind).toBe("businessName");
  });
});

describe("service charge on the printed receipt", () => {
  /**
   * `orderSummaryRows` has always been willing to emit a service-charge row,
   * and `RECEIPT_LABELS` has always had a caption for it. The renderer simply
   * never passed the figure, so a serviced order printed items that did not
   * add up to its own TOTAL with nothing accounting for the gap.
   */
  const servicedOrder = {
    ...baseOrder,
    serviceCharge: 32.75,
    total: 360.25,
  };

  it("prints the charge, captioned, between the items and the total", () => {
    const lines = linesOf(renderReceipt(servicedOrder, config, CLASSIC_RECEIPT_LAYOUT));
    const charge = lines.find((line) => line.startsWith("Service Charge:"));

    expect(charge).toContain("P32.75");
  });

  it("earns a subtotal line, so the charge has a stated starting point", () => {
    const lines = linesOf(renderReceipt(servicedOrder, config, CLASSIC_RECEIPT_LAYOUT));

    expect(lines.some((line) => line.startsWith("Subtotal:"))).toBe(true);
  });

  it("reconciles, so the mismatch warning stays silent", () => {
    // The renderer warns when its own arithmetic disagrees with `order.total`.
    // That check omitted the service charge, so every serviced order would
    // have cried corruption at a merchant who had none — and trained them to
    // ignore the one signal meant to catch the real thing.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    renderReceipt(servicedOrder, config, CLASSIC_RECEIPT_LAYOUT);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("prints nothing for an order that was never serviced", () => {
    // A P0.00 row on every pickup chit is noise, and wastes a line of paper
    // on a 32-column roll.
    const lines = linesOf(renderReceipt(baseOrder, config, CLASSIC_RECEIPT_LAYOUT));

    expect(lines.some((line) => line.startsWith("Service Charge:"))).toBe(false);
  });

  it("still prints Classic byte-for-byte when there is no charge", () => {
    // The regression lock every live tenant depends on: adding a field must
    // not shift a single column on the receipts already in use.
    expect(renderReceipt(baseOrder, config, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(baseOrder, config),
    );
  });
});

describe("table number on the receipt", () => {
  const seated = {
    ...baseOrder,
    customerName: "Maria",
    orderType: "Dine-in",
    customerData: { table_number: "12" },
  };

  it("prints the table as its own block, honoring a custom label", () => {
    const receipt = renderReceipt(seated, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "tableNumber" }, { kind: "tableNumber", label: "Mesa" }],
    });
    expect(linesOf(receipt)).toEqual(["Table: 12", "Mesa: 12"]);
  });

  it("stays silent when the order has no table", () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "tableNumber" }, { kind: "text", text: "after" }],
    });
    expect(linesOf(receipt)).toEqual(["after"]);
  });

  it("reads the snake_case blob a Supabase row carries", () => {
    const receipt = renderReceipt(
      { ...baseOrder, customer_data: { table_number: "B4" } },
      config,
      { version: 1, theme: "classic", blocks: [{ kind: "tableNumber" }] },
    );
    expect(linesOf(receipt)).toEqual(["Table: B4"]);
  });

  it("adds the table to the all-details block only when one was captured", () => {
    const withTable = linesOf(
      renderReceipt(seated, config, { version: 1, theme: "classic", blocks: [{ kind: "orderMeta" }] }),
    );
    expect(withTable).toContain("Table: 12");
    expect(withTable[withTable.length - 1]).toBe("Table: 12");

    const without = linesOf(
      renderReceipt({ ...seated, customerData: {} }, config, {
        version: 1,
        blocks: [{ kind: "orderMeta" }],
      }),
    );
    expect(without.some((l) => l.startsWith("Table:"))).toBe(false);
  });

  it("stacked granular blocks still reproduce orderMeta when a table is set", () => {
    const granular = renderReceipt(seated, config, {
      version: 1,
      theme: "classic",
      blocks: [
        { kind: "orderNumber" },
        { kind: "orderDate" },
        { kind: "customerName" },
        { kind: "orderType" },
        { kind: "tableNumber" },
      ],
    });
    const composite = renderReceipt(seated, config, {
      version: 1,
      theme: "classic",
      blocks: [{ kind: "orderMeta" }],
    });
    expect(granular).toBe(composite);
  });

  it("parses the tableNumber kind from a saved layout, with or without a label", () => {
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "tableNumber" }] }),
    ).toEqual({ version: 1, blocks: [{ kind: "tableNumber" }] });
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "tableNumber", label: "Mesa" }] }),
    ).toEqual({ version: 1, blocks: [{ kind: "tableNumber", label: "Mesa" }] });
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "tableNumber", label: "" }] }),
    ).toBeNull();
  });
});
