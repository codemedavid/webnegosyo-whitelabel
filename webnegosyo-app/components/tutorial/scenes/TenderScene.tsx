import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { BackHeader } from "../../BackHeader";
import { SwipeToComplete } from "../../pos/SwipeToComplete";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import { type SceneProps } from "./shared";
import { DrawerScene } from "./DrawerScene";

/** Taking the payment for the sale rung up on the register. */
const DUE = 325;
const METHODS = ["Cash", "GCash", "Maya", "Card"];
const QUICK = [325, 350, 400, 500];

export function TenderScene({ phase, tried, onTried }: SceneProps) {
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<string | null>(phase === "complete" ? "Cash" : null);
  const [received, setReceived] = useState<string>(phase === "complete" ? "500" : "");
  const [customer, setCustomer] = useState("");

  if (tried && phase === "complete") return <DrawerScene phase="recorded" tried={false} onTried={() => {}} />;

  const cash = Number(received) || 0;
  const change = cash - DUE;
  const isReady = method !== null && (method !== "Cash" || change >= 0);

  const takeCash = (amount: number) => {
    setReceived(String(amount));
    if (phase === "tender" && amount >= DUE) onTried();
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="Take payment" subtitle="Takeout · 3 items" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Amount due</Text>
        <Text style={styles.due}>{formatPeso(DUE)}</Text>
        <TextInput style={styles.field} placeholder="Customer name (optional)" placeholderTextColor={colors.textTertiary} value={customer} onChangeText={setCustomer} />
        <CoachTarget active={phase === "tender" && !tried} padding={6}>
          <View style={styles.block}>
            <Text style={styles.label}>Payment method</Text>
            <View style={styles.chips}>
              {METHODS.map((m) => (
                <TouchableOpacity key={m} style={[styles.chip, method === m && styles.chipActive]} onPress={() => setMethod(m)} accessibilityRole="button" accessibilityLabel={m}>
                  <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {method === "Cash" ? (
              <>
                <Text style={styles.label}>Cash received</Text>
                <TextInput style={styles.amountField} placeholder="0.00" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" value={received} onChangeText={(v) => { setReceived(v); if (phase === "tender" && Number(v) >= DUE) onTried(); }} />
                <View style={styles.chips}>
                  {QUICK.map((q) => (
                    <TouchableOpacity key={q} style={styles.quick} onPress={() => takeCash(q)} accessibilityRole="button" accessibilityLabel={`₱${q}`}>
                      <Text style={styles.quickText}>₱{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.change, change >= 0 && received !== "" && styles.changeReady]}>
                  <Text style={[styles.changeLabel, change >= 0 && received !== "" && styles.changeTextReady]}>Change</Text>
                  <Text style={[styles.changeAmount, change >= 0 && received !== "" && styles.changeTextReady]}>
                    {received === "" ? "—" : formatPeso(Math.max(0, change))}
                  </Text>
                </View>
              </>
            ) : method ? (
              <View style={styles.qrBlock}>
                <Text style={styles.label}>Show this to the customer</Text>
                <View style={styles.qr} />
                <Text style={styles.meta}>{method} · 0917 555 0100 · Maria&apos;s Kitchen</Text>
                <TextInput style={styles.field} placeholder="Reference number" placeholderTextColor={colors.textTertiary} />
              </View>
            ) : null}
          </View>
        </CoachTarget>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <CoachTarget active={phase === "complete" && !tried} padding={4}>
          <SwipeToComplete
            label={`Swipe to complete ${formatPeso(DUE)}`}
            blockedReason={isReady ? undefined : "Pick a payment method"}
            disabled={!isReady}
            onComplete={() => phase === "complete" && onTried()}
          />
        </CoachTarget>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  due: { fontSize: 40, fontWeight: "800", color: colors.textPrimary, letterSpacing: -1, marginTop: -6 },
  field: { height: 48, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.lg, ...typography.body, color: colors.textPrimary },
  block: { gap: spacing.sm },
  label: { ...typography.caption, fontWeight: "700", color: colors.textSecondary, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  chipTextActive: { color: colors.textOnDark },
  amountField: { height: 56, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.lg, fontSize: 24, fontWeight: "800", color: colors.textPrimary },
  quick: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  quickText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  change: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, padding: spacing.lg, ...shadow.sm },
  changeReady: { backgroundColor: colors.successLight, borderColor: colors.success },
  changeLabel: { ...typography.body, fontWeight: "700", color: colors.textSecondary },
  changeAmount: { ...typography.title, color: colors.textPrimary },
  changeTextReady: { color: colors.success },
  qrBlock: { alignItems: "center", gap: spacing.sm, alignSelf: "stretch" },
  qr: { width: 140, height: 140, borderRadius: radius.md, backgroundColor: colors.primary },
  meta: { ...typography.caption, color: colors.textSecondary },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, backgroundColor: colors.background },
});
