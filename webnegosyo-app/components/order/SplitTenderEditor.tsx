import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { CollectMethodOption } from "../../lib/order-collect";
import { computeChange } from "../../lib/pos-cash";
import { fromCents, toCents } from "../../lib/bill/money";
import {
  MAX_TENDER_LINES,
  MIN_TENDER_LINES,
  addTenderLine,
  removeTenderLine,
  resolveTenderCents,
  splitTenderCoverage,
  updateTenderLine,
  type TenderLine,
} from "../../lib/bill/split-tender";

interface SplitTenderEditorProps {
  lines: readonly TenderLine[];
  methods: readonly CollectMethodOption[];
  balanceDue: number;
  onChange: (lines: readonly TenderLine[]) => void;
}

/**
 * The lines of a split payment inside the collect sheet: a method and an
 * amount each, the last one taking the rest when left blank. The rules are
 * `lib/bill/split-tender.ts`'s; this only draws them.
 */
export function SplitTenderEditor({ lines, methods, balanceDue, onChange }: SplitTenderEditorProps) {
  const cents = resolveTenderCents(lines, toCents(balanceDue));
  const coverage = splitTenderCoverage(lines, balanceDue);
  const edit = (key: string, change: Partial<Omit<TenderLine, "key">>) => onChange(updateTenderLine(lines, key, change));

  return (
    <View style={styles.wrap}>
      {lines.map((line, index) => (
        <TenderLineRow
          key={line.key}
          line={line}
          index={index}
          isLast={index === lines.length - 1}
          resolvedCents={cents[index]}
          methods={methods}
          onEdit={(change) => edit(line.key, change)}
          onRemove={lines.length > MIN_TENDER_LINES ? () => onChange(removeTenderLine(lines, line.key)) : undefined}
        />
      ))}

      {lines.length < MAX_TENDER_LINES ? (
        <TouchableOpacity onPress={() => onChange(addTenderLine(lines))} accessibilityRole="button">
          <Text style={styles.link}>+ Add another method</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.coverage} accessibilityLabel="Split total">
        <Text style={styles.coverageLabel}>Total of the split</Text>
        <Text style={styles.coverageAmount}>{formatPeso(fromCents(coverage.coveredCents))}</Text>
      </View>
      {coverage.overCents > 0 ? (
        <Text style={styles.over}>{formatPeso(fromCents(coverage.overCents))} more than is owed.</Text>
      ) : coverage.leftCents > 0 ? (
        <Text style={styles.left}>{formatPeso(fromCents(coverage.leftCents))} will still be owed after this.</Text>
      ) : null}
    </View>
  );
}

interface TenderLineRowProps {
  line: TenderLine;
  index: number;
  isLast: boolean;
  resolvedCents: number | null;
  methods: readonly CollectMethodOption[];
  onEdit: (change: Partial<Omit<TenderLine, "key">>) => void;
  onRemove?: () => void;
}

function TenderLineRow({ line, index, isLast, resolvedCents, methods, onEdit, onRemove }: TenderLineRowProps) {
  const method = methods.find((m) => m.id === line.methodId) ?? null;
  const label = `Payment ${index + 1}`;
  const isRest = isLast && line.amount.trim() === "";
  const restCents = isRest && resolvedCents !== null && resolvedCents > 0 ? resolvedCents : null;
  const amount = resolvedCents !== null && resolvedCents > 0 ? fromCents(resolvedCents) : 0;
  const cashNumber = line.cash.trim() === "" ? amount : Number(line.cash);
  const change = computeChange(amount, Number.isFinite(cashNumber) ? cashNumber : -1);

  return (
    <View style={styles.line}>
      <View style={styles.lineHeader}>
        <Text style={styles.lineTitle}>{label}</Text>
        {onRemove ? (
          <TouchableOpacity onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${label}`}>
            <Text style={styles.remove}>Remove</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.methodRow}>
          {methods.map((candidate) => {
            const isActive = candidate.id === line.methodId;
            return (
              <TouchableOpacity
                key={candidate.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => onEdit({ methodId: candidate.id })}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${candidate.name}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{candidate.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <TextInput
        accessibilityLabel={`${label} amount`}
        style={styles.input}
        value={line.amount}
        keyboardType="decimal-pad"
        placeholder={restCents !== null ? `The rest · ${formatPeso(fromCents(restCents))}` : "0.00"}
        placeholderTextColor={colors.textSecondary}
        onChangeText={(next) => onEdit({ amount: next })}
      />

      {method?.isCash ? (
        <>
          <TextInput
            accessibilityLabel={`${label} cash received`}
            style={styles.input}
            value={line.cash}
            keyboardType="decimal-pad"
            placeholder="Cash received (exact if blank)"
            placeholderTextColor={colors.textSecondary}
            onChangeText={(next) => onEdit({ cash: next })}
          />
          {change.isSufficient && change.changeDue > 0 ? (
            <Text style={styles.change}>Change {formatPeso(change.changeDue)}</Text>
          ) : null}
        </>
      ) : method ? (
        <TextInput
          accessibilityLabel={`${label} reference number`}
          style={styles.input}
          value={line.reference}
          autoCapitalize="characters"
          placeholder={`${method.name} reference (optional)`}
          placeholderTextColor={colors.textSecondary}
          onChangeText={(next) => onEdit({ reference: next })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  line: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
  },
  lineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  remove: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  methodRow: { flexDirection: "row", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText: { ...typography.small, color: colors.textPrimary },
  chipTextActive: { color: colors.textOnDark },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  change: { ...typography.caption, color: colors.success, fontWeight: "700" },
  link: { ...typography.caption, color: colors.accent, fontWeight: "700", paddingVertical: spacing.xs },
  coverage: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  coverageLabel: { ...typography.body, color: colors.textSecondary },
  coverageAmount: { ...typography.heading, color: colors.textPrimary },
  over: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  left: { ...typography.caption, color: colors.warning, fontWeight: "600" },
});
