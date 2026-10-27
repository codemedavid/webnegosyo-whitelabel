import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  SERVICE_PERIOD_NAME_MAX,
  describePeriodTimes,
  formatClock,
  validateServicePeriodInput,
  type ServicePeriod,
  type ServicePeriodInput,
} from "../../lib/cash/service-periods";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet, sheetText } from "../drawer/DrawerSheet";
import { RuleChip, RuleChipRow } from "./RuleChip";
import { Stepper } from "./Stepper";

const MINUTES_PER_DAY = 24 * 60;
const STEP_MINUTES = 15;
/** A new shift starts as the common lunch-to-evening one; the owner moves it. */
const NEW_SHIFT = { startsMinutes: 12 * 60, endsMinutes: 20 * 60 } as const;

export interface BranchOption {
  id: string;
  name: string;
}

interface ServicePeriodSheetProps {
  /** The shift being edited, or null when adding one. */
  period: ServicePeriod | null;
  siblings: readonly ServicePeriod[];
  /** Branches the store runs; empty = a single-location store (no picker). */
  branches: readonly BranchOption[];
  isBusy: boolean;
  error: string | null;
  onSave: (input: ServicePeriodInput) => void;
  onArchive: () => void;
  onClose: () => void;
}

const step = (minutes: number, direction: 1 | -1): number =>
  (minutes + direction * STEP_MINUTES + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/** Add or edit one named shift: its name, start and end, and where it applies. */
export function ServicePeriodSheet({ period, siblings, branches, isBusy, error, onSave, onArchive, onClose }: ServicePeriodSheetProps) {
  const [name, setName] = useState(period?.name ?? "");
  const [startsMinutes, setStarts] = useState<number>(period?.startsMinutes ?? NEW_SHIFT.startsMinutes);
  const [endsMinutes, setEnds] = useState<number>(period?.endsMinutes ?? NEW_SHIFT.endsMinutes);
  const [outletId, setOutletId] = useState<string | null>(period?.outletId ?? null);
  const [problem, setProblem] = useState<{ field: "name" | "times"; reason: string } | null>(null);

  const save = () => {
    const verdict = validateServicePeriodInput({ name, startsMinutes, endsMinutes, outletId }, siblings, period?.id);
    if (!verdict.ok) {
      setProblem({ field: verdict.field, reason: verdict.reason });
      return;
    }
    setProblem(null);
    onSave(verdict.value);
  };

  return (
    <DrawerSheet
      visible
      title={period ? "Edit shift" : "Add a shift"}
      subtitle={describePeriodTimes(startsMinutes, endsMinutes)}
      onClose={onClose}
      isBusy={isBusy}
    >
      <Text style={sheetText.label}>Name</Text>
      <TextInput
        style={[styles.input, problem?.field === "name" && styles.inputError]}
        value={name}
        onChangeText={(next) => {
          setName(next);
          setProblem(null);
        }}
        placeholder="Day shift"
        placeholderTextColor={colors.textTertiary}
        maxLength={SERVICE_PERIOD_NAME_MAX}
        editable={!isBusy}
        autoFocus={!period}
        accessibilityLabel="Shift name"
      />
      {problem?.field === "name" ? <Text style={sheetText.error}>{problem.reason}</Text> : null}

      <Stepper
        label="Starts"
        value={formatClock(startsMinutes)}
        onDecrease={() => setStarts((m) => step(m, -1))}
        onIncrease={() => setStarts((m) => step(m, 1))}
        decreaseLabel="Start 15 minutes earlier"
        increaseLabel="Start 15 minutes later"
        disabled={isBusy}
      />
      <Stepper
        label="Ends"
        hint={endsMinutes <= startsMinutes ? "The next day" : undefined}
        value={formatClock(endsMinutes)}
        onDecrease={() => setEnds((m) => step(m, -1))}
        onIncrease={() => setEnds((m) => step(m, 1))}
        decreaseLabel="End 15 minutes earlier"
        increaseLabel="End 15 minutes later"
        disabled={isBusy}
      />
      {problem?.field === "times" ? <Text style={sheetText.error}>{problem.reason}</Text> : null}

      {branches.length > 1 ? (
        <View style={styles.branches}>
          <Text style={sheetText.label}>Where</Text>
          <RuleChipRow>
            <RuleChip label="Every branch" isSelected={outletId === null} onPress={() => setOutletId(null)} disabled={isBusy} />
            {branches.map((branch) => (
              <RuleChip
                key={branch.id}
                label={branch.name}
                isSelected={outletId === branch.id}
                onPress={() => setOutletId(branch.id)}
                disabled={isBusy}
              />
            ))}
          </RuleChipRow>
        </View>
      ) : null}

      {error ? (
        <Text style={sheetText.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button label={period ? "Save shift" : "Add shift"} onPress={save} isLoading={isBusy} disabled={isBusy} size="lg" fullWidth style={styles.save} />
      {period ? (
        <Button
          label="Remove shift"
          tone="ghost"
          onPress={onArchive}
          disabled={isBusy}
          fullWidth
          accessibilityHint="Past shift reports keep its name"
        />
      ) : null}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.heading,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputError: { borderColor: colors.danger },
  branches: { gap: spacing.sm, marginTop: spacing.sm },
  save: { marginTop: spacing.md },
});
