import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { usePrinterStore } from "../../stores/printer-store";
import { type PrintTrigger } from "../../lib/print-trigger";
import {
  discoverBluetoothPrinters,
  connectPrinter,
  disconnectPrinter,
  printTestPage,
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
    hint: "Kitchen ticket — prints when you accept the order",
  },
  {
    value: "billout",
    label: "On bill out",
    hint: "Customer receipt — prints when payment is settled",
  },
  { value: "both", label: "Both", hint: "A ticket on confirm and a receipt on payment" },
  { value: "off", label: "Never", hint: "Only print when you tap Reprint Receipt" },
];

export default function PrinterSettingsScreen() {
  const { printer, isConnected, printTrigger, setPrinter, setPrintTrigger } = usePrinterStore();
  const [tab, setTab] = useState<"bluetooth" | "network">(printer?.type ?? "bluetooth");
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [networkIp, setNetworkIp] = useState("");
  const [networkPort, setNetworkPort] = useState("9100");
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const printerSupported = isPrinterSupported();

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
    const printers = await discoverBluetoothPrinters();
    setDiscovered(printers);
    setScanning(false);
    if (printers.length === 0) {
      Alert.alert("No Printers Found", "Make sure your printer is turned on and in pairing mode.");
    }
  };

  const handleSelectBluetooth = async (device: DiscoveredPrinter) => {
    setConnecting(true);
    const result = await connectPrinter("bluetooth", device.address);
    if (result.success) {
      setPrinter({ type: "bluetooth", name: device.name, address: device.address });
      Alert.alert("Connected", `Connected to ${device.name}`);
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
      setPrinter({ type: "network", name: `Network (${networkIp})`, address });
      Alert.alert("Connected", `Connected to ${address}`);
    } else {
      Alert.alert("Connection Failed", result.error ?? "Could not connect. Check IP and port.");
    }
    setConnecting(false);
  };

  const handleTestPrint = async () => {
    setTesting(true);
    const result = await printTestPage();
    setTesting(false);
    if (!result.success) {
      Alert.alert("Test Failed", result.error ?? "Could not print test page. Check printer connection.");
    } else {
      Alert.alert("Test Sent", "Test data was sent to the printer. If nothing came out, the printer may not be ESC/POS compatible (e.g. Niimbot uses its own protocol).");
    }
  };

  const handleDisconnect = async () => {
    await disconnectPrinter();
    setPrinter(null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Printer Settings</Text>

      {!printerSupported && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Printer features require a development build. Settings can be configured but printing won&apos;t work in Expo Go.
          </Text>
        </View>
      )}

      <Card style={styles.section}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? colors.success : colors.textTertiary }]} />
          <Text style={styles.statusText}>
            {printer ? `${printer.name} (${isConnected ? "Connected" : "Disconnected"})` : "No printer configured"}
          </Text>
        </View>
        {printer && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.smallButton} onPress={handleTestPrint} disabled={testing}>
              {testing ? <ActivityIndicator size="small" color={colors.textOnDark} /> : <Text style={styles.smallButtonText}>Test Print</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallButton, styles.dangerButton]} onPress={handleDisconnect}>
              <Text style={styles.smallButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.toggleLabel}>When to print</Text>
        <Text style={styles.toggleSub}>
          Choose the moment a receipt comes out automatically
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
                <Text style={styles.connectText}>Connect</Text>
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
              <Text style={styles.primaryButtonText}>Connect</Text>
            )}
          </TouchableOpacity>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  backButton: { marginBottom: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dangerButton: { backgroundColor: colors.danger },
  smallButtonText: { ...typography.caption, color: colors.textOnDark, fontWeight: "600" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
