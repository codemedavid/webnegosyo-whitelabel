import { useCallback, useState } from "react";
import { Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useAuthStore } from "../stores/auth-store";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { isLoyaltySmsDeliveryEnabled } from "../lib/loyalty/sms-delivery-flag";
import {
  deliveryTransportDeps,
  deviceCredentialStore,
  isDeviceCredentialStorageAvailable,
  smsGatewayNative,
} from "../lib/loyalty/sms-delivery-runtime";
import { enrollLoyaltySmsDevice, revokeLoyaltySmsDevice } from "../lib/loyalty/sms-delivery-api";
import { useDeviceEnrollment } from "../lib/loyalty/use-device-enrollment";
import { useSmsGateway } from "../lib/loyalty/use-sms-gateway";
import { planGatewayEnable } from "../lib/loyalty/sms-gateway";
import { androidSmsPermissions } from "../lib/sms/android-permissions";
import { requestGatewayNotificationPermission } from "../lib/loyalty/notification-permission";
import { SmsFallbackCard } from "./loyalty/SmsFallbackCard";

const SMS_PERMISSION_DENIED =
  "Allow SMS for SmartMenu (Android Settings → Apps → SmartMenu → Permissions) so this phone can send reward codes.";

/**
 * Owner control for using THIS Android phone as the store's SMS gateway for
 * loyalty reward codes.
 *
 * Enrolling mints a device credential (kept in the keystore, never shown).
 * The switch starts a foreground service that keeps sending codes from this
 * phone's SIM with the screen off, the app closed, and after a reboot — no
 * tapping Send. Removing the phone stops the gateway and revokes it for good.
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
  const gateway = useSmsGateway(isShown);
  const deviceId = enrollment?.deviceId ?? null;

  const run = useCallback(async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  }, []);

  const enroll = () => run(async () => {
    if (!tenantId || !userId) return;
    if (!isDeviceCredentialStorageAvailable()) {
      setError("Update this app before enrolling this phone for SMS delivery.");
      return;
    }
    try {
      const result = await enrollLoyaltySmsDevice(deliveryTransportDeps(), tenantId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await deviceCredentialStore({ tenantId, actorId: userId }).write(result.device);
    } catch {
      setError("Could not save the enrollment on this phone. Try again.");
    }
  });

  const startGateway = () => run(async () => {
    const native = smsGatewayNative();
    if (!tenantId || !userId || !native) return;
    const hasSmsPermission =
      (await androidSmsPermissions.check()) || (await androidSmsPermissions.request()) === "granted";
    const step = planGatewayEnable({
      platform: Platform.OS,
      releaseEnabled: isLoyaltySmsDeliveryEnabled(),
      hasNativeGateway: true,
      isEnrolled: deviceId !== null,
      hasSmsPermission,
    });
    if (step === "sms_permission") {
      setError(SMS_PERMISSION_DENIED);
      return;
    }
    if (step !== "ready") return;
    await requestGatewayNotificationPermission();
    try {
      await native.startSmsGateway({ tenantId, actorId: userId });
    } catch {
      setError("The SMS gateway could not start. Restart the app and try again.");
    }
    await gateway.refresh();
  });

  const stopGateway = () => run(async () => {
    try {
      await smsGatewayNative()?.stopSmsGateway();
    } catch {
      setError("The SMS gateway could not be stopped. Restart the app and try again.");
    }
    await gateway.refresh();
  });

  const remove = () => run(async () => {
    if (!tenantId || !userId || !enrollment) return;
    try {
      // Stop sending first: a revoked phone mid-send would only fail noisily.
      await smsGatewayNative()?.stopSmsGateway();
      const result = await revokeLoyaltySmsDevice(deliveryTransportDeps(), tenantId, enrollment.deviceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await deviceCredentialStore({ tenantId, actorId: userId }).clearIfMatches(enrollment);
    } catch {
      setError("The phone was removed on the server but could not be forgotten here. Restart the app.");
    } finally {
      await gateway.refresh();
    }
  });

  const allowBackground = () => run(async () => {
    await smsGatewayNative()?.requestIgnoreBatteryOptimizations();
    await gateway.refresh();
  });

  if (!isShown) return null;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.title}>SMS gateway</Text>
        {!deviceId ? (
          <Text style={styles.body}>
            Enroll this phone to send reward codes to customers from its own SIM, automatically. Up to five phones per store.
          </Text>
        ) : !gateway.hasNative ? (
          <Text style={styles.body}>
            Update the app to use this phone as an SMS gateway. It will then send reward codes in the background.
          </Text>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Use this phone as SMS gateway</Text>
              <Switch
                accessibilityRole="switch"
                accessibilityLabel="Use this phone as SMS gateway"
                value={gateway.isEnabled}
                disabled={isBusy}
                onValueChange={(next) => void (next ? startGateway() : stopGateway())}
                trackColor={{ false: colors.separator, true: colors.success }}
              />
            </View>
            <Text style={styles.body}>
              {gateway.isEnabled
                ? "On — this phone sends reward codes by itself, even with the app closed. Keep it charged, with load and signal."
                : "Off — reward codes go through your backup below, or customers are asked to see the cashier."}
            </Text>
            {gateway.isEnabled && gateway.isBatteryUnrestricted === false ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  Android may pause the gateway to save battery. Allow background activity so codes keep going out.
                </Text>
                <TouchableOpacity accessibilityRole="button" disabled={isBusy} onPress={() => void allowBackground()}>
                  <Text style={styles.noticeAction}>Allow background activity</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          accessibilityRole="button"
          style={deviceId ? styles.buttonGhost : styles.button}
          disabled={isBusy}
          onPress={() => void (deviceId ? remove() : enroll())}
        >
          <Text style={deviceId ? styles.buttonGhostLabel : styles.buttonLabel}>
            {isBusy ? "Working…" : deviceId ? "Remove this phone" : "Enroll this phone"}
          </Text>
        </TouchableOpacity>
      </View>
      {tenantId ? <SmsFallbackCard tenantId={tenantId} /> : null}
    </>
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowLabel: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  notice: { backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  noticeText: { ...typography.caption, color: colors.textPrimary },
  noticeAction: { ...typography.caption, color: colors.textPrimary, fontWeight: "700", textDecorationLine: "underline" },
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
