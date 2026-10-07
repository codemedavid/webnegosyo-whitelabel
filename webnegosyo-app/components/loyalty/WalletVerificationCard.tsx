import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { useAuthStore } from "../../stores/auth-store";
import { isLoyaltySmsDeliveryEnabled } from "../../lib/loyalty/sms-delivery-flag";
import { deliveryTransportDeps } from "../../lib/loyalty/sms-delivery-runtime";
import {
  readLoyaltySmsSettings,
  setLoyaltyWalletVerification,
  type LoyaltySmsSettings,
} from "../../lib/loyalty/sms-delivery-api";

/**
 * "Text a code before showing rewards": with this on, the public rewards page
 * (and the stamp count at checkout) shows nothing for a typed number until the
 * customer enters the SMS code sent to it. Off by default.
 *
 * Codes go out the same way reward codes do — a gateway phone, else the
 * store's Semaphore backup — so the card warns when neither is available:
 * with the switch on, nobody could see their rewards.
 *
 * Renders nothing while the SMS pilot gate is off or in demo mode. The server
 * decides who may change it (loyalty access).
 */
export function WalletVerificationCard() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const isDemo = useAuthStore((s) => s.isDemo);
  if (!tenantId || isDemo || !isLoyaltySmsDeliveryEnabled()) return null;
  return <WalletVerificationSwitch tenantId={tenantId} />;
}

function WalletVerificationSwitch({ tenantId }: { tenantId: string }) {
  const [settings, setSettings] = useState<LoyaltySmsSettings | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await readLoyaltySmsSettings(deliveryTransportDeps(), tenantId);
    if (result.ok) setSettings(result.settings);
    else setError(result.error);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (enabled: boolean) => {
    if (!settings) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await setLoyaltyWalletVerification(deliveryTransportDeps(), tenantId, enabled);
      if (result.ok) setSettings({ ...settings, walletVerification: result.walletVerification });
      else setError(result.error);
    } finally {
      setIsBusy(false);
    }
  };

  const isOn = settings?.walletVerification === true;
  const cannotSend = settings !== null && !settings.gatewayOnline && !settings.fallback.configured;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>Verify before showing rewards</Text>
          <Text style={styles.body}>
            Customers get an SMS code and enter it before they can see their stamp card and rewards.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Verify before showing rewards"
          value={isOn}
          disabled={!settings || isBusy}
          onValueChange={(value) => void toggle(value)}
        />
      </View>
      {isOn && cannotSend ? (
        <Text style={styles.warning}>
          No gateway phone is online and there is no Semaphore backup, so customers can’t get a code right now and won’t
          see their rewards.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
  title: { ...typography.heading, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  warning: { ...typography.caption, color: colors.danger },
  error: { ...typography.caption, color: colors.danger },
});
