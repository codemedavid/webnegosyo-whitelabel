import React from "react";
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAppUpdate } from "../lib/updates/use-app-update";
import { colors, radius, shadow, spacing, typography } from "../theme/colors";
import { Button } from "./Button";

// The update prompt, mounted once in the (main) layout beside WhatsNewPopup.
//
// Two shapes, one component, because the merchant should not have to learn
// the difference between them:
//
//   OTA    "Update" downloads and restarts into the new version right here.
//          This is the genuinely automatic path.
//   Store  "Update" opens the App Store / Play Store page. A store download
//          cannot be driven from inside the app on iOS, so the honest copy is
//          "opens the store" rather than promising an install.
//
// A blocking prompt (the running build is below the supported floor) has no
// dismiss affordance at all and refuses the hardware back button — an
// unsupported build talking to the platform is the thing the floor exists to
// prevent, so leaving a way past it would defeat the feature.

export function AppUpdateGate() {
  const { prompt, isApplying, error, applyOta, dismiss } = useAppUpdate();

  if (prompt.kind === "none") return null;

  const isBlocking = prompt.isBlocking;
  const isOta = prompt.kind === "ota";

  const title = isBlocking
    ? "Update required"
    : isOta
      ? "Update ready"
      : "New version available";

  const body = isBlocking
    ? "This version is no longer supported. Update to keep taking orders."
    : isOta
      ? "A new version is ready to install. It takes a few seconds and the app will restart."
      : `Version ${prompt.kind === "store" ? prompt.version : ""} is available in the store.`;

  const onUpdate = () => {
    if (prompt.kind === "ota") {
      void applyOta();
      return;
    }
    // Nothing to recover if the store is missing — the merchant can still
    // reach it by hand, and a thrown rejection here would crash the tree.
    Linking.openURL(prompt.storeUrl).catch(() => {});
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // A blocking gate must survive Android's back button.
      onRequestClose={isBlocking ? () => {} : dismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.body}>
            <Text style={[styles.eyebrow, isBlocking && styles.eyebrowBlocking]}>
              {isBlocking ? "Action needed" : "SmartMenu"}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.summary}>{body}</Text>

            {prompt.releaseNotes ? (
              <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
                <Text style={styles.notesText}>{prompt.releaseNotes}</Text>
              </ScrollView>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              {isApplying ? (
                <View style={styles.applying}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.applyingText}>Installing…</Text>
                </View>
              ) : (
                <Button
                  label={isOta ? "Update now" : "Open the store"}
                  onPress={onUpdate}
                  fullWidth
                  size="lg"
                  testID="app-update-action"
                />
              )}

              {!isBlocking && !isApplying ? (
                <TouchableOpacity
                  onPress={dismiss}
                  accessibilityRole="button"
                  style={styles.later}
                  testID="app-update-later"
                >
                  <Text style={styles.laterText}>Not now</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  body: { padding: spacing.xl, gap: spacing.sm },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  eyebrowBlocking: { color: colors.danger },
  title: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  notes: { maxHeight: 140, marginTop: spacing.xs },
  notesContent: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  notesText: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  error: { ...typography.body, color: colors.danger },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  applying: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md },
  applyingText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  later: { alignItems: "center", paddingVertical: spacing.sm },
  laterText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
});
