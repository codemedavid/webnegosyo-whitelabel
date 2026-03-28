interface ReceiptOrderItem {
  menuItemName: string;
  quantity: number;
  subtotal: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

interface ReceiptOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  orderType?: string;
  total: number;
  deliveryFee?: number;
  paymentMethod?: string;
  items?: ReceiptOrderItem[];
}

interface ReceiptConfig {
  storeName: string;
  storeAddress?: string;
  width?: number; // characters per line, default 32
}

function center(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(padding) + text;
}

function line(char: string, width: number): string {
  return char.repeat(width);
}

function leftRight(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

export function formatReceipt(order: ReceiptOrder, config: ReceiptConfig): string {
  const w = config.width ?? 32;
  const lines: string[] = [];

  // Header
  lines.push(line("=", w));
  lines.push(center(config.storeName.toUpperCase(), w));
  if (config.storeAddress) {
    lines.push(center(config.storeAddress, w));
  }
  lines.push(line("=", w));

  // Order info
  const orderNum = order._id.slice(-8).toUpperCase();
  const date = new Date(order._creationTime);
  const dateStr = date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  lines.push(`Order #: ${orderNum}`);
  lines.push(`Date: ${dateStr}  ${timeStr}`);
  lines.push(`Customer: ${order.customerName}`);
  if (order.orderType) {
    lines.push(`Type: ${order.orderType}`);
  }

  // Items
  lines.push(line("-", w));
  lines.push(leftRight("Qty  Item", "Amount", w));
  lines.push(line("-", w));

  // Separate regular and bundle items
  const regularItems: ReceiptOrderItem[] = [];
  const bundleMap = new Map<string, { name: string; items: ReceiptOrderItem[]; total: number }>();

  for (const item of order.items ?? []) {
    if (item.isBundleItem && item.bundleId) {
      const existing = bundleMap.get(item.bundleId);
      if (existing) {
        existing.items.push(item);
        existing.total += item.subtotal;
      } else {
        bundleMap.set(item.bundleId, {
          name: item.bundleName ?? "Bundle",
          items: [item],
          total: item.subtotal,
        });
      }
    } else {
      regularItems.push(item);
    }
  }

  let subtotal = 0;

  // Print regular items
  for (const item of regularItems) {
    subtotal += item.subtotal;
    const qtyStr = ` ${item.quantity}`;
    const priceStr = `P${item.subtotal.toFixed(2)}`;
    const nameMaxLen = Math.max(0, w - qtyStr.length - priceStr.length - 3);
    let name: string;
    if (nameMaxLen === 0) {
      name = "";
    } else if (item.menuItemName.length > nameMaxLen) {
      name = nameMaxLen > 1 ? item.menuItemName.slice(0, nameMaxLen - 1) + "." : item.menuItemName.slice(0, nameMaxLen);
    } else {
      name = item.menuItemName;
    }

    lines.push(leftRight(`${qtyStr}  ${name}`, priceStr, w));

    if (item.variationSelections && item.variationSelections.length > 0) {
      for (const sel of item.variationSelections) {
        lines.push(`     - ${sel.optionName}`);
      }
    } else if (item.variation) {
      lines.push(`     - ${item.variation}`);
    }

    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        lines.push(`     + ${addon.name}`);
      }
    }

    if (item.specialInstructions) {
      lines.push(`     Note: ${item.specialInstructions}`);
    }
  }

  // Print bundle groups
  for (const [, bundle] of bundleMap) {
    subtotal += bundle.total;
    lines.push("");
    lines.push(`*** BUNDLE: ${bundle.name} ***`);

    for (const item of bundle.items) {
      const slotPrefix = item.slotName ? `[${item.slotName}] ` : "";
      const qtyStr = ` ${item.quantity}`;
      const priceStr = `P${item.subtotal.toFixed(2)}`;
      const fullName = `${slotPrefix}${item.menuItemName}`;
      const nameMaxLen = Math.max(0, w - qtyStr.length - priceStr.length - 3);
      let name: string;
      if (nameMaxLen === 0) {
        name = "";
      } else if (fullName.length > nameMaxLen) {
        name = nameMaxLen > 1 ? fullName.slice(0, nameMaxLen - 1) + "." : fullName.slice(0, nameMaxLen);
      } else {
        name = fullName;
      }

      lines.push(leftRight(`${qtyStr}  ${name}`, priceStr, w));

      if (item.variationSelections && item.variationSelections.length > 0) {
        for (const sel of item.variationSelections) {
          lines.push(`     - ${sel.optionName}`);
        }
      } else if (item.variation) {
        lines.push(`     - ${item.variation}`);
      }

      if (item.addons && item.addons.length > 0) {
        for (const addon of item.addons) {
          lines.push(`     + ${addon.name}`);
        }
      }

      if (item.specialInstructions) {
        lines.push(`     Note: ${item.specialInstructions}`);
      }
    }

    lines.push(leftRight("  Bundle Total:", `P${bundle.total.toFixed(2)}`, w));
  }

  // Totals — validate computed subtotal against order.total
  const expectedTotal = subtotal + (order.deliveryFee ?? 0);
  if (Math.abs(expectedTotal - order.total) > 0.01) {
    console.warn(
      `[Receipt] Subtotal mismatch: computed=${expectedTotal.toFixed(2)} vs order.total=${order.total.toFixed(2)} (order ${order._id})`
    );
  }

  lines.push(line("-", w));
  if (order.deliveryFee && order.deliveryFee > 0) {
    lines.push(leftRight("Subtotal:", `P${subtotal.toFixed(2)}`, w));
    lines.push(leftRight("Delivery Fee:", `P${order.deliveryFee.toFixed(2)}`, w));
  }
  lines.push(line("-", w));
  // Always use order.total as the authoritative total
  lines.push(leftRight("TOTAL:", `P${order.total.toFixed(2)}`, w));
  if (order.paymentMethod) {
    lines.push(`Payment: ${order.paymentMethod}`);
  }

  // Footer
  lines.push(line("=", w));
  lines.push(center("Thank you!", w));
  lines.push(line("=", w));
  lines.push(""); // Feed line

  return lines.join("\n");
}
