import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import {
  ingredientsAvailableAt,
  overDraftedItemIds,
  canSendFrom,
  parseTransferQuantity,
  describeDraftProblem,
  type DraftedQuantity,
} from "../lib/transfer-draft";
import { loadInventoryStock } from "../lib/inventory-service";
import type { StockItemView } from "../lib/inventory-stock";
import type { BranchScope } from "../lib/branch-scope";
import { colors, typography, spacing, radius } from "../theme/colors";

/** The unbranched pool is a real place stock sits, so it is a real option. */
const POOL_VALUE = "__pool__";

export interface ComposeBranch {
  id: string;
  name: string;
}

interface TransferComposeSheetProps {
  tenantId: string;
  visible: boolean;
  branches: readonly ComposeBranch[];
  /** What this account may send, and from where. A courtesy, not a boundary. */
  scope: BranchScope;
  onClose: () => void;
  /**
   * Draft it, then put it on the van. Two calls, because the platform route
   * takes them separately — see the note on `send` below for what happens when
   * the second one fails.
   */
  onSend: (draft: {
    fromOutletId: string | null;
    toOutletId: string | null;
    lines: DraftedQuantity[];
    note?: string;
  }) => Promise<void>;
}

const toOutletId = (value: string): string | null => (value === POOL_VALUE ? null : value);
const toSelectValue = (outletId: string | null): string => outletId ?? POOL_VALUE;

/**
 * Composing a transfer, from the shop it is leaving.
 *
 * The web admin has had this since phase 3 and the phone has not, on the
 * theory that composing is desk work. It is not: the person who knows a shop is
 * about to run out is standing in it, and the shop with the spare sack of flour
 * is usually the one with nobody at a desk.
 *
 * **The source shelf is re-read, never inherited from the screen behind this.**
 * That shelf is `inventory_items.current_qty` — the chain roll-up — whenever an
 * owner is looking at the whole store, and composing from it would offer a
 * chain's 700 g of flour as sendable out of a shop holding 40. So changing the
 * source here fetches that branch's own stock and the picker is rebuilt from
 * it.
 *
 * Every judgement comes from lib/transfer-draft.ts, which words its refusals
 * exactly as the server does. This component only arranges them — and none of
 * it is a boundary: `stock-transfers-service.ts` re-checks against `app_users`
 * and `apply_stock_movement()` has the last word on whether a shelf can afford
 * a leg.
 */
