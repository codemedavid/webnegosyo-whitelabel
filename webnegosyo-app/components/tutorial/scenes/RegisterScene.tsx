import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { Icon } from "../../Icon";
import { ProductTile } from "../../pos/ProductTile";
import { CartSheet } from "../../pos/CartSheet";
import { CoachTarget } from "../spotlight";
import type { PosCartLine } from "../../../lib/pos-cart";
import { MOCK_CATEGORIES, mockProducts, type MockProduct } from "../../../lib/tutorial/mock-data";
import { MockViewChip, SceneFrame, type SceneProps } from "./shared";
import { TenderScene } from "./TenderScene";

/** The register, drawn from the real product tiles and cart sheet. */
const ORDER_TYPES = [
  { id: "ot-1", type: "dine_in", name: "Dine In", serviceCharge: undefined, markupPercent: null },
  { id: "ot-2", type: "takeout", name: "Takeout", serviceCharge: undefined, markupPercent: null },
];
const PREFILLED: readonly string[] = ["p1", "p2"];

function toLine(p: MockProduct, quantity: number): PosCartLine {
  return { key: p.id, menuItemId: p.id, name: p.name, basePrice: p.price, quantity, selections: [], unitPrice: p.price, subtotal: p.price * quantity };
}

export function RegisterScene({ phase, tried, onTried }: SceneProps) {
  const products = mockProducts();
  const [counts, setCounts] = useState<Record<string, number>>((): Record<string, number> => (phase === "charge" ? { p1: 2, p2: 1 } : {}));
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(phase === "charge");
  const [orderTypeId, setOrderTypeId] = useState<string | null>("ot-2");

  if (tried && phase === "charge") return <TenderScene phase="due" tried={false} onTried={() => {}} />;

  const add = (p: MockProduct) => {
    const next = { ...counts, [p.id]: (counts[p.id] ?? 0) + 1 };
    setCounts(next);
    const total = Object.values(next).reduce((a, b) => a + b, 0);
    if (phase === "pick" && total >= 2) onTried();
  };
  const changeQty = (key: string, quantity: number) => setCounts((c) => ({ ...c, [key]: Math.max(0, quantity) }));

  const lines = products.filter((p) => counts[p.id]).map((p) => toLine(p, counts[p.id]));
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const shown = products.filter((p) => (category === "All" || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <SceneFrame workspace="register" activeTab="pos">
      <ScreenHeader
        title="POS"
        subtitle={`${products.length} products`}
        leading={<MockViewChip workspace="register" />}
      >
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.textTertiary} />
          <TextInput style={styles.searchInput} placeholder="Search products" placeholderTextColor={colors.textTertiary} value={search} onChangeText={setSearch} />
        </View>
      </ScreenHeader>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railContent}>
        {["All", ...MOCK_CATEGORIES].map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, c === category && styles.chipActive]} onPress={() => setCategory(c)} accessibilityRole="button" accessibilityLabel={c}>
            <Text style={[styles.chipText, c === category && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.gridWrap}>
        <CoachTarget active={phase === "pick" && !tried} padding={4}>
          <View style={styles.grid}>
            {shown.map((p) => (
              <View key={p.id} style={[styles.cell, PREFILLED.includes(p.id) && phase === "pick" && styles.cellHint]}>
                <ProductTile name={p.name} price={p.price} quantity={counts[p.id] ?? 0} hasOptions={p.hasOptions} onPress={() => add(p)} />
              </View>
            ))}
          </View>
        </CoachTarget>
      </ScrollView>
      <CoachTarget active={phase === "charge" && !tried} padding={0}>
        <CartSheet
          lines={lines}
          totals={{ subtotal, serviceCharge: 0, deliveryFee: 0, discountTotal: 0, total: subtotal, itemCount }}
          orderTypes={ORDER_TYPES}
          orderTypeId={orderTypeId}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((v) => !v)}
          onSelectOrderType={(t) => setOrderTypeId(t.id)}
          onChangeQty={changeQty}
          onClear={() => setCounts({})}
          onCharge={() => phase === "charge" && onTried()}
          onAddDiscount={() => {}}
          onEditDelivery={() => {}}
        />
      </CoachTarget>
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 40, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.md },
  searchInput: { ...typography.body, color: colors.textPrimary, flex: 1, paddingVertical: 0 },
  rail: { flexGrow: 0 },
  railContent: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
  chip: { height: 32, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  chipTextActive: { color: colors.textOnDark },
  gridWrap: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  cell: { width: "47.5%" },
  cellHint: {},
});
