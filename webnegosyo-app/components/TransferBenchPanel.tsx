import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  TRANSFER_STATUS_LABELS,
  describeTransferDirection,
  isAwaitingCount,
  sortTransfersForBench,
  type BranchNames,
  type TransferSummary,
} from "../lib/inventory-transfers";
import { colors, typography, spacing, radius } from "../theme/colors";

/** One line of a consignment, as the bench has to count it. */
export interface BenchLine {
  inventoryItemId: string;
  name: string;
  sentQuantity: number;
  unitAbbreviation: string;
}

interface TransferBenchPanelProps {
  transfers: readonly TransferSummary[];
  branchNames: BranchNames;
  /** The lines of whichever consignment is expanded, keyed by transfer id. */
  linesFor: (transferId: string) => readonly BenchLine[];
  /** Count a delivery in. Rejects with a message worth showing. */
  onReceive: (transferId: string, counts: Record<string, number>) => Promise<void>;
}

/**
 * Counting a delivery in, at the bench.
 *
 * This is the half of transfers that most wants a phone. Composing a transfer
 * is desk work and the web admin already does it well; counting one in happens
 * standing up, with a box open, away from any screen that is not in a pocket.
 * So this panel does the receiving and does not try to be the whole workbench.
 *
 * **Every count field starts at what was sent.** Blank would make the honest
 * path the laborious one — the merchant who just checks the box and taps
 * through would have to type every figure to say "it all arrived" — and that is
 * exactly how the step stops being done at all. The same rule the web workbench
 * follows, for the same reason.
 *
 * Received and cancelled consignments still appear, greyed. A list that showed
 * only live work would leave a merchant unable to confirm they already counted
 * something in, and "did I do this?" is the question that gets a load counted
 * twice.
 */
export function TransferBenchPanel({
  transfers,
  branchNames,
  linesFor,
  onReceive,
}: TransferBenchPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Keyed by transfer then item, so counting one consignment cannot disturb
  // another's figures if the merchant switches between them.
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Nothing has ever moved between shops here. A panel saying so on every
  // single-shop shelf would be noise on the majority of screens.
  if (transfers.length === 0) return null;

  const ordered = sortTransfersForBench(transfers);

  const countsFor = (transfer: TransferSummary): Record<string, number> => {
    const typed = drafts[transfer.id] ?? {};
    const counts: Record<string, number> = {};
    for (const line of linesFor(transfer.id)) {
      const raw = typed[line.inventoryItemId];
      // Untouched means "as sent" — the default the fields already show.
      counts[line.inventoryItemId] = raw === undefined ? line.sentQuantity : Number(raw);
    }
    return counts;
  };

  const receive = async (transfer: TransferSummary) => {
    const counts = countsFor(transfer);

    // A blank or nonsense box must never be sent as a zero: zero is how a load
    // that never turned up is written off entirely, and typing it by accident
    // would post the whole consignment as the sender's shrinkage.
    const invalid = Object.values(counts).some(
      (value) => !Number.isFinite(value) || value < 0,
    );
    if (invalid) {
      Alert.alert("Check the counts", "Every line needs a number of zero or more.");
      return;
    }

    setBusyId(transfer.id);
    try {
      await onReceive(transfer.id, counts);
      setOpenId(null);
    } catch (error) {
      // Surfaced, never swallowed. The merchant is standing here waiting to be
      // told the count landed, and the server's own wording — "you can only
      // move stock in and out of your own branch" — is what they need.
      Alert.alert(
        "Could not record the delivery",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Stock on the move</Text>

      {ordered.map((transfer) => {
        const awaiting = isAwaitingCount(transfer);
        const isOpen = openId === transfer.id;
        const lines = isOpen ? linesFor(transfer.id) : [];

        return (
          <View key={transfer.id} style={[styles.row, !awaiting && styles.rowDone]}>
            <TouchableOpacity
              accessibilityRole="button"
              // Only what is actually on its way can be counted in. A draft has
              // moved nothing, and offering the action would send somebody
              // looking for a box that was never loaded.
              disabled={!awaiting}
              onPress={() => setOpenId(isOpen ? null : transfer.id)}
            >
              <Text style={styles.direction}>
                {describeTransferDirection(transfer, branchNames)}
              </Text>
              <Text style={styles.meta}>
                {TRANSFER_STATUS_LABELS[transfer.status]} · {transfer.lineCount}{" "}
                {transfer.lineCount === 1 ? "ingredient" : "ingredients"}
              </Text>
            </TouchableOpacity>

            {/*
              Expands inline rather than opening a modal: counting in happens
              while reading lines off a box, and a modal hides the very thing
              being checked against.
            */}
            {isOpen && (
              <View style={styles.countBox}>
                {lines.map((line) => (
                  <View key={line.inventoryItemId} style={styles.countRow}>
                    <Text style={styles.lineName}>{line.name}</Text>
                    <TextInput
                      accessibilityLabel={`${line.name} counted`}
                      style={styles.countInput}
                      keyboardType="decimal-pad"
                      value={
                        drafts[transfer.id]?.[line.inventoryItemId] ??
                        String(line.sentQuantity)
                      }
                      onChangeText={(text) =>
                        setDrafts((current) => ({
                          ...current,
                          [transfer.id]: {
                            ...(current[transfer.id] ?? {}),
                            [line.inventoryItemId]: text,
                          },
                        }))
                      }
                    />
                    <Text style={styles.unit}>{line.unitAbbreviation}</Text>
                  </View>
                ))}

                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.receiveButton}
                  disabled={busyId === transfer.id}
                  onPress={() => receive(transfer)}
                >
                  {busyId === transfer.id ? (
                    <ActivityIndicator color={colors.heroInkText} />
                  ) : (
                    <Text style={styles.receiveLabel}>Record delivery</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.hint}>
                  Anything short is charged to the sending branch.
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: { ...typography.eyebrow, color: colors.textSecondary },
  row: { gap: spacing.sm },
  rowDone: { opacity: 0.55 },
  direction: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  countBox: { gap: spacing.sm, marginTop: spacing.sm },
  countRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineName: { flex: 1, ...typography.caption, color: colors.textPrimary },
  countInput: {
    width: 90,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    textAlign: "right",
    ...typography.body,
    color: colors.textPrimary,
  },
  unit: { width: 34, ...typography.small, color: colors.textSecondary },
  receiveButton: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.md,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  receiveLabel: { ...typography.body, fontWeight: "700", color: colors.heroInkText },
  hint: { ...typography.small, color: colors.textTertiary },
});
