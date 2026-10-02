import React, { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { DRAWER_NAME_MAX, validateDrawerInput, type CashDrawer, type DrawerInput } from "../../lib/cash-drawers";
import { parseCashInput } from "../../lib/shift";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { CashInput, DrawerSheet, sheetText } from "./DrawerSheet";

interface DrawerEditorSheetProps {
  /** The till being edited, or null when adding one. */
  drawer: CashDrawer | null;
  suggestedName: string;
  siblings: readonly CashDrawer[];
  /** Someone is clocked in on this till right now. */
  isInUse: boolean;
  isBusy: boolean;
  onSave: (input: DrawerInput) => void;
  onArchive: () => void;
  onClose: () => void;
}

/**
 * Add or edit one till: its name, its standard starting cash, and whether it
 * is a zero-balance drawer. Changes apply from the next clock-in; a shift
 * already running keeps what it clocked in under.
 */
export function DrawerEditorSheet({
  drawer,
  suggestedName,
  siblings,
  isInUse,
  isBusy,
  onSave,
  onArchive,
  onClose,
}: DrawerEditorSheetProps) {
  const [name, setName] = useState(drawer?.name ?? suggestedName);
  const [cashText, setCashText] = useState(drawer && drawer.startingCash > 0 ? String(drawer.startingCash) : "");
  const [isZeroBalance, setIsZeroBalance] = useState(drawer?.isZeroBalance ?? false);
  const [error, setError] = useState<{ field: "name" | "startingCash"; reason: string } | null>(null);

  const save = () => {
    const startingCash = cashText.trim() ? parseCashInput(cashText) : 0;
    const verdict = validateDrawerInput({ name, startingCash, isZeroBalance }, siblings, drawer?.id ?? null);
    if (!verdict.ok) {
      setError({ field: verdict.field, reason: verdict.reason });
      return;
    }
    setError(null);
    onSave(verdict.value);
  };

  return (
    <DrawerSheet
      visible
      title={drawer ? "Edit drawer" : "Add a drawer"}
      subtitle={isInUse ? "In use now — changes apply from the next clock-in" : "One per physical cash box"}
      onClose={onClose}
      isBusy={isBusy}
    >
      <Text style={sheetText.label}>Name</Text>
      <TextInput
        style={[styles.input, error?.field === "name" && styles.inputError]}
        value={name}
        onChangeText={(next) => {
          setName(next);
          setError(null);
        }}
        placeholder="Cashier 1"
        placeholderTextColor={colors.textTertiary}
        maxLength={DRAWER_NAME_MAX}
        editable={!isBusy}
        autoFocus={!drawer}
        accessibilityLabel="Drawer name"
      />
      {error?.field === "name" ? <Text style={sheetText.error}>{error.reason}</Text> : null}

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>Zero-balance drawer</Text>
          <Text style={sheetText.hint}>
            Starts every shift empty. At close the cashier hands over everything — no float stays behind.
          </Text>
        </View>
        <Switch
          value={isZeroBalance}
          onValueChange={(next) => {
            setIsZeroBalance(next);
            setError(null);
          }}
          disabled={isBusy}
          trackColor={{ true: colors.accent, false: colors.separator }}
          accessibilityLabel="Zero-balance drawer"
        />
      </View>

      {isZeroBalance ? null : (
        <>
          <Text style={sheetText.label}>Standard starting cash</Text>
          <CashInput
            value={cashText}
            onChangeText={(next) => {
              setCashText(next);
              setError(null);
            }}
            editable={!isBusy}
            hasError={error?.field === "startingCash"}
            accessibilityLabel="Standard starting cash in pesos"
          />
          {error?.field === "startingCash" ? (
            <Text style={sheetText.error}>{error.reason}</Text>
          ) : (
            <Text style={sheetText.hint}>
              The float for change. It is pre-filled at clock-in and stays in the drawer at close.
            </Text>
          )}
        </>
      )}

      <Button
        label={drawer ? "Save drawer" : "Add drawer"}
        onPress={save}
        isLoading={isBusy}
        disabled={isBusy}
        size="lg"
        fullWidth
        style={styles.save}
      />
      {drawer ? (
        <Button
          label="Remove drawer"
          tone="ghost"
          onPress={onArchive}
          disabled={isBusy || isInUse}
          fullWidth
          accessibilityHint={isInUse ? "End the shift on it first" : "Its past shifts stay in the history"}
        />
      ) : null}
      {drawer && isInUse ? <Text style={styles.center}>End the shift on it before removing it.</Text> : null}
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  save: { marginTop: spacing.md },
  center: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
});
