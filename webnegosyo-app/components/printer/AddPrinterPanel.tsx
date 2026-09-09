import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Button } from "../Button";
import { Card } from "../Card";
import { IconButton } from "../IconButton";
import { SegmentedControl } from "../SegmentedControl";
import {
  connectPrinter,
  discoverBluetoothPrinters,
  requestBluetoothPermissions,
  type DiscoveredPrinter,
} from "../../lib/printer";

type Transport = "bluetooth" | "network";

const TRANSPORT_OPTIONS: { label: string; value: Transport }[] = [
  { label: "Bluetooth", value: "bluetooth" },
  { label: "Wi-Fi / LAN", value: "network" },
];

const DEFAULT_NETWORK_PORT = "9100";

const BLUETOOTH_HINT =
  Platform.OS === "ios"
    ? "Turn the printer on and put it in pairing mode. iPhone and iPad only see Bluetooth LE printers."
    : "Turn the printer on and pair it in your phone's Bluetooth settings first.";

interface AddPrinterPanelProps {
  isPrinterSupported: boolean;
  onAdded: (printer: { type: Transport; name: string; address: string }) => Promise<void>;
  onClose: () => void;
}

/**
 * The add flow, shown only while the merchant is adding. Bluetooth scans and
 * lists what it finds; network takes an address. Either way, a successful
 * connection saves the printer and the panel closes — the new row appearing
 * in the list is the confirmation, not another alert.
 */
export function AddPrinterPanel({ isPrinterSupported, onAdded, onClose }: AddPrinterPanelProps) {
  const [transport, setTransport] = useState<Transport>("bluetooth");
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [networkIp, setNetworkIp] = useState("");
  const [networkPort, setNetworkPort] = useState(DEFAULT_NETWORK_PORT);
  const [connectingAddress, setConnectingAddress] = useState<string | null>(null);

  const handleScan = async () => {
    if (!isPrinterSupported) {
      Alert.alert("Not available", "Printing needs the store app build — it is not available in Expo Go.");
      return;
    }
    const permission = await requestBluetoothPermissions();
    if (!permission.success) {
      Alert.alert("Bluetooth permission needed", permission.error ?? "Allow Bluetooth to scan for printers.");
      return;
    }

    setIsScanning(true);
    const { printers, status } = await discoverBluetoothPrinters();
    setDiscovered(printers);
    setHasScanned(true);
    setIsScanning(false);

    // Each dead end sends the merchant somewhere different, so never collapse
    // them into one "no printers found".
    if (printers.length > 0) return;
    if (status === "unavailable") {
      Alert.alert("Printing not available", "This build does not include the printer module. Update the app.");
    } else if (status === "timeout") {
      Alert.alert(
        "Bluetooth not responding",
        "Check that Bluetooth is on and this app is allowed to use it in Settings, then scan again.",
      );
    }
  };

  const connectAndSave = async (type: Transport, name: string, address: string) => {
    setConnectingAddress(address);
    const result = await connectPrinter(type, address);
    if (!result.success) {
      setConnectingAddress(null);
      Alert.alert("Could not connect", result.error ?? "Check the printer and try again.");
      return;
    }
    await onAdded({ type, name, address });
    setConnectingAddress(null);
  };

  const handleConnectNetwork = () => {
    const ip = networkIp.trim();
    if (!ip) {
      Alert.alert("Address needed", "Enter the printer's IP address.");
      return;
    }
    const port = networkPort.trim() || DEFAULT_NETWORK_PORT;
    void connectAndSave("network", `Network (${ip})`, `${ip}:${port}`);
  };

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Add a printer</Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>

      <SegmentedControl
        options={TRANSPORT_OPTIONS}
        value={transport}
        onChange={setTransport}
        accessibilityPrefix="Connect over"
      />

      {transport === "bluetooth" ? (
        <View style={styles.body}>
          <Button
            label={hasScanned ? "Scan again" : "Scan for printers"}
            onPress={() => void handleScan()}
            isLoading={isScanning}
            disabled={isScanning || connectingAddress !== null}
            fullWidth
          />
          {discovered.map((device) => {
            const isConnecting = connectingAddress === device.address;
            return (
              <TouchableOpacity
                key={device.address}
                style={styles.deviceRow}
                onPress={() => void connectAndSave("bluetooth", device.name, device.address)}
                disabled={connectingAddress !== null}
                accessibilityRole="button"
                accessibilityLabel={`Add ${device.name}`}
              >
                <View style={styles.deviceCopy}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceAddress}>{device.address}</Text>
                </View>
                {isConnecting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.addText}>Add</Text>
                )}
              </TouchableOpacity>
            );
          })}
          {hasScanned && discovered.length === 0 && !isScanning ? (
            <Text style={styles.empty}>No printers found.</Text>
          ) : null}
          <Text style={styles.hint}>{BLUETOOTH_HINT}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldGrow}>
              <Text style={styles.fieldLabel}>IP address</Text>
              <TextInput
                style={styles.input}
                value={networkIp}
                onChangeText={setNetworkIp}
                placeholder="192.168.1.100"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Printer IP address"
              />
            </View>
            <View style={styles.fieldPort}>
              <Text style={styles.fieldLabel}>Port</Text>
              <TextInput
                style={styles.input}
                value={networkPort}
                onChangeText={setNetworkPort}
                placeholder={DEFAULT_NETWORK_PORT}
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                accessibilityLabel="Printer port"
              />
            </View>
          </View>
          <Button
            label="Connect and add"
            onPress={handleConnectNetwork}
            isLoading={connectingAddress !== null}
            disabled={connectingAddress !== null}
            fullWidth
          />
          <Text style={styles.hint}>The printer must be on the same Wi-Fi network as this device.</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { ...typography.heading, color: colors.textPrimary },
  body: { marginTop: spacing.lg, gap: spacing.md },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  deviceCopy: { flex: 1 },
  deviceName: { ...typography.body, fontWeight: "500", color: colors.textPrimary },
  deviceAddress: { ...typography.caption, color: colors.textSecondary },
  addText: { ...typography.body, fontWeight: "600", color: colors.primary },
  empty: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  hint: { ...typography.caption, color: colors.textSecondary },
  fieldRow: { flexDirection: "row", gap: spacing.md },
  fieldGrow: { flex: 1 },
  fieldPort: { width: 96 },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
});
