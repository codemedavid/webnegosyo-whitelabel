import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../../../stores/auth-store";
import { useBranchScope } from "../../../../lib/use-branch-scope";
import {
  EMPTY_INGREDIENT_DRAFT,
  buildIngredientPayload,
  canChangeStockUnit,
  draftFromIngredient,
  findNameClash,
  groupUnitsByDimension,
  parseOpeningStock,
  suggestCategories,
  type IngredientDraft,
  type IngredientRecord,
  type UnitDimension,
  type UnitOption,
} from "../../../../lib/ingredient-form";
import {
  createIngredient,
  loadIngredientIndex,
  loadIngredientRecord,
  loadUnitOptions,
  setIngredientActive,
  updateIngredient,
  type IngredientIndexRow,
} from "../../../../lib/ingredient-service";
import { submitStockMovement } from "../../../../lib/inventory-movement-service";
import { newLocalOrderId } from "../../../../lib/offline/local-id";
import { NEW_INGREDIENT_ID, ingredientHref } from "../../../../lib/navigation";
import { colors, typography, spacing, radius, shadow } from "../../../../theme/colors";
import { BackHeader } from "../../../../components/BackHeader";
import { LoadingState } from "../../../../components/LoadingState";
import { ErrorState } from "../../../../components/ErrorState";
import { Icon } from "../../../../components/Icon";
import { SectionHeader } from "../../../../components/SectionHeader";
import { Button } from "../../../../components/Button";

/**
 * Creating or editing an ingredient on the phone.
 *
 * Every rule lives in lib/ingredient-form.ts; this lays the fields out in the
 * order a merchant thinks about a new delivery: what is it, what do I count it
 * in, what does it cost, when should I worry. The unit is locked while stock
 * is on hand, because changing it would silently re-read the quantity.
 */
