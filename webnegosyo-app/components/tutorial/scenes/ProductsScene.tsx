import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { BackHeader } from "../../BackHeader";
import { IconButton } from "../../IconButton";
import { Button } from "../../Button";
import { Card } from "../../Card";
import { Icon } from "../../Icon";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import { MOCK_CATEGORIES, mockProducts, type MockProduct } from "../../../lib/tutorial/mock-data";
import { MockAlert, SceneFrame, type SceneProps } from "./shared";

/** Products (the list with its switches) and the product editor. */
export function ProductsScene({ phase, tried, onTried }: SceneProps) {
  if (phase === "edit" || phase === "margin") return <EditorScene phase={phase} tried={tried} onTried={onTried} />;
  return <ListScene phase={phase} tried={tried} onTried={onTried} />;
}

function marginOf(p: MockProduct): number | null {
  return p.cost === undefined ? null : Math.round(((p.price - p.cost) / p.price) * 100);
}

function ListScene({ phase, tried, onTried }: SceneProps) {
  const [products, setProducts] = useState(() => mockProducts());
  const [category, setCategory] = useState("All");
  const target = "p3";
  const toggle = (id: string, isAvailable: boolean) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isAvailable } : p)));
    if (phase === "availability" && id === target && !isAvailable) onTried();
  };
  const shown = products.filter((p) => category === "All" || p.category === category);
  const soldOut = products.find((p) => p.id === target && !p.isAvailable);

  return (
    <SceneFrame activeTab="product-management">
      <ScreenHeader
        title="Products"
        subtitle="Create, edit, and price your menu"
        actions={<IconButton icon="plus" label="Add product" tone="primary" onPress={() => {}} />}
      >
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.textTertiary} />
          <Text style={styles.searchPlaceholder}>Search products</Text>
        </View>
      </ScreenHeader>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railContent}>
        {["All", ...MOCK_CATEGORIES].map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, c === category && styles.chipActive]} onPress={() => setCategory(c)} accessibilityRole="button" accessibilityLabel={c}>
            <Text style={[styles.chipText, c === category && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.content}>
        {soldOut && tried ? (
          <View style={styles.preview}>
            <Text style={styles.previewEyebrow}>On your online menu right now</Text>
            <View style={styles.previewRow}>
              <View style={[styles.previewPhoto, styles.previewPhotoOff]} />
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, styles.muted]}>{soldOut.name}</Text>
                <Text style={[styles.meta, styles.muted]}>{formatPeso(soldOut.price)}</Text>
              </View>
              <View style={styles.soldOutPill}><Text style={styles.soldOutText}>Sold out</Text></View>
            </View>
          </View>
        ) : null}
        <View style={styles.list}>
          {shown.map((p, i) => {
            const margin = marginOf(p);
            const row = (
              <View style={[styles.row, i < shown.length - 1 && styles.rowGrouped]}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{p.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>{formatPeso(p.price)}</Text>
                    {!p.isAvailable ? <Text style={styles.outBadge}>Out of stock</Text> : null}
                    {margin === null ? (
                      <Text style={styles.meta}>Set cost in Products tab</Text>
                    ) : (
                      <Text style={[styles.marginBadge, margin < 0 && styles.marginBad]}>{margin}% margin</Text>
                    )}
                  </View>
                </View>
                <Switch value={p.isAvailable} onValueChange={(v) => toggle(p.id, v)} trackColor={{ true: colors.success, false: colors.separator }} accessibilityLabel={`${p.name} available`} />
              </View>
            );
            return p.id === target && phase === "availability" && !tried ? (
              <CoachTarget key={p.id} active padding={0}>{row}</CoachTarget>
            ) : (
              <View key={p.id}>{row}</View>
            );
          })}
        </View>
      </ScrollView>
    </SceneFrame>
  );
}

const COST_SUGGESTIONS = [30, 45, 70];

