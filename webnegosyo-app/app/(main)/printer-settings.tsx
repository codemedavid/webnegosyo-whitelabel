import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Switch,
} from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { BackHeader } from "../../components/BackHeader";
import { usePrinterStore } from "../../stores/printer-store";
import { type PrintTrigger } from "../../lib/print-trigger";
import {
  printersForRole,
  suggestedRoles,
  PRINTER_ROLES,
  type PrinterRole,
  type RegisteredPrinter,
} from "../../lib/printer-registry";
import {
  discoverBluetoothPrinters,
  connectPrinter,
  disconnectPrinter,
  printToPrinter,
  isPrinterSupported,
  requestBluetoothPermissions,
} from "../../lib/printer";

interface DiscoveredPrinter {
  name: string;
  address: string;
}

/** The four print moments, in the order a merchant reasons about them. */
const PRINT_TRIGGER_OPTIONS: { value: PrintTrigger; label: string; hint: string }[] = [
  {
    value: "confirmation",
    label: "On order confirmation",
    hint: "Prints when you accept the order",
  },
  {
    value: "billout",
    label: "On bill out",
    hint: "Prints when payment is settled",
  },
  { value: "both", label: "Both", hint: "On confirm and again on payment" },
  { value: "off", label: "Never", hint: "Only print when you tap Reprint Receipt" },
];

const ROLE_LABELS: Record<PrinterRole, string> = {
  cashier: "Cashier",
  kitchen: "Kitchen",
};

