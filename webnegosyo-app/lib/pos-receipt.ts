/**
 * The receipt for a counter sale, built from the arguments the sale was
 * actually written with.
 *
 * The register used to assemble this object by hand at the tender screen from
 * the cart lines and the total. Everything the backend was told about — the
 * manual delivery fee, the service charge, the discount breakdown — was left
 * out, so a delivery sale printed items that did not sum to the bill and no
 * line naming the difference. Deriving it from `PosOrderArgs` means the paper
 * and the saved order cannot disagree.
 */
import type { PosOrderArgs, PosTender } from "./pos-order";
import type { ReceiptOrder } from "./receipt-layout";

export function posReceiptOrder(
  orderId: string,
  args: PosOrderArgs,
  tender: PosTender,
  createdAt: number = Date.now(),
): ReceiptOrder {
  return {
    _id: orderId,
    _creationTime: createdAt,
    customerName: args.customerName,
    customerContact: args.customerContact,
    orderType: args.orderType,
    total: args.total,
    deliveryFee: args.deliveryFee,
    serviceCharge: args.serviceCharge,
    paymentMethod: args.paymentMethod,
    // The discount breakdown rides in the blob, where `readOrderDiscount`
    // shape-checks it — the same path a re-print off the order screen takes.
    customerData: args.customerData,
    cashTendered: tender.cashTendered,
    changeDue: tender.changeDue,
    paymentReference: tender.reference,
    items: args.items.map((item) => ({
      menuItemName: item.menuItemName,
      quantity: item.quantity,
      subtotal: item.subtotal,
      variationSelections: item.variationSelections?.map((selection) => ({
        typeName: selection.typeName,
        optionName: selection.optionName,
      })),
      specialInstructions: item.specialInstructions,
    })),
  };
}