function EditorScene({ phase, tried, onTried }: SceneProps) {
  const [name, setName] = useState("Iced Latte");
  const [price, setPrice] = useState("120.00");
  const [cost, setCost] = useState<string>("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const margin = cost ? Math.round(((Number(price) - Number(cost)) / Number(price)) * 100) : null;

  return (
    <SceneFrame activeTab="product-management">
      <BackHeader title="Edit Product" subtitle="Iced Latte" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.photoRow}>
          <View style={styles.photo}><Text style={styles.photoText}>+ Add Photo</Text></View>
          <View style={styles.fields}>
            <Field label="Name" value={name} onChange={setName} />
            <View style={styles.fieldPair}>
              <Field label="Price (₱)" value={price} onChange={setPrice} />
              <Field label="Discounted Price" value="" placeholder="Optional" onChange={() => {}} />
            </View>
          </View>
        </View>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {MOCK_CATEGORIES.map((c, i) => (
            <View key={c} style={[styles.chip, i === 0 && styles.chipActive]}><Text style={[styles.chipText, i === 0 && styles.chipTextActive]}>{c}</Text></View>
          ))}
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Available</Text>
          <Switch value={isAvailable} onValueChange={setIsAvailable} trackColor={{ true: colors.success, false: colors.separator }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Featured</Text>
          <Switch value={isFeatured} onValueChange={setIsFeatured} trackColor={{ true: colors.success, false: colors.separator }} />
        </View>
        <CoachTarget active={phase === "margin" && !tried}>
          <Card title="Cost & Profit">
            <Text style={styles.label}>Cost Price (₱)</Text>
            <TextInput style={styles.input} placeholder="What this item costs to make" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" value={cost} onChangeText={(v) => { setCost(v); if (phase === "margin" && Number(v) > 0) onTried(); }} />
            <View style={styles.chipRow}>
              {COST_SUGGESTIONS.map((c) => (
                <TouchableOpacity key={c} style={styles.quick} onPress={() => { setCost(String(c)); if (phase === "margin") onTried(); }} accessibilityRole="button" accessibilityLabel={`₱${c}`}>
                  <Text style={styles.quickText}>₱{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.marginLine, margin !== null && margin < 0 && styles.marginBad]}>
              {margin === null ? "Enter a cost to see the margin" : `${margin}% margin · ${formatPeso(Number(price) - Number(cost))} profit per sale`}
            </Text>
          </Card>
        </CoachTarget>
        <CoachTarget active={phase === "edit" && !tried}>
          <Button label={isSaved ? "Saved" : "Save Product"} onPress={() => { setIsSaved(true); if (phase === "edit") onTried(); }} size="lg" icon={isSaved ? "check" : undefined} />
        </CoachTarget>
        <Button label="Delete Product" tone="danger" onPress={() => {}} size="lg" />
      </ScrollView>
      {isSaved && phase === "edit" ? (
        <MockAlert title="Saved" message="Product saved successfully." actions={[{ label: "OK", tone: "bold", onPress: () => setIsSaved(false) }]} />
      ) : null}
    </SceneFrame>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} placeholder={placeholder} placeholderTextColor={colors.textTertiary} onChangeText={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 40, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.md },
  searchPlaceholder: { ...typography.body, color: colors.textTertiary },
  rail: { flexGrow: 0 },
  railContent: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
  chip: { height: 32, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  chipTextActive: { color: colors.textOnDark },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.card },
  rowGrouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  meta: { ...typography.caption, color: colors.textSecondary },
  outBadge: { ...typography.small, fontWeight: "800", color: colors.danger, backgroundColor: colors.dangerLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  marginBadge: { ...typography.small, fontWeight: "800", color: colors.success, backgroundColor: colors.successLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  marginBad: { color: colors.danger, backgroundColor: colors.dangerLight },
  preview: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, padding: spacing.md, gap: spacing.sm },
  previewEyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  previewPhoto: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: "#E8B98A" },
  previewPhotoOff: { opacity: 0.35 },
  muted: { color: colors.textTertiary },
  soldOutPill: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  soldOutText: { ...typography.caption, fontWeight: "800", color: colors.textSecondary },
  photoRow: { flexDirection: "row", gap: spacing.md },
  photo: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.textTertiary, alignItems: "center", justifyContent: "center" },
  photoText: { ...typography.caption, color: colors.textSecondary },
  fields: { flex: 1, gap: spacing.sm },
  fieldPair: { flexDirection: "row", gap: spacing.sm },
  field: { flex: 1, gap: 4 },
  label: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  input: { height: 44, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.md, ...typography.body, color: colors.textPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  switchLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  quick: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  quickText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  marginLine: { ...typography.caption, fontWeight: "700", color: colors.success, marginTop: spacing.sm },
});