export default function IngredientEditorScreen() {
  const { ingredientId } = useLocalSearchParams<{ ingredientId: string }>();
  const isNew = !ingredientId || ingredientId === NEW_INGREDIENT_ID;
  const insets = useSafeAreaInsets();
  const tenantId = useAuthStore((s) => s.tenantId);
  const scope = useBranchScope();
  const outletId = scope.kind === "branch" ? scope.outletId : undefined;

  const [draft, setDraft] = useState<IngredientDraft>(EMPTY_INGREDIENT_DRAFT);
  const [existing, setExisting] = useState<IngredientRecord | null>(null);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [index, setIndex] = useState<IngredientIndexRow[]>([]);
  const [dimension, setDimension] = useState<UnitDimension>("weight");
  const [openingStock, setOpeningStock] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setLoadError(null);
    setFormError(null);
    setOpeningStock("");
    try {
      const [unitOptions, rows, record] = await Promise.all([
        loadUnitOptions(tenantId),
        loadIngredientIndex(tenantId).catch(() => [] as IngredientIndexRow[]),
        isNew ? Promise.resolve(null) : loadIngredientRecord(tenantId, ingredientId),
      ]);
      if (!isNew && !record) {
        setLoadError("This ingredient no longer exists.");
        return;
      }
      setUnits(unitOptions);
      setIndex(rows);
      setExisting(record);
      const nextDraft = record ? draftFromIngredient(record) : EMPTY_INGREDIENT_DRAFT;
      setDraft(nextDraft);
      const selected = unitOptions.find((unit) => unit.id === nextDraft.stockUnitId);
      setDimension(selected?.dimension ?? "weight");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not open the editor.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, ingredientId, isNew]);

  // Tab screens stay mounted: every visit starts from the saved row.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = useMemo(() => groupUnitsByDimension(units), [units]);
  const visibleUnits = groups.find((group) => group.dimension === dimension)?.units ?? [];
  const selectedUnit = units.find((unit) => unit.id === draft.stockUnitId) ?? null;
  const unitLabel = selectedUnit?.abbreviation ?? "unit";
  const isUnitLocked = !canChangeStockUnit(existing);
  const categories = useMemo(() => suggestCategories(index), [index]);
  const clash = findNameClash(draft.name, index, existing?.id ?? null);

  const update = (patch: Partial<IngredientDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const recordOpeningStock = async (newId: string, quantity: number, unitId: string) => {
    try {
      await submitStockMovement(
        tenantId ?? "",
        { inventory_item_id: newId, reason: "stocktake", quantity, unit_id: unitId, note: "Opening stock" },
        outletId,
        { clientRequestId: newLocalOrderId() },
      );
    } catch (error) {
      // The ingredient exists either way; say plainly which half landed.
      Alert.alert(
        "Ingredient saved — opening stock was not",
        `${error instanceof Error ? error.message : "Try again."} Count it from the ingredient's page.`,
      );
    }
  };

  const save = async () => {
    if (!tenantId || isSaving) return;
    setFormError(null);

    let payload;
    let opening: number | null = null;
    try {
      payload = buildIngredientPayload(draft);
      if (isNew) opening = parseOpeningStock(openingStock);
    } catch (validationError) {
      setFormError(validationError instanceof Error ? validationError.message : "Check the form.");
      return;
    }

    setIsSaving(true);
    try {
      if (isNew) {
        const newId = await createIngredient(tenantId, payload);
        if (opening !== null) await recordOpeningStock(newId, opening, payload.stock_unit_id);
        router.replace(ingredientHref(newId));
      } else {
        await updateIngredient(tenantId, ingredientId, payload);
        router.back();
      }
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "That did not save.");
    } finally {
      setIsSaving(false);
    }
  };

  const archive = () => {
    if (!tenantId || !existing) return;
    Alert.alert(
      `Archive ${existing.name}?`,
      "It leaves the shelf and stock counts. Its history is kept, and you can restore it from the Stock screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            setIsSaving(true);
            try {
              await setIngredientActive(tenantId, existing.id, false);
              router.back();
            } catch (archiveError) {
              setFormError(archiveError instanceof Error ? archiveError.message : "That did not archive.");
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  };

  const title = isNew ? "New ingredient" : "Edit ingredient";

  if (isLoading || loadError) {
    return (
      <View style={styles.screen}>
        <BackHeader title={title} />
        {loadError ? <ErrorState message={loadError} onRetry={load} /> : <LoadingState message="Opening..." />}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <BackHeader title={title} subtitle={isNew ? "Something you buy and track" : existing?.name} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* What is it */}
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.nameInput}
              value={draft.name}
              onChangeText={(name) => update({ name })}
              placeholder="e.g. Bread flour"
              placeholderTextColor={colors.textTertiary}
              autoFocus={isNew}
              autoCapitalize="words"
              returnKeyType="next"
            />
            {clash && (
              <View style={styles.hintRow}>
                <Icon name="info" size={14} color={colors.statusPending.text} />
                <Text style={styles.hintWarn}>You already have “{clash}”. Saving makes a second one.</Text>
              </View>
            )}

            <View style={styles.divider} />

            <Text style={styles.label}>Category</Text>
            <TextInput
              style={styles.input}
              value={draft.category}
              onChangeText={(category) => update({ category })}
              placeholder="e.g. Dry goods"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {categories.map((name) => {
                const isActive = draft.category.trim().toLowerCase() === name.toLowerCase();
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.chip, isActive && styles.chipActive]}
                    onPress={() => update({ category: isActive ? "" : name })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* What do I count it in */}
          <SectionHeader title="Stocked in" style={styles.section} />
          <View style={styles.card}>
            {isUnitLocked ? (
              <View style={styles.locked}>
                <View style={styles.lockedUnit}>
                  <Text style={styles.lockedUnitText}>{selectedUnit?.name ?? "Unknown unit"}</Text>
                  <Text style={styles.lockedAbbrev}>{selectedUnit?.abbreviation}</Text>
                </View>
                <Text style={styles.hint}>
                  Locked while there is stock on hand — changing it would turn 12 kg into 12 g. Count it to zero
                  first to change the unit.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.segments}>
                  {groups.map((group) => {
                    const isActive = group.dimension === dimension;
                    return (
                      <TouchableOpacity
                        key={group.dimension}
                        style={[styles.segment, isActive && styles.segmentActive]}
                        onPress={() => setDimension(group.dimension)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                          {group.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.unitGrid}>
                  {visibleUnits.map((unit) => {
                    const isActive = unit.id === draft.stockUnitId;
                    return (
                      <TouchableOpacity
                        key={unit.id}
                        style={[styles.unit, isActive && styles.unitActive]}
                        onPress={() => update({ stockUnitId: unit.id })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={unit.name}
                      >
                        <Text style={[styles.unitAbbrev, isActive && styles.unitTextActive]}>{unit.abbreviation}</Text>
                        <Text style={[styles.unitName, isActive && styles.unitNameActive]} numberOfLines={1}>
                          {unit.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.hint}>Pick the unit you count it in on the shelf.</Text>
              </>
            )}
          </View>

          {/* Money and warnings */}
          <SectionHeader title="Cost and alerts" style={styles.section} />
          <View style={styles.card}>
            <Text style={styles.label}>Cost per {unitLabel}</Text>
            <View style={styles.affixInput}>
              <Text style={styles.affix}>₱</Text>
              <TextInput
                style={styles.affixField}
                value={draft.unitCost}
                onChangeText={(unitCost) => update({ unitCost })}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>Used for stock value and dish costs. Deliveries with a price update it.</Text>

            <View style={styles.divider} />

            <Text style={styles.label}>Reorder level</Text>
            <View style={styles.affixInput}>
              <TextInput
                style={styles.affixField}
                value={draft.reorderLevel}
                onChangeText={(reorderLevel) => update({ reorderLevel })}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
              <Text style={styles.affix}>{unitLabel}</Text>
            </View>
            <Text style={styles.hint}>Marked as running low at or below this. Leave blank to only flag when it runs out.</Text>
          </View>

          {isNew && (
            <>
              <SectionHeader title="Opening stock" style={styles.section} />
              <View style={styles.card}>
                <Text style={styles.label}>How much is on the shelf right now?</Text>
                <View style={styles.affixInput}>
                  <TextInput
                    style={[styles.affixField, styles.bigField]}
                    value={openingStock}
                    onChangeText={setOpeningStock}
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.affix}>{unitLabel}</Text>
                </View>
                <Text style={styles.hint}>
                  Recorded as a count{scope.kind === "branch" ? " on this branch's shelf" : ""}, so the history
                  shows where it came from.
                </Text>
              </View>
            </>
          )}

          <SectionHeader title="More" style={styles.section} />
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchTitle}>Made in-house</Text>
                <Text style={styles.hint}>A sauce, dough or syrup you prepare from other ingredients.</Text>
              </View>
              <Switch
                value={draft.isPrep}
                onValueChange={(isPrep) => update({ isPrep })}
                trackColor={{ true: colors.success, false: colors.separator }}
              />
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>SKU or supplier code</Text>
            <TextInput
              style={styles.input}
              value={draft.sku}
              onChangeText={(sku) => update({ sku })}
              placeholder="Optional"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          {!isNew && existing && (
            <Button
              label="Archive ingredient"
              icon="trash"
              tone="danger"
              onPress={archive}
              disabled={isSaving}
              fullWidth
              style={styles.archive}
            />
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {formError && <Text style={styles.error}>{formError}</Text>}
          <Button
            label={isNew ? "Add ingredient" : "Save changes"}
            onPress={save}
            size="lg"
            isLoading={isSaving}
            disabled={isSaving}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.xs, gap: spacing.md, paddingBottom: 32 },

  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  section: { marginTop: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  nameInput: { fontSize: 24, fontWeight: "800", letterSpacing: -0.4, color: colors.textPrimary, paddingVertical: 4 },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: spacing.sm },
  hint: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  hintWarn: { flex: 1, ...typography.caption, color: colors.statusPending.text },

  chips: { gap: spacing.sm, paddingTop: 2 },
  chip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.heroInk, borderColor: colors.heroInk },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  chipTextActive: { color: colors.heroInkText },

  segments: { flexDirection: "row", gap: 4, padding: 4, borderRadius: radius.md + 2, backgroundColor: colors.primaryLight },
  segment: { flex: 1, height: 36, borderRadius: radius.md - 2, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: colors.card, ...shadow.sm },
  segmentText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  segmentTextActive: { color: colors.textPrimary },
  unitGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  unit: {
    width: "31%",
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md + 2,
    borderWidth: 1.5,
    borderColor: colors.separator,
    alignItems: "center",
    gap: 2,
  },
  unitActive: { borderColor: colors.heroInk, backgroundColor: colors.heroInk },
  unitAbbrev: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  unitTextActive: { color: colors.heroInkText },
  unitName: { fontSize: 11, color: colors.textSecondary },
  unitNameActive: { color: colors.heroInkMuted },
  locked: { gap: spacing.sm },
  lockedUnit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  lockedUnitText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  lockedAbbrev: { fontSize: 15, fontWeight: "800", color: colors.textSecondary },

  affixInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  affix: { fontSize: 16, fontWeight: "700", color: colors.textSecondary },
  affixField: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.textPrimary, paddingVertical: spacing.sm },
  bigField: { fontSize: 28, fontWeight: "800" },

  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },

  archive: { marginTop: spacing.lg },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    gap: spacing.sm,
  },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600", textAlign: "center" },
});
