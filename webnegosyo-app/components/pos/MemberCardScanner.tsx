import React, { useEffect, useRef } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface MemberCardScannerProps {
  visible: boolean;
  onCancel: () => void;
  /** Called once per opening with the raw QR text. */
  onScanned: (code: string) => void;
}

/**
 * Full-screen camera for a guest's Wallet loyalty card.
 *
 * The camera fires `onBarcodeScanned` for every frame it sees the code in, so
 * the first read latches until the scanner is reopened — otherwise one scan
 * would resolve (and possibly create) the same guest several times.
 */
export function MemberCardScanner({ visible, onCancel, onScanned }: MemberCardScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);

  useEffect(() => {
    if (visible) hasScanned.current = false;
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              if (hasScanned.current) return;
              hasScanned.current = true;
              onScanned(data);
            }}
          />
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              {permission && !permission.canAskAgain
                ? "Camera access is off for this app. Turn it on in Settings to scan loyalty cards."
                : "Allow camera access to scan the guest's loyalty card."}
            </Text>
            {permission?.canAskAgain !== false && (
              <TouchableOpacity style={styles.allow} onPress={() => void requestPermission()} accessibilityRole="button">
                <Text style={styles.allowText}>Allow camera</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={styles.footer}>
          <Text style={styles.hint}>{"Point at the QR on the guest's Wallet card"}</Text>
          <TouchableOpacity style={styles.cancel} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  permissionText: { ...typography.body, color: "#fff", textAlign: "center" },
  allow: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  allowText: { ...typography.body, color: colors.card, fontWeight: "600" },
  footer: { padding: spacing.lg, backgroundColor: "#000" },
  hint: { ...typography.caption, color: "#fff", textAlign: "center", marginBottom: spacing.md },
  cancel: { paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: "#222", alignItems: "center" },
  cancelText: { ...typography.body, color: "#fff", fontWeight: "600" },
});
