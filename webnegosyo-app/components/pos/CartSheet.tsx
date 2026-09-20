import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { CartTotals, PosCartLine } from "../../lib/pos-cart";
import type { PosOrderType } from "../../lib/pos-catalog";
import { isDineInType } from "../../lib/pos-table";
import type { OrderDiscountLine } from "../../lib/order-totals";

interface CartSheetProps {
  lines: PosCartLine[];
  totals: CartTotals;
  orderTypes: PosOrderType[];
  orderTypeId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectOrderType: (type: PosOrderType) => void;
  onChangeQty: (key: string, quantity: number) => void;
  onClear: () => void;
  onCharge: () => void;
  /**
   * Overrides the action label. Editing a placed order collects, refunds, or
   * merely saves — "Charge" is only right for a new counter sale.
   */
  chargeLabel?: string;
  /**
   * Overrides the amount beside the label. Editing shows the difference to
   * settle, not the order's total, because the rest is already paid.
   */
  chargeTotal?: number;
  /** Blocks the action with a reason shown in place of the amount. */
  blockedReason?: string;
  /** Vouchers and manual discounts applied to this sale, priced live. */
  discountLines?: readonly OrderDiscountLine[];
  /** Opens discount entry. Absent hides the entry point entirely. */
  onAddDiscount?: () => void;
  /** Removes one applied discount by its label. */
  onRemoveDiscount?: (line: OrderDiscountLine) => void;
  /** Opens delivery details entry. Absent (e.g. editing) hides it entirely. */
  onEditDelivery?: () => void;
  /** Opens the table picker for a dine-in sale. Absent (e.g. editing) hides it. */
  onEditTable?: () => void;
  /** The table attached to this sale, as chosen, or null. */
  tableLabel?: string | null;
  /**
   * The part of an edited order's total that nothing can account for.
   *
   * Editing a placed order prices it from the bill as placed. Items, the
   * stored service charge and the delivery fee are all known and get their own
   * captioned rows; this is whatever is left — rounding, or a discount from
   * before breakdowns were recorded. May be negative, which is a deduction the
   * customer was already given.
   *
   * Shown rather than folded silently into the total: a cashier who can see
   * money they cannot explain is exactly the complaint this row answers.
   * Absent (a counter sale) or zero renders nothing.
   */
  adjustment?: number;
  /**
   * `sheet` (the default) docks the sale to the bottom of a phone register,
   * collapsed until the cashier opens it. `panel` stands it up as its own
   * column beside the product grid on a tablet: always open, lines stacked
   * down the full height, Charge pinned to the bottom. Chosen by the screen
   * from the window size — see lib/pos-layout.ts.
   */
  variant?: "sheet" | "panel";
}

/**
 * The running sale, in whichever shape the glass allows.
 *
 * As a `sheet` (a phone) it is docked to the bottom and collapsed by default,
 * so the product grid keeps the screen: the summary row and the Charge total
 * are always readable, and the line detail expands only when the cashier needs
 * to correct something. Charge stays in the same position in both states so
 * muscle memory holds.
 *
 * As a `panel` (a tablet) it is a permanent column beside the grid: every line
 * is stacked down it, the totals sit under them, and Charge is pinned to the
 * bottom. There is no collapsed state, because a column covers nothing.
 *
 * The two share every prop and every money decision — only the arrangement
 * differs.
 */
