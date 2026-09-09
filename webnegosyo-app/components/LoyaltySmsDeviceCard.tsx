import { useCallback, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuthStore } from "../stores/auth-store";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { isLoyaltySmsDeliveryEnabled } from "../lib/loyalty/sms-delivery-flag";
import {
  deliveryTransportDeps,
  deviceCredentialStore,
  isDeviceCredentialStorageAvailable,
} from "../lib/loyalty/sms-delivery-runtime";
import { enrollLoyaltySmsDevice, revokeLoyaltySmsDevice } from "../lib/loyalty/sms-delivery-api";
import { useDeviceEnrollment } from "../lib/loyalty/use-device-enrollment";

/**
 * Owner control for enrolling THIS Android handset as a loyalty OTP sender.
 *
 * Enrollment mints a device ID and credential on the server; the credential is
 * stored in the keystore here and never shown. Removing the phone revokes it
 * permanently server-side (a revoked ID is never revived) and forgets it here.
 * Renders nothing off Android, for staff, or while the pilot gate is off.
 */
export function LoyaltySmsDeviceCard() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const isOwner = useAuthStore((s) => s.isOwner);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const isDemo = useAuthStore((s) => s.isDemo);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isShown =
    Platform.OS === "android" && isLoyaltySmsDeliveryEnabled() && !isDemo && (isOwner || isSuperadmin);

  const enrollment = useDeviceEnrollment(tenantId, userId, isShown);
  const deviceId = enrollment?.deviceId ?? null;

  const enroll = useCallback(async () => {
    if (!tenantId || !userId) return;
    setIsBusy(true);
    setError(null);
    try {
      if (!isDeviceCredentialStorageAvailable()) {
        setError("Update this app before enrolling this phone for SMS delivery.");
        return;
      }
      const result = await enrollLoyaltySmsDevice(deliveryTransportDeps(), tenantId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await deviceCredentialStore({ tenantId, actorId: userId }).write(result.device);
    } catch {
      setError("Could not save the enrollment on this phone. Try again.");
    } finally {
      setIsBusy(false);
    }
  }, [tenantId, userId]);

  const remove = useCallback(async () => {
    if (!tenantId || !userId || !enrollment) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await revokeLoyaltySmsDevice(deliveryTransportDeps(), tenantId, enrollment.deviceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await deviceCredentialStore({ tenantId, actorId: userId }).clearIfMatches(enrollment);
    } catch {
      setError("The phone was removed on the server but could not be forgotten here. Restart the app.");
    } finally {
      setIsBusy(false);
    }
  }, [tenantId, userId, enrollment]);

  if (!isShown) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>OTP delivery from this phone</Text>
      <Text style={styles.body}>
        {deviceId
          ? "This phone is enrolled. While the app is open it sends loyalty verification codes using its own SIM."
          : "Enroll this phone to send loyalty verification codes from its SIM. Up to five phones per store."}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={deviceId ? styles.buttonGhost : styles.button}
        disabled={isBusy}
        onPress={() => void (deviceId ? remove() : enroll())}
      >
        <Text style={deviceId ? styles.buttonGhostLabel : styles.buttonLabel}>
          {isBusy ? "Working…" : deviceId ? "Remove this phone" : "Enroll this phone"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  buttonLabel: { ...typography.body, color: colors.textOnDark, fontWeight: "600" },
  buttonGhost: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  buttonGhostLabel: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
});
