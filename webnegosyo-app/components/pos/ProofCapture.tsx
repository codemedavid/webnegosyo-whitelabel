import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { PAYMENT_PROOF_FOLDER, uploadImage } from "../../lib/product-image-upload";

export interface CapturedProof {
  url: string;
  fileId: string;
}

interface ProofCaptureProps {
  proof: CapturedProof | null;
  onCaptured: (proof: CapturedProof) => void;
  onError: (message: string) => void;
}

/**
 * Photographs the customer's payment confirmation and uploads it.
 *
 * `expo-camera` is imported statically here (unlike the image picker) because
 * app/(main)/scan.tsx already depends on it, so the native module is present in
 * every build that ships this screen. Capture failures surface through
 * `onError` and leave the sale locked rather than silently completing.
 */
export function ProofCapture({ proof, onCaptured, onError }: ProofCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const open = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        onError("Camera access is needed to photograph the payment confirmation.");
        return;
      }
    }
    setIsOpen(true);
  }, [permission, requestPermission, onError]);

  const capture = useCallback(async () => {
    if (!cameraRef.current || isBusy) return;
    setIsBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (!photo?.uri) throw new Error("The camera returned no image.");

      const uploaded = await uploadImage(
        { uri: photo.uri, fileName: "payment-proof.jpg", mimeType: "image/jpeg" },
        PAYMENT_PROOF_FOLDER,
      );
      onCaptured({ url: uploaded.url, fileId: uploaded.fileId });
      setIsOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save the photo.");
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, onCaptured, onError]);

  return (
    <View style={styles.container}>
      {proof ? (
        <View style={styles.captured}>
          <Image
            source={{ uri: proof.url }}
            style={styles.thumb}
            alt="Captured payment confirmation"
            accessibilityLabel="Captured payment confirmation"
          />
          <View style={styles.capturedText}>
            <Text style={styles.capturedTitle}>Confirmation captured</Text>
            <TouchableOpacity onPress={open} hitSlop={8}>
              <Text style={styles.retake}>Retake</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.captureButton} onPress={open}>
          <Text style={styles.captureText}>Photograph payment confirmation</Text>
          <Text style={styles.captureHint}>Required before this sale can be completed</Text>
        </TouchableOpacity>
      )}

      <Modal visible={isOpen} animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <View style={styles.cameraScreen}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          <View style={styles.cameraBar}>
            <TouchableOpacity onPress={() => setIsOpen(false)} hitSlop={12}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shutter, isBusy && styles.shutterBusy]}
              onPress={capture}
              disabled={isBusy}
              accessibilityLabel="Take photo"
            >
              {isBusy ? <ActivityIndicator color={colors.textOnDark} /> : null}
            </TouchableOpacity>
            <View style={styles.cameraBarSpacer} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.lg },
  captureButton: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: "center",
  },
  captureText: { ...typography.body, fontWeight: "700", color: colors.accent },
  captureHint: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xs },
  captured: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceSubtle },
  capturedText: { flex: 1 },
  capturedTitle: { ...typography.body, fontWeight: "700", color: colors.success },
  retake: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
    backgroundColor: "#000",
  },
  cancel: { ...typography.body, color: colors.textOnDark, width: 72 },
  cameraBarSpacer: { width: 72 },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.textOnDark,
    borderWidth: 4,
    borderColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterBusy: { backgroundColor: colors.textTertiary },
});
