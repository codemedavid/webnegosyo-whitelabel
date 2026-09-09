import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { PrinterRow, type TestPrintStatus } from "../../components/printer/PrinterRow";
import { AddPrinterPanel } from "../../components/printer/AddPrinterPanel";
import { AutoPrintCard } from "../../components/printer/AutoPrintCard";
import { usePrinterStore } from "../../stores/printer-store";
import {
  printersForRole,
  suggestedRoles,
  DEFAULT_PAPER_WIDTH,
  type PrinterRole,
  type RegisteredPrinter,
} from "../../lib/printer-registry";
import { disconnectPrinter, printToPrinter, isPrinterSupported } from "../../lib/printer";

/** How long the Test button reads "sent" before it is ready again. */
const TEST_SENT_FEEDBACK_MS = 2_500;

const TEST_PAGE_TEXT = [
  "================================",
  "        PRINTER TEST PAGE       ",
  "================================",
  "",
  "If you can read this, your",
  "printer is working correctly!",
  "",
  "================================",
  "",
].join("\n");

export default function PrinterSettingsScreen() {
  const printers = usePrinterStore((s) => s.printers);
  const connectedAddress = usePrinterStore((s) => s.connectedAddress);
  const printTrigger = usePrinterStore((s) => s.printTrigger);
  const kitchenAutoPrint = usePrinterStore((s) => s.kitchenAutoPrint);
  const addPrinter = usePrinterStore((s) => s.addPrinter);
  const removePrinter = usePrinterStore((s) => s.removePrinter);
  const updatePrinter = usePrinterStore((s) => s.updatePrinter);
  const setPrintTrigger = usePrinterStore((s) => s.setPrintTrigger);
  const setKitchenAutoPrint = usePrinterStore((s) => s.setKitchenAutoPrint);

  const [isAdding, setIsAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testing, setTesting] = useState<{ id: string; status: TestPrintStatus }>({ id: "", status: null });
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
    },
    [],
  );

  const printerSupported = isPrinterSupported();
  const hasPrinters = printers.length > 0;
  const hasKitchenPrinter = printersForRole(printers, "kitchen").length > 0;
  const hasCashierPrinter = printersForRole(printers, "cashier").length > 0;

  const handleAdded = async (added: { type: "bluetooth" | "network"; name: string; address: string }) => {
    const registered = await addPrinter({
      ...added,
      roles: suggestedRoles(printers),
      paperWidth: DEFAULT_PAPER_WIDTH,
    });
    setIsAdding(false);
    // Open the new row so what it prints and its paper width are one tap away.
    setExpandedId(registered.id);
  };

  const handleTestPrint = async (printer: RegisteredPrinter) => {
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    setTesting({ id: printer.id, status: "printing" });
    const result = await printToPrinter(printer, [{ type: "text", text: TEST_PAGE_TEXT }]);
    if (!result.success) {
      setTesting({ id: "", status: null });
      Alert.alert("Test failed", result.error ?? "Could not reach the printer.");
      return;
    }
    setTesting({ id: printer.id, status: "sent" });
    testTimerRef.current = setTimeout(() => setTesting({ id: "", status: null }), TEST_SENT_FEEDBACK_MS);
  };

  const handleRemove = (printer: RegisteredPrinter) => {
    Alert.alert("Remove printer", `Remove ${printer.name} from this device?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (connectedAddress === printer.address) await disconnectPrinter();
          await removePrinter(printer.id);
          setExpandedId(null);
        },
      },
    ]);
  };

  const handleToggleRole = (printer: RegisteredPrinter, role: PrinterRole) => {
    const hasRole = printer.roles.includes(role);
    if (hasRole && printer.roles.length === 1) {
      // Stripping the last role leaves a printer nothing can print to.
      Alert.alert("Keep one", "A printer needs something to print. Remove it instead if it should print nothing.");
      return;
    }
    const roles = hasRole ? printer.roles.filter((r) => r !== role) : [...printer.roles, role];
    void updatePrinter(printer.id, { roles });
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="Printers" subtitle="Receipts and kitchen tickets" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!printerSupported ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              Printing needs the store app build. You can set printers up here, but nothing will print in Expo Go.
            </Text>
          </View>
        ) : null}

        {hasPrinters ? (
          <>
            <SectionHeader
              title="Your printers"
              actionLabel={isAdding ? undefined : "Add"}
              onAction={isAdding ? undefined : () => setIsAdding(true)}
            />
            <Card style={styles.card}>
              {printers.map((printer, index) => (
                <PrinterRow
                  key={printer.id}
                  printer={printer}
                  isConnected={connectedAddress === printer.address}
                  isExpanded={expandedId === printer.id}
                  testStatus={testing.id === printer.id ? testing.status : null}
                  isLast={index === printers.length - 1}
                  onToggleExpanded={() => setExpandedId(expandedId === printer.id ? null : printer.id)}
                  onTestPrint={() => void handleTestPrint(printer)}
                  onToggleRole={(role) => handleToggleRole(printer, role)}
                  onPaperWidth={(paperWidth) => void updatePrinter(printer.id, { paperWidth })}
                  onQrMode={(qrMode) => void updatePrinter(printer.id, { qrMode })}
                  onRemove={() => handleRemove(printer)}
                />
              ))}
            </Card>
          </>
        ) : null}

        {isAdding ? (
          <View style={styles.card}>
            <AddPrinterPanel
              isPrinterSupported={printerSupported}
              onAdded={handleAdded}
              onClose={() => setIsAdding(false)}
            />
          </View>
        ) : !hasPrinters ? (
          <Card style={styles.card}>
            <EmptyState
              icon="printer"
              title="No printer yet"
              message="Add a Bluetooth or Wi-Fi receipt printer to print receipts and kitchen tickets from this device."
            />
            <Button label="Add a printer" onPress={() => setIsAdding(true)} fullWidth />
          </Card>
        ) : null}

        {hasPrinters ? (
          <View style={styles.card}>
            <AutoPrintCard
              printTrigger={printTrigger}
              kitchenAutoPrint={kitchenAutoPrint}
              hasCashierPrinter={hasCashierPrinter}
              hasKitchenPrinter={hasKitchenPrinter}
              onPrintTrigger={(trigger) => void setPrintTrigger(trigger)}
              onKitchenAutoPrint={(enabled) => void setKitchenAutoPrint(enabled)}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl },
  card: { marginBottom: spacing.lg },
  warningBanner: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningText: { ...typography.caption, color: colors.statusPending.text, textAlign: "center" },
});
