import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { BackHeader } from "../../BackHeader";
import { Card } from "../../Card";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import { mockIncomingOrder } from "../../../lib/tutorial/mock-data";
import { MockAlert, type SceneProps } from "./shared";

/** Printer settings and the pickup scanner. */
export function ToolsScene({ phase, tried, onTried }: SceneProps) {
  if (phase === "scan" || phase === "camera") return <ScanScene phase={phase} tried={tried} onTried={onTried} />;
  return <PrinterScene phase={phase} tried={tried} onTried={onTried} />;
}

const SCAN_MS = 1100;
const TRIGGERS = [
  { key: "confirmation", label: "On order confirmation", hint: "Prints when you accept the order" },
  { key: "billout", label: "On bill out", hint: "Prints when payment is settled" },
  { key: "both", label: "Both", hint: "On confirm and again on payment" },
  { key: "never", label: "Never", hint: "Only print when you tap Reprint Receipt" },
];

function PrinterScene({ phase, tried, onTried }: SceneProps) {
  const [stage, setStage] = useState<"idle" | "scanning" | "found">("idle");
  const [hasPrinter, setHasPrinter] = useState(phase !== "printer");
  const [trigger, setTrigger] = useState("confirmation");
  const [autoPrint, setAutoPrint] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [tab, setTab] = useState<"bluetooth" | "network">("bluetooth");

  useEffect(() => {
    if (stage !== "scanning") return;
    const id = setTimeout(() => setStage("found"), SCAN_MS);
    return () => clearTimeout(id);
  }, [stage]);

  return (
    <View style={styles.screen}>
      <BackHeader title="Printer" subtitle="Receipt and kitchen printers" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card title="Your Printers">
          <Text style={styles.hint}>Cashier printers print customer receipts. Kitchen printers print kitchen tickets.</Text>
          {hasPrinter ? (
            <View style={styles.printerRow}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <View style={styles.printerCopy}>
                <Text style={styles.printerName}>XP-58 Receipt</Text>
                <Text style={styles.meta}>Bluetooth · 66:22:A1:9C:0B:3D</Text>
                <View style={styles.roles}>
                  <View style={[styles.role, styles.roleOn]}><Icon name="check" size={10} color={colors.success} strokeWidth={3} /><Text style={styles.roleOnText}>Cashier</Text></View>
                  <View style={styles.role}><Text style={styles.roleText}>Kitchen</Text></View>
                </View>
              </View>
              <View style={styles.printerActions}>
                <Button label="Test Print" size="sm" tone="secondary" onPress={() => setShowTest(true)} />
                <Button label="Remove" size="sm" tone="ghost" onPress={() => {}} />
              </View>
            </View>
          ) : (
            <Text style={styles.empty}>No printer configured — add one below</Text>
          )}
        </Card>
        <Card title="Kitchen Auto-Print">
          <View style={styles.switchRow}>
            <Text style={styles.switchHint}>Print the kitchen ticket automatically the moment a new order arrives.</Text>
            <Switch value={autoPrint} onValueChange={setAutoPrint} trackColor={{ true: colors.success, false: colors.separator }} disabled={!hasPrinter} />
          </View>
        </Card>
        <CoachTarget active={phase === "trigger" && !tried} padding={0}>
          <Card title="When receipts print">
            {TRIGGERS.map((t) => {
              const isOn = trigger === t.key;
              return (
                <TouchableOpacity key={t.key} style={styles.radioRow} onPress={() => { setTrigger(t.key); if (phase === "trigger" && t.key === "billout") onTried(); }} accessibilityRole="radio" accessibilityState={{ checked: isOn }} accessibilityLabel={t.label}>
                  <View style={[styles.radio, isOn && styles.radioOn]}>{isOn ? <Icon name="check" size={12} color={colors.textOnDark} strokeWidth={3} /> : null}</View>
                  <View style={styles.printerCopy}>
                    <Text style={styles.printerName}>{t.label}</Text>
                    <Text style={styles.meta}>{t.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Card>
        </CoachTarget>
        {!hasPrinter ? (
          <Card title="Add a Printer">
            <View style={styles.tabs}>
              {(["bluetooth", "network"] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
                  <Text style={[styles.tab, tab === t && styles.tabActive]}>{t === "bluetooth" ? "Bluetooth" : "Network"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {stage === "found" ? (
              <View style={styles.found}>
                <Icon name="printer" size={18} color={colors.textPrimary} />
                <Text style={styles.printerName}>XP-58 Receipt</Text>
                <CoachTarget active={phase === "printer" && !tried}>
                  <Button label="Add" size="sm" onPress={() => { setHasPrinter(true); setStage("idle"); if (phase === "printer") onTried(); }} />
                </CoachTarget>
              </View>
            ) : (
              <CoachTarget active={phase === "printer" && !tried && stage === "idle"}>
                <Button label={stage === "scanning" ? "Scanning…" : "Scan for Printers"} tone="secondary" icon="search" onPress={() => setStage("scanning")} isLoading={stage === "scanning"} size="lg" />
              </CoachTarget>
            )}
          </Card>
        ) : null}
      </ScrollView>
      {showTest ? (
        <MockAlert title="Test Sent" message="Test data was sent to the printer. If nothing came out, the printer may not be ESC/POS compatible." actions={[{ label: "OK", tone: "bold", onPress: () => setShowTest(false) }]} />
      ) : null}
    </View>
  );
}

function ScanScene({ phase, tried, onTried }: SceneProps) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<"camera" | "review">("camera");
  const order = mockIncomingOrder();

  if (tried && phase === "scan") {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <View style={styles.resultBadge}><Icon name="check" size={34} color={colors.textOnDark} strokeWidth={2.5} /></View>
        <Text style={styles.resultTitle}>Pickup confirmed</Text>
        <Text style={styles.resultBody}>Handed over to {order.customerName}.</Text>
        <Button label="Scan next" tone="secondary" onPress={() => {}} size="lg" style={styles.resultButton} />
      </View>
    );
  }

  if (stage === "review") {
    return (
      <View style={styles.screen}>
        <BackHeader title="Confirm pickup" subtitle={order.customerName} />
        <ScrollView contentContainerStyle={styles.content}>
          <Card title="Collecting">
            <Text style={styles.printerName}>{order.customerName}</Text>
            <Text style={styles.meta}>{order.customerContact} · Pickup · {formatPeso(order.total)} paid</Text>
          </Card>
          <Card title={`Items (${order.itemCount})`}>
            {order.lines.map((l) => (
              <Text key={l.name} style={styles.line}>{l.quantity}× {l.name}</Text>
            ))}
          </Card>
          <CoachTarget active={!tried} padding={4}>
            <TouchableOpacity style={styles.slide} onPress={onTried} accessibilityRole="button" accessibilityLabel="Slide to confirm pickup">
              <View style={styles.slideKnob}><Icon name="arrow-right" size={18} color={colors.textOnDark} /></View>
              <Text style={styles.slideText}>Slide to confirm pickup</Text>
            </TouchableOpacity>
          </CoachTarget>
          <Button label="Cancel" tone="ghost" onPress={() => setStage("camera")} size="lg" />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.camera, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.cameraBar}>
        <Text style={styles.cameraTitle}>Scan QR</Text>
        <Text style={styles.cameraClose}>Close</Text>
      </View>
      <View style={styles.cameraBody}>
        <View style={styles.reticle} />
        <Text style={styles.cameraHint}>Point at the customer&apos;s order QR</Text>
        {phase === "scan" ? (
          <CoachTarget active={!tried}>
            <Button label="Simulate a scan" tone="secondary" icon="qr" onPress={() => setStage("review")} />
          </CoachTarget>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.textSecondary },
  printerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  printerCopy: { flex: 1, gap: 2 },
  printerName: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  roles: { flexDirection: "row", gap: spacing.xs, marginTop: 4 },
  role: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: colors.separator, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  roleOn: { borderColor: colors.success, backgroundColor: colors.successLight },
  roleOnText: { ...typography.small, fontWeight: "700", color: colors.success },
  roleText: { ...typography.small, fontWeight: "700", color: colors.textSecondary },
  printerActions: { gap: spacing.xs, alignItems: "flex-end" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchHint: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabs: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.md },
  tab: { ...typography.body, fontWeight: "700", color: colors.textSecondary, paddingBottom: 4 },
  tabActive: { color: colors.textPrimary, borderBottomWidth: 2, borderBottomColor: colors.primary },
  found: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: spacing.md },
  camera: { flex: 1, backgroundColor: "#000" },
  cameraBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, height: 44 },
  cameraTitle: { ...typography.heading, color: colors.textOnDark },
  cameraClose: { ...typography.body, fontWeight: "600", color: colors.textOnDark },
  cameraBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xl },
  reticle: { width: 220, height: 220, borderRadius: radius.lg, borderWidth: 3, borderColor: colors.tabBarActive },
  cameraHint: { ...typography.body, color: "rgba(255,255,255,0.75)" },
  line: { ...typography.body, color: colors.textPrimary, paddingVertical: 2 },
  slide: { flexDirection: "row", alignItems: "center", gap: spacing.md, height: 56, borderRadius: radius.full, backgroundColor: colors.primaryLight, paddingLeft: 4, paddingRight: spacing.xl, ...shadow.sm },
  slideKnob: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  slideText: { ...typography.body, fontWeight: "700", color: colors.textSecondary, flex: 1, textAlign: "center" },
  resultBadge: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  resultTitle: { ...typography.title, color: colors.textPrimary },
  resultBody: { ...typography.body, color: colors.textSecondary },
  resultButton: { marginTop: spacing.lg },
});
