/**
 * When a receipt prints.
 *
 * Pure and side-effect free. Printing used to happen at exactly one moment —
 * status becoming `confirmed`, and only from the order-detail screen — while
 * the tender screen printed unconditionally whenever a printer existed and the
 * orders list printed nothing but an alert telling the cashier to go somewhere
 * else. Centralising the decision here is what lets those call sites stop
 * disagreeing.
 */

/** The two moments in an order's life where paper can come out. */
export type PrintMoment = "confirmation" | "billout";

/**
 * What the merchant chose.
 *
 * `confirmation` is the kitchen ticket — the order was accepted and needs
 * making. `billout` is the customer's bill — the money has been settled.
 * A store that hands the ticket to the kitchen AND a receipt to the customer
 * wants `both`.
 */
export type PrintTrigger = "off" | "confirmation" | "billout" | "both";

/** Every trigger, for settings UIs and exhaustiveness checks. */
export const PRINT_TRIGGERS: readonly PrintTrigger[] = [
  "off",
  "confirmation",
  "billout",
  "both",
];

/** Which moments each trigger fires at. */
const MOMENTS: Record<PrintTrigger, readonly PrintMoment[]> = {
  off: [],
  confirmation: ["confirmation"],
  billout: ["billout"],
  both: ["confirmation", "billout"],
};

/**
 * Should paper come out at this moment?
 *
 * An unrecognised trigger prints nothing rather than everything: a settings
 * value this build does not understand is not a reason to start spending a
 * merchant's receipt roll.
 */
export function shouldPrintAt(moment: PrintMoment, trigger: PrintTrigger): boolean {
  return (MOMENTS[trigger] ?? []).includes(moment);
}

/**
 * Read the old `auto_print` boolean as a trigger.
 *
 * The legacy store defaulted to `true`, so a device with nothing saved must
 * land on `confirmation` — an upgrade that silently stopped printing would
 * look like broken hardware, and the merchant would debug the printer.
 */
export function migrateAutoPrint(legacy: boolean | null | undefined): PrintTrigger {
  if (legacy === false) return "off";
  return "confirmation";
}