export function CartSheet({
  lines,
  totals,
  orderTypes,
  orderTypeId,
  isExpanded,
  onToggle,
  onSelectOrderType,
  onChangeQty,
  onClear,
  onCharge,
  chargeLabel,
  chargeTotal,
  blockedReason,
  discountLines = [],
  onAddDiscount,
  onRemoveDiscount,
  onEditDelivery,
  onEditTable,
  tableLabel = null,
  adjustment = 0,
  variant = "sheet",
}: CartSheetProps) {
  const hasItems = lines.length > 0;
  const isPanel = variant === "panel";
  // A panel has the height to stay open, and nothing to gain by closing: the
  // grid beside it is not covered by it. Only the bottom sheet collapses.
  const showDetail = isPanel || isExpanded;
  const activeType = orderTypes.find((type) => type.id === orderTypeId);
  // Surfaced more prominently for a delivery-type sale, but never hidden for
  // the rest: a dine-in order type does not stop a customer asking the shop
  // to send the food over.
  const isDeliveryType = activeType?.type === "delivery";
  const isDineIn = isDineInType(activeType);

  return (
    <View style={[styles.sheet, isPanel && styles.panel]}>
      {/*
        The panel is a titled column, not a drawer: there is nothing to pull
        open, so the handle becomes a heading that says what the column is and
        how much is on it. It stays mounted with no items so the cashier can
        see the register is ready rather than a blank strip of card.
      */}
      {isPanel ? (
        <View style={styles.panelHeader}>
          <View style={styles.handleLeft}>
            <Text style={styles.panelTitle}>Current sale</Text>
            {hasItems ? (
              <Text style={styles.handleText}>
                {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
              </Text>
            ) : null}
          </View>
          {hasItems ? (
            <TouchableOpacity
              onPress={onClear}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear the sale"
            >
              <Text style={styles.clear}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : hasItems ? (
        <TouchableOpacity
          style={styles.handle}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? "Hide sale items" : "Show sale items"}
        >
          <View style={styles.handleLeft}>
            <Text style={styles.chevron}>{isExpanded ? "⌄" : "⌃"}</Text>
            <Text style={styles.handleText}>
              {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
            </Text>
            {!isExpanded && (
              <Text style={styles.handleHint} numberOfLines={1}>
                · {lines.map((line) => line.name).join(", ")}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClear} hitSlop={10}>
            <Text style={styles.clear}>Clear</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ) : null}

      {/* The column's own empty state; the sheet says this on its Charge bar. */}
      {isPanel && !hasItems ? (
        <View style={styles.panelEmpty}>
          <Text style={styles.panelEmptyTitle}>No items yet</Text>
          <Text style={styles.panelEmptyBody}>
            Products you tap appear here, with the running total.
          </Text>
        </View>
      ) : null}

      {/*
        The discount entry, reachable without expanding the cart.
        A merchant reported not finding vouchers at all: the only affordance
        lived inside the expanded totals, and the sheet opens collapsed, so a
        cashier had to know to tap the item count first. Any applied discount
        rides here too — a collapsed cart otherwise shows a total that does not
        match its items with nothing explaining the difference.
      */}
      {hasItems && !showDetail && (onAddDiscount || discountLines.length > 0) ? (
        <View style={styles.collapsedDiscount}>
          {discountLines.length > 0 ? (
            <Text style={styles.collapsedDiscountText} numberOfLines={1}>
              {discountLines.map((line) => line.label).join(", ")} · −
              {formatPeso(discountLines.reduce((sum, line) => sum + line.amount, 0))}
            </Text>
          ) : (
            <Text style={styles.collapsedDiscountHint}>No discount on this sale</Text>
          )}
          {onAddDiscount && (
            <TouchableOpacity
              onPress={onAddDiscount}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Add a discount"
            >
              <Text style={styles.collapsedDiscountAction}>
                {discountLines.length > 0 ? "Change" : "+ Discount"}
              </Text>
            </TouchableOpacity>
          )}
          {/* A delivery-type sale gets the fee entry here in the collapsed
              state too — that is the sale most likely to need it, and the
              sheet opens collapsed. */}
          {/* A dine-in sale names its table here, in the collapsed state too:
              the server rings it up standing at the table. */}
          {onEditTable && isDineIn && (
            <TouchableOpacity
              onPress={onEditTable}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={tableLabel ? `Change table ${tableLabel}` : "Choose a table"}
            >
              <Text style={styles.collapsedDiscountAction}>
                {tableLabel ? `Table ${tableLabel}` : "+ Table"}
              </Text>
            </TouchableOpacity>
          )}
          {onEditDelivery && isDeliveryType && (
            <TouchableOpacity
              onPress={onEditDelivery}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Add delivery details"
            >
              <Text style={styles.collapsedDiscountAction}>
                {totals.deliveryFee > 0 ? `Delivery ${formatPeso(totals.deliveryFee)}` : "+ Delivery"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {hasItems && showDetail ? (
        <>
          <ScrollView
            style={[styles.lines, isPanel && styles.linesPanel]}
            contentContainerStyle={styles.linesContent}
          >
            {lines.map((line) => (
              <View key={line.key} style={styles.line}>
                <View style={styles.lineText}>
                  <Text style={styles.lineName} numberOfLines={1}>
                    {line.name}
                  </Text>
                  {line.selections.length > 0 && (
                    <Text style={styles.lineMeta} numberOfLines={1}>
                      {line.selections.map((s) => s.optionName).join(", ")}
                    </Text>
                  )}
                  {line.note ? (
                    <Text style={styles.lineMeta} numberOfLines={1}>
                      Note: {line.note}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.step}
                    onPress={() => onChangeQty(line.key, line.quantity - 1)}
                    accessibilityLabel={`Decrease ${line.name}`}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.quantity}>{line.quantity}</Text>
                  <TouchableOpacity
                    style={styles.step}
                    onPress={() => onChangeQty(line.key, line.quantity + 1)}
                    accessibilityLabel={`Increase ${line.name}`}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.lineTotal}>{formatPeso(line.subtotal)}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatPeso(totals.subtotal)}</Text>
            </View>
            {totals.serviceCharge > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Service charge</Text>
                <Text style={styles.totalValue}>{formatPeso(totals.serviceCharge)}</Text>
              </View>
            )}
            {/* Tappable to correct: a mistyped fee must be fixable where it
                shows, not by hunting for the sheet that set it. */}
            {totals.deliveryFee > 0 && (
              <TouchableOpacity
                style={styles.totalRow}
                onPress={onEditDelivery}
                disabled={!onEditDelivery}
                accessibilityRole="button"
                accessibilityLabel="Edit delivery fee"
              >
                <Text style={styles.totalLabel}>Delivery</Text>
                <Text style={styles.totalValue}>{formatPeso(totals.deliveryFee)}</Text>
              </TouchableOpacity>
            )}

            {/* Sign carried by the row, not by the number: an unsigned
                negative would read as the shop charging extra. */}
            {adjustment !== 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Adjustment</Text>
                <Text style={styles.totalValue}>
                  {adjustment < 0 ? "−" : ""}
                  {formatPeso(Math.abs(adjustment))}
                </Text>
              </View>
            )}

            {/*
              One row per discount, each removable. Shown individually rather
              than as a single "Discount" figure so the cashier can tell a
              customer which code did what, and undo the right one.
            */}
            {discountLines.map((line, index) => (
              <TouchableOpacity
                key={`${line.label}-${index}`}
                style={styles.totalRow}
                onPress={onRemoveDiscount ? () => onRemoveDiscount(line) : undefined}
                disabled={!onRemoveDiscount}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${line.label}`}
              >
                <Text style={[styles.totalLabel, styles.discountLabel]} numberOfLines={1}>
                  {line.label}
                </Text>
                <Text style={[styles.totalValue, styles.discountValue]}>
                  −{formatPeso(line.amount)}
                </Text>
              </TouchableOpacity>
            ))}

            {onAddDiscount && (
              <TouchableOpacity
                style={styles.addDiscount}
                onPress={onAddDiscount}
                accessibilityRole="button"
              >
                <Text style={styles.addDiscountText}>+ Add discount</Text>
              </TouchableOpacity>
            )}
            {onEditDelivery && totals.deliveryFee <= 0 && (
              <TouchableOpacity
                style={styles.addDiscount}
                onPress={onEditDelivery}
                accessibilityRole="button"
              >
                <Text style={styles.addDiscountText}>+ Add delivery fee</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : null}

      {orderTypes.length > 0 &&
        (() => {
          const chips = orderTypes.map((type) => {
            const isActive = orderTypeId === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeChip, isActive && styles.typeChipActive]}
                onPress={() => onSelectOrderType(type)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.typeText, isActive && styles.typeTextActive]}>
                  {type.name}
                </Text>
              </TouchableOpacity>
            );
          });

          // A narrow column would hide the later channels off the right edge of
          // a horizontal strip, so the panel wraps them and shows them all —
          // choosing the wrong channel is a mispriced sale.
          return isPanel ? (
            <View style={[styles.typeRow, styles.typeRowWrap]}>{chips}</View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeRow}
            >
              {chips}
            </ScrollView>
          );
        })()}

      <TouchableOpacity
        style={[styles.charge, (!hasItems || blockedReason) && styles.chargeDisabled]}
        disabled={!hasItems || blockedReason !== undefined}
        onPress={onCharge}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        {!hasItems ? (
          <Text style={styles.chargeEmpty}>Tap a product to start the sale</Text>
        ) : blockedReason ? (
          <Text style={styles.chargeEmpty}>{blockedReason}</Text>
        ) : (
          <>
            <View>
              <Text style={styles.chargeLabel}>{chargeLabel ?? "Charge"}</Text>
              {activeType ? <Text style={styles.chargeMeta}>{activeType.name}</Text> : null}
            </View>
            <Text style={styles.chargeTotal}>{formatPeso(chargeTotal ?? totals.total)}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    ...shadow.md,
  },
  // Square, full height, divided from the grid by its left edge rather than
  // floating over it: the panel is a column of the screen, not a sheet.
  panel: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.separator,
    paddingHorizontal: spacing.lg,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  panelTitle: { ...typography.heading, color: colors.textPrimary },
  panelEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  panelEmptyTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  panelEmptyBody: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  handle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  handleLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: spacing.sm },
  chevron: { fontSize: 14, color: colors.textTertiary, width: 12 },
  handleText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  handleHint: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  clear: { ...typography.caption, color: colors.danger, fontWeight: "700" },
  lines: { maxHeight: 240 },
  // The column has the height a sheet does not: let the sale stack down it and
  // scroll, instead of capping at the four rows a phone can spare.
  linesPanel: { maxHeight: undefined, flex: 1 },
  linesContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lineText: { flex: 1 },
  lineName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  lineMeta: { ...typography.small, color: colors.textSecondary },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  step: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 17, lineHeight: 20, color: colors.textPrimary },
  quantity: {
    ...typography.body,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
    color: colors.textPrimary,
  },
  lineTotal: {
    ...typography.caption,
    fontWeight: "700",
    minWidth: 68,
    textAlign: "right",
    color: colors.textPrimary,
  },
  totals: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { ...typography.caption, color: colors.textSecondary },
  totalValue: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  discountLabel: { flex: 1, marginRight: spacing.sm },
  discountValue: { color: colors.success },
  collapsedDiscount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  collapsedDiscountText: {
    ...typography.small,
    color: colors.success,
    fontWeight: "600",
    flex: 1,
  },
  collapsedDiscountHint: { ...typography.small, color: colors.textSecondary, flex: 1 },
  collapsedDiscountAction: {
    ...typography.small,
    color: colors.primary,
    fontWeight: "700",
  },
  addDiscount: { paddingTop: spacing.xs },
  addDiscountText: { ...typography.caption, fontWeight: "600", color: colors.primary },
  typeRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  typeRowWrap: { flexDirection: "row", flexWrap: "wrap" },
  typeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  typeChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  typeText: { ...typography.caption, color: colors.textSecondary },
  typeTextActive: { color: colors.accent, fontWeight: "700" },
  charge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    marginTop: spacing.xs,
  },
  chargeDisabled: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    justifyContent: "center",
  },
  chargeLabel: { ...typography.heading, color: colors.textOnDark },
  chargeMeta: { ...typography.small, color: "rgba(255,255,255,0.65)", marginTop: 1 },
  chargeTotal: { ...typography.title, color: colors.textOnDark },
  chargeEmpty: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
});