export function TransferComposeSheet({
  tenantId,
  visible,
  branches,
  scope,
  onClose,
  onSend,
}: TransferComposeSheetProps) {
  // A branch account may send only its own stock, so its source is fixed.
  const isBranchLocked = scope.kind === "branch";
  const [fromValue, setFromValue] = useState(() =>
    isBranchLocked ? scope.outletId : toSelectValue(branches[0]?.id ?? null),
  );
  const [toValue, setToValue] = useState(() => toSelectValue(branches[1]?.id ?? null));
  const [lines, setLines] = useState<DraftedQuantity[]>([]);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [sourceShelf, setSourceShelf] = useState<StockItemView[]>([]);
  const [isLoadingShelf, setIsLoadingShelf] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromOutletId = toOutletId(fromValue);
  const toDestinationId = toOutletId(toValue);

  /**
   * The source branch's own shelf.
   *
   * Refetched whenever the source changes. A failed read leaves it EMPTY, so
   * the picker offers nothing — deliberately, and for the same reason the shelf
   * screen shows zeros rather than the roll-up: offering a chain total as one
   * branch's stock is wrong quietly, and an empty picker is wrong obviously.
   */
  useEffect(() => {
    if (!visible || !tenantId) return;

    let isCurrent = true;
    setIsLoadingShelf(true);

    void (async () => {
      try {
        const shelf = await loadInventoryStock(tenantId, fromOutletId);
        if (isCurrent) setSourceShelf(shelf);
      } catch {
        if (isCurrent) setSourceShelf([]);
      } finally {
        if (isCurrent) setIsLoadingShelf(false);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [visible, tenantId, fromOutletId]);

  const available = useMemo(() => ingredientsAvailableAt(sourceShelf), [sourceShelf]);

  // Derived during render rather than held in state, so switching the source
  // cannot leave the picker showing an ingredient the new branch has none of.
  const selected = available.find((item) => item.id === itemId) ?? available[0];

  // Re-checked against the CURRENT source, so lines drafted before the branch
  // was changed are caught too.
  const overDrafted = useMemo(
    () => overDraftedItemIds(lines, sourceShelf),
    [lines, sourceShelf],
  );

  const draft = { fromOutletId, toOutletId: toDestinationId, lines };
  const problem = describeDraftProblem(draft);
  const maySend = canSendFrom(scope, fromOutletId);
  const canSend =
    problem === null && maySend && overDrafted.length === 0 && !isSending && !isLoadingShelf;

  const close = () => {
    // Reset on close rather than on open: a sheet that reopens holding the last
    // consignment invites sending it twice.
    setLines([]);
    setQuantity("");
    setNote("");
    setError(null);
    setIsSending(false);
    onClose();
  };

  const addLine = () => {
    const parsed = parseTransferQuantity(quantity);
    if (!selected || parsed === null) {
      // A blank or nonsense box is refused rather than read as zero: zero moves
      // nothing while claiming a transfer happened.
      setError("Enter how much to send — more than zero.");
      return;
    }

    const chosen = selected.id;
    setError(null);
    setLines((current) => {
      // One line per ingredient. A second would be refused by the schema after
      // the merchant had typed it, and it makes the receiving count ambiguous.
      const existing = current.find((line) => line.inventoryItemId === chosen);
      if (existing) {
        return current.map((line) =>
          line.inventoryItemId === chosen ? { ...line, quantity: parsed } : line,
        );
      }
      return [...current, { inventoryItemId: chosen, quantity: parsed }];
    });
    setQuantity("");
  };

  const removeLine = (inventoryItemId: string) =>
    setLines((current) => current.filter((line) => line.inventoryItemId !== inventoryItemId));

  /**
   * Draft it and put it on the van, in one tap.
   *
   * Composing on a phone is somebody loading a box, not filing paperwork, so
   * "Send" is the only action — the web admin keeps the draft-and-review flow
   * for the desk. If the send half fails after the draft is created, the draft
   * survives and appears in the bench panel, which offers Send and Cancel for
   * exactly that reason. Nothing is stranded.
   */
  const send = async () => {
    if (!canSend) return;
    setError(null);
    setIsSending(true);

    try {
      await onSend({ ...draft, note: note.trim() || undefined });
      close();
    } catch (sendError) {
      // Surfaced in the server's own words — "you can only move stock in and
      // out of your own branch" is the one refusal a branch manager most needs
      // to read, and a false confirmation here would be discovered as somebody
      // else's shrinkage.
      setError(sendError instanceof Error ? sendError.message : "That did not send.");
      setIsSending(false);
    }
  };

  const nameOf = (outletId: string | null): string =>
    outletId === null ? "Store" : (branches.find((b) => b.id === outletId)?.name ?? "Branch");

  const options: readonly string[] = [
    POOL_VALUE,
    ...branches.map((branch) => branch.id),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.backdropFill} onPress={close} activeOpacity={1} />

        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.grabber} />
            <Text style={styles.title}>Move stock</Text>
            <Text style={styles.subtitle}>
              {nameOf(fromOutletId)} → {nameOf(toDestinationId)}
            </Text>

            <Text style={styles.label}>From</Text>
            {isBranchLocked ? (
              // Fixed, and said so rather than shown as a dead control: a
              // manager who cannot work out why a picker will not move assumes
              // the app is broken.
              <Text style={styles.locked}>
                {nameOf(fromOutletId)} — you can only send your own branch&apos;s stock
              </Text>
            ) : (
              <View style={styles.pills}>
                {options.map((value) => (
                  <TouchableOpacity
                    key={`from-${value}`}
                    style={[styles.pill, fromValue === value && styles.pillActive]}
                    onPress={() => setFromValue(value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: fromValue === value }}
                  >
                    <Text
                      style={[styles.pillText, fromValue === value && styles.pillTextActive]}
                    >
                      {nameOf(toOutletId(value))}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>To</Text>
            <View style={styles.pills}>
              {options.map((value) => (
                <TouchableOpacity
                  key={`to-${value}`}
                  style={[styles.pill, toValue === value && styles.pillActive]}
                  onPress={() => setToValue(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: toValue === value }}
                >
                  <Text style={[styles.pillText, toValue === value && styles.pillTextActive]}>
                    {nameOf(toOutletId(value))}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>What to send</Text>
            {isLoadingShelf ? (
              <Text style={styles.hint}>Reading {nameOf(fromOutletId)}&apos;s shelf...</Text>
            ) : available.length === 0 ? (
              <Text style={styles.hint}>
                {nameOf(fromOutletId)} is not holding any stock to send.
              </Text>
            ) : (
              <>
                <View style={styles.pills}>
                  {available.map((item) => {
                    const isActive = selected?.id === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.pill, isActive && styles.pillActive]}
                        onPress={() => setItemId(item.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        // The figure is what stops somebody drafting more than
                        // is on the shelf, so it belongs in the label too.
                        accessibilityLabel={`${item.name}, ${item.onHand} ${item.unitAbbreviation} on hand`}
                      >
                        <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.amountRow}>
                  <TextInput
                    style={styles.amountInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Amount of ${selected?.name ?? "ingredient"} to send`}
                  />
                  <Text style={styles.unit}>{selected?.unitAbbreviation}</Text>
                  <TouchableOpacity
                    style={styles.add}
                    onPress={addLine}
                    accessibilityRole="button"
                  >
                    <Text style={styles.addLabel}>Add</Text>
                  </TouchableOpacity>
                </View>

                {selected && (
                  <Text style={styles.hint}>
                    {selected.onHand} {selected.unitAbbreviation} on {nameOf(fromOutletId)}
                    &apos;s shelf
                  </Text>
                )}
              </>
            )}

            {lines.map((line) => {
              const item = sourceShelf.find((entry) => entry.id === line.inventoryItemId);
              const isOver = overDrafted.includes(line.inventoryItemId);
              return (
                <View key={line.inventoryItemId} style={styles.lineRow}>
                  <Text style={[styles.lineName, isOver && styles.lineNameOver]}>
                    {item?.name ?? "Ingredient"}
                  </Text>
                  <Text style={[styles.lineQty, isOver && styles.lineNameOver]}>
                    {line.quantity} {item?.unitAbbreviation ?? ""}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeLine(line.inventoryItemId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item?.name ?? "ingredient"}`}
                  >
                    <Text style={styles.remove}>Remove</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {overDrafted.length > 0 && (
              <Text style={styles.warning}>
                Marked lines ask for more than {nameOf(fromOutletId)} is holding.
              </Text>
            )}

            <TextInput
              style={styles.note}
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              placeholderTextColor={colors.textTertiary}
            />

            {!maySend && (
              <Text style={styles.error}>
                You can only move stock in and out of your own branch.
              </Text>
            )}
            {problem !== null && lines.length > 0 && (
              <Text style={styles.error}>{problem}</Text>
            )}
            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.send, !canSend && styles.sendDisabled]}
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
            >
              {isSending ? (
                <ActivityIndicator color={colors.heroInkText} />
              ) : (
                <Text style={styles.sendLabel}>Send</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.hint}>
              The stock leaves {nameOf(fromOutletId)} now. {nameOf(toDestinationId)} counts it
              in when it arrives.
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.lg },
  locked: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },

  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillActive: { backgroundColor: colors.heroInk, borderColor: colors.heroInk },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  pillTextActive: { color: colors.heroInkText },

  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  unit: { ...typography.body, color: colors.textSecondary },
  add: {
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  addLabel: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },

  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  lineName: { flex: 1, ...typography.caption, color: colors.textPrimary },
  lineNameOver: { color: colors.danger },
  lineQty: { ...typography.caption, color: colors.textSecondary },
  remove: { ...typography.small, color: colors.accent, fontWeight: "600" },

  warning: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  hint: { ...typography.small, color: colors.textTertiary, marginTop: spacing.sm },

  note: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 46,
    marginTop: spacing.lg,
  },

  send: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.md,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  sendDisabled: { opacity: 0.5 },
  sendLabel: { ...typography.body, fontWeight: "700", color: colors.heroInkText },
});
