import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { InventoryStockCard } from "../../InventoryStockCard";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { CoachTarget } from "../spotlight";
import type { StockItemView, StockLevel } from "../../../lib/inventory-stock";
import { mockStock } from "../../../lib/tutorial/mock-data";
import { MockSheet, MockToast, SceneFrame, type SceneProps } from "./shared";

/** Stock: the shelf verdict, its three filters, and recording a delivery. */
const LEVELS: { key: StockLevel; label: string; color: string; bg: string }[] = [
  { key: "out", label: "Out", color: colors.danger, bg: colors.dangerLight },
  { key: "low", label: "Low", color: colors.statusPending.text, bg: colors.warningLight },
  { key: "ok", label: "Stocked", color: colors.success, bg: colors.successLight },
];
const REASONS = ["Received", "Counted", "Wasted"] as const;
type Reason = (typeof REASONS)[number];
const PROMPT: Record<Reason, string> = { Received: "How much arrived", Counted: "How much is actually on the shelf", Wasted: "How much was thrown away" };

export function StockScene({ phase, tried, onTried }: SceneProps) {
  const [items, setItems] = useState<StockItemView[]>(() => mockStock());
  const [filter, setFilter] = useState<StockLevel | null>(null);
  const [editing, setEditing] = useState<StockItemView | null>(null);
  const [reason, setReason] = useState<Reason>("Received");
  const [qty, setQty] = useState("5");
  const [isRecorded, setIsRecorded] = useState(false);

  const counts = { out: items.filter((i) => i.level === "out").length, low: items.filter((i) => i.level === "low").length, ok: items.filter((i) => i.level === "ok").length };
  const headline = counts.out === 0 && counts.low === 0 ? "Everything is in stock" : [counts.out ? `${counts.out} out` : "", counts.low ? `${counts.low} low` : ""].filter(Boolean).join(", ");
  const shown = items.filter((i) => !filter || i.level === filter);
  const amount = Number(qty) || 0;
  const after = editing ? (reason === "Received" ? editing.quantity + amount : reason === "Counted" ? amount : Math.max(0, editing.quantity - amount)) : 0;

  const record = () => {
    if (!editing) return;
    setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, quantity: after, level: after <= 0 ? "out" : after < i.reorderLevel ? "low" : "ok" } : i)));
    setEditing(null);
    setIsRecorded(true);
    if (phase === "record") onTried();
  };

  return (
    <SceneFrame activeTab="inventory">
      <ScreenHeader title="Stock" subtitle="Tap an ingredient to record stock" />
      <ScrollView contentContainerStyle={styles.content}>
        {isRecorded ? <MockToast text="Espresso beans · 5 kg received" /> : null}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Shelf status</Text>
          <Text style={styles.heroTitle}>{headline}</Text>
          <CoachTarget active={phase === "shelf" && !tried} padding={4}>
            <View style={styles.segments}>
              {LEVELS.map((l) => {
                const isActive = filter === l.key;
                return (
                  <TouchableOpacity
                    key={l.key}
                    style={[styles.segment, { backgroundColor: l.bg }, isActive && { borderColor: l.color }]}
                    onPress={() => { const next = isActive ? null : l.key; setFilter(next); if (phase === "shelf" && next === "low") onTried(); }}
                    accessibilityRole="button"
                    accessibilityLabel={l.label}
                  >
                    <Text style={[styles.segCount, { color: l.color }]}>{counts[l.key]}</Text>
                    <Text style={[styles.segLabel, { color: l.color }]}>{l.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </CoachTarget>
          {filter ? <Text style={styles.filterNote}>Showing one group — tap to show everything</Text> : null}
        </View>
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.textTertiary} />
          <Text style={styles.searchPlaceholder}>Search ingredients</Text>
        </View>
        {shown.map((item) =>
          item.id === "s1" && phase === "record" && !tried && !editing ? (
            <CoachTarget key={item.id} active padding={4}>
              <InventoryStockCard item={item} onPress={setEditing} />
            </CoachTarget>
          ) : (
            <InventoryStockCard key={item.id} item={item} onPress={setEditing} />
          ),
        )}
      </ScrollView>

      {editing ? (
        <MockSheet title={editing.name} hint={`${editing.quantity} ${editing.unitAbbreviation} on the shelf`}>
          <View style={styles.reasons}>
            {REASONS.map((r) => (
              <TouchableOpacity key={r} style={[styles.reason, reason === r && styles.reasonActive]} onPress={() => setReason(r)} accessibilityRole="button" accessibilityLabel={r}>
                <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>{PROMPT[reason]}</Text>
          <View style={styles.qtyRow}>
            <TextInput style={styles.qtyInput} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
            <Text style={styles.unit}>{editing.unitAbbreviation}</Text>
          </View>
          <View style={styles.preview}>
            <Text style={styles.previewBefore}>{editing.quantity} {editing.unitAbbreviation}</Text>
            <Icon name="arrow-right" size={14} color={colors.textSecondary} />
            <Text style={styles.previewAfter}>{after} {editing.unitAbbreviation}</Text>
          </View>
          <View style={styles.sheetActions}>
            <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} />
            <CoachTarget active={phase === "record" && !tried}>
              <Button label={`Record ${reason}`} onPress={record} />
            </CoachTarget>
          </View>
        </MockSheet>
      ) : null}
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  hero: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  heroEyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  heroTitle: { ...typography.heading, color: colors.textPrimary },
  segments: { flexDirection: "row", gap: spacing.sm },
  segment: { flex: 1, borderRadius: radius.md, padding: spacing.md, borderWidth: 2, borderColor: "transparent" },
  segCount: { ...typography.title },
  segLabel: { ...typography.caption, fontWeight: "700" },
  filterNote: { ...typography.caption, color: colors.textSecondary },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 40, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.md },
  searchPlaceholder: { ...typography.body, color: colors.textTertiary },
  reasons: { flexDirection: "row", gap: spacing.sm },
  reason: { flex: 1, height: 40, borderRadius: radius.full, borderWidth: 1, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  reasonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  reasonText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  reasonTextActive: { color: colors.textOnDark },
  label: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyInput: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.surfaceSubtle, paddingHorizontal: spacing.lg, fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  unit: { ...typography.body, color: colors.textSecondary },
  preview: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xs },
  previewBefore: { ...typography.body, fontWeight: "700", color: colors.textSecondary },
  previewAfter: { ...typography.body, fontWeight: "800", color: colors.success },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
});