const TEST_PAGE_TEXT = [
  "================================",
  "        PRINTER TEST PAGE       ",
  "================================",
  "",
  "If you can read this, your",
  "printer is working correctly!",
  "",
  `Platform: ${Platform.OS}`,
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
  const [tab, setTab] = useState<"bluetooth" | "network">("bluetooth");
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [networkIp, setNetworkIp] = useState("");
  const [networkPort, setNetworkPort] = useState("9100");
  const [connecting, setConnecting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const printerSupported = isPrinterSupported();
  const hasKitchenPrinter = printersForRole(printers, "kitchen").length > 0;
  const hasCashierPrinter = printersForRole(printers, "cashier").length > 0;

  const handleScan = async () => {
    if (!printerSupported) {
      Alert.alert("Not Available", "Printer requires a development build. Not available in Expo Go.");
      return;
    }

    // Request Bluetooth permissions before scanning
    const permResult = await requestBluetoothPermissions();
    if (!permResult.success) {
      Alert.alert("Bluetooth Permission Required", permResult.error ?? "Bluetooth permissions are needed to scan for printers.");
      return;
    }

    setScanning(true);
    const { printers: found, status } = await discoverBluetoothPrinters();
    setDiscovered(found);
    setScanning(false);

    if (found.length > 0) return;

    // Each dead end sends the merchant somewhere different, so never collapse
    // them into one "no printers found".
    if (status === "unavailable") {
      Alert.alert(
        "Printing Not Available",
        "This build does not include the printer module. Update to the latest version of the app."
      );
      return;
    }

    if (status === "timeout") {
      Alert.alert(
        "Bluetooth Not Responding",
        "Bluetooth did not answer the scan. Check that Bluetooth is turned on and that this app is allowed to use it in Settings, then scan again."
      );
      return;
    }

    Alert.alert(
      "No Printers Found",
      Platform.OS === "ios"
        ? "Make sure your printer is turned on and in pairing mode. Note that iPhone and iPad can only see Bluetooth LE printers — older Bluetooth Classic printers that work on Android are not visible to iOS."
        : "Make sure your printer is turned on and in pairing mode."
    );
  };

  const saveConnectedPrinter = async (
    type: "bluetooth" | "network",
    name: string,
    address: string,
  ) => {
    const roles = suggestedRoles(printers);
    await addPrinter({ type, name, address, roles });
    const roleText = roles.map((r) => ROLE_LABELS[r]).join(" + ");
    Alert.alert(
      "Printer Added",
      `${name} was added as your ${roleText} printer. Tap its role chips below to change what it prints.`,
    );
  };

  const handleSelectBluetooth = async (device: DiscoveredPrinter) => {
    setConnecting(true);
    const result = await connectPrinter("bluetooth", device.address);
    if (result.success) {
      await saveConnectedPrinter("bluetooth", device.name, device.address);
    } else {
      Alert.alert("Connection Failed", result.error ?? "Could not connect to printer. Try again.");
    }
    setConnecting(false);
  };

  const handleConnectNetwork = async () => {
    if (!networkIp.trim()) {
      Alert.alert("Error", "Please enter an IP address");
      return;
    }
    setConnecting(true);
    const address = `${networkIp.trim()}:${networkPort.trim() || "9100"}`;
    const result = await connectPrinter("network", address);
    if (result.success) {
      await saveConnectedPrinter("network", `Network (${networkIp.trim()})`, address);
    } else {
      Alert.alert("Connection Failed", result.error ?? "Could not connect. Check IP and port.");
    }
    setConnecting(false);
  };

  const handleTestPrint = async (printer: RegisteredPrinter) => {
    setTestingId(printer.id);
    const result = await printToPrinter(printer, [{ type: "text", text: TEST_PAGE_TEXT }]);
    setTestingId(null);
    if (!result.success) {
      Alert.alert("Test Failed", result.error ?? "Could not print test page. Check printer connection.");
    } else {
      Alert.alert("Test Sent", "Test data was sent to the printer. If nothing came out, the printer may not be ESC/POS compatible (e.g. Niimbot uses its own protocol).");
    }
  };

  const handleRemove = (printer: RegisteredPrinter) => {
    Alert.alert("Remove Printer", `Remove ${printer.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (connectedAddress === printer.address) await disconnectPrinter();
          await removePrinter(printer.id);
        },
      },
    ]);
  };

  const handleToggleRole = (printer: RegisteredPrinter, role: PrinterRole) => {
    const hasRole = printer.roles.includes(role);
    if (hasRole && printer.roles.length === 1) {
      // Stripping the last role leaves a printer nothing can print to.
      Alert.alert(
        "Last Role",
        "A printer needs at least one role. Remove the printer instead if it should not print anything.",
      );
      return;
    }
    const roles = hasRole
      ? printer.roles.filter((r) => r !== role)
      : [...printer.roles, role];
    void updatePrinter(printer.id, { roles });
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="Printer" subtitle="Receipt and kitchen printers" />
      <ScrollView contentContainerStyle={styles.content}>

      {!printerSupported && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Printer features require a development build. Settings can be configured but printing won&apos;t work in Expo Go.
          </Text>
        </View>
      )}

      <Card style={styles.section}>
        <Text style={styles.toggleLabel}>Your Printers</Text>
        <Text style={styles.toggleSub}>
          Cashier printers print customer receipts. Kitchen printers print kitchen tickets.
        </Text>
        {printers.length === 0 ? (
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.textTertiary }]} />
            <Text style={styles.statusText}>No printer configured — add one below</Text>
          </View>
        ) : (
          printers.map((printer) => {
            const isConnectedPrinter = connectedAddress === printer.address;
            return (
              <View key={printer.id} style={styles.printerRow}>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: isConnectedPrinter ? colors.success : colors.textTertiary },
                    ]}
                  />
                  <View style={styles.printerInfo}>
                    <Text style={styles.deviceName}>{printer.name}</Text>
                    <Text style={styles.deviceAddress}>
                      {printer.type === "bluetooth" ? "Bluetooth" : "Network"} · {printer.address}
                    </Text>
                  </View>
                </View>
                <View style={styles.roleRow}>
                  {PRINTER_ROLES.map((role) => {
                    const isActive = printer.roles.includes(role);
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[styles.roleChip, isActive && styles.roleChipActive]}
                        onPress={() => handleToggleRole(printer, role)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isActive }}
                        accessibilityLabel={`${ROLE_LABELS[role]} role`}
                      >
                        <Text style={[styles.roleChipText, isActive && styles.roleChipTextActive]}>
                          {isActive ? "✓ " : ""}{ROLE_LABELS[role]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={() => handleTestPrint(printer)}
                    disabled={testingId !== null}
                  >
                    {testingId === printer.id ? (
                      <ActivityIndicator size="small" color={colors.textOnDark} />
                    ) : (
                      <Text style={styles.smallButtonText}>Test Print</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.dangerButton]}
                    onPress={() => handleRemove(printer)}
                  >
                    <Text style={styles.smallButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Card style={styles.section}>
        <View style={styles.toggleRow}>
          <View style={styles.triggerText}>
            <Text style={styles.toggleLabel}>Kitchen Auto-Print</Text>
            <Text style={styles.toggleSub}>
              {hasKitchenPrinter
                ? "Print the kitchen ticket automatically the moment a new order arrives."
                : "Add a printer with the Kitchen role to enable auto-printing."}
            </Text>
          </View>
          <Switch
            value={kitchenAutoPrint}
            onValueChange={(value) => void setKitchenAutoPrint(value)}
            disabled={!hasKitchenPrinter}
            accessibilityLabel="Kitchen auto-print"
          />
        </View>
        {kitchenAutoPrint && hasKitchenPrinter ? (
          <Text style={styles.toggleSub}>
            The app must stay open (any tab) for tickets to print — printing can&apos;t run while
            the app is closed or in the background.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.toggleLabel}>When receipts print</Text>
        <Text style={styles.toggleSub}>
          Applies to the cashier receipt.
          {hasKitchenPrinter && hasCashierPrinter
            ? " Tip: with a kitchen printer auto-printing tickets, “On bill out” avoids a duplicate on confirm."
            : ""}
        </Text>
        {PRINT_TRIGGER_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.triggerRow, printTrigger === option.value && styles.triggerRowActive]}
            onPress={() => setPrintTrigger(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: printTrigger === option.value }}
            accessibilityLabel={option.label}
          >
            <View style={styles.triggerText}>
              <Text style={styles.triggerLabel}>{option.label}</Text>
              <Text style={styles.toggleSub}>{option.hint}</Text>
            </View>
            {printTrigger === option.value && <Text style={styles.triggerCheck}>✓</Text>}
          </TouchableOpacity>
        ))}
      </Card>

      <Text style={styles.addTitle}>Add a Printer</Text>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "bluetooth" && styles.tabActive]}
          onPress={() => setTab("bluetooth")}
        >
          <Text style={[styles.tabText, tab === "bluetooth" && styles.tabTextActive]}>Bluetooth</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "network" && styles.tabActive]}
          onPress={() => setTab("network")}
        >
          <Text style={[styles.tabText, tab === "network" && styles.tabTextActive]}>Network</Text>
        </TouchableOpacity>
      </View>

      {tab === "bluetooth" ? (
        <Card style={styles.section}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleScan} disabled={scanning}>
            {scanning ? (
              <ActivityIndicator size="small" color={colors.textOnDark} />
            ) : (
              <Text style={styles.primaryButtonText}>Scan for Printers</Text>
            )}
          </TouchableOpacity>

          {discovered.map((device) => (
            <TouchableOpacity
              key={device.address}
              style={styles.deviceRow}
              onPress={() => handleSelectBluetooth(device)}
              disabled={connecting}
            >
              <View>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceAddress}>{device.address}</Text>
              </View>
              {connecting ? <ActivityIndicator size="small" color={colors.primary} /> : (
                <Text style={styles.connectText}>Add</Text>
              )}
            </TouchableOpacity>
          ))}
        </Card>
      ) : (
        <Card style={styles.section}>
          <Text style={styles.inputLabel}>IP Address</Text>
          <TextInput
            style={styles.input}
            value={networkIp}
            onChangeText={setNetworkIp}
            placeholder="192.168.1.100"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
          />
          <Text style={styles.inputLabel}>Port</Text>
          <TextInput
            style={styles.input}
            value={networkPort}
            onChangeText={setNetworkPort}
            placeholder="9100"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleConnectNetwork} disabled={connecting}>
            {connecting ? (
              <ActivityIndicator size="small" color={colors.textOnDark} />
            ) : (
              <Text style={styles.primaryButtonText}>Add Printer</Text>
            )}
          </TouchableOpacity>
        </Card>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl },
  addTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  section: { marginBottom: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  printerRow: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.separator,
  },
  printerInfo: { flex: 1 },
  roleRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  roleChip: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  roleChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  roleChipTextActive: { color: colors.primary },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dangerButton: { backgroundColor: colors.danger },
  smallButtonText: { ...typography.caption, color: colors.textOnDark, fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  toggleLabel: { ...typography.heading, color: colors.textPrimary },
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    gap: spacing.md,
  },
  triggerRowActive: { borderColor: colors.primary },
  triggerText: { flex: 1 },
  triggerLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  triggerCheck: { ...typography.body, fontWeight: "800", color: colors.primary },
  toggleSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.body, color: colors.textSecondary, fontWeight: "500" },
  tabTextActive: { color: colors.textOnDark },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: colors.textOnDark, ...typography.heading },
  deviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  deviceName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  deviceAddress: { ...typography.caption, color: colors.textSecondary },
  connectText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  inputLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  warningBanner: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningText: {
    ...typography.caption,
    color: colors.statusPending.text,
    textAlign: "center",
  },
});
