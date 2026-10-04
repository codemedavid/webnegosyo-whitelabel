import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { deliveryTransportDeps } from "../../lib/loyalty/sms-delivery-runtime";
import {
  clearLoyaltySmsFallback,
  readLoyaltySmsSettings,
  saveLoyaltySmsFallback,
  type LoyaltySmsSettings,
} from "../../lib/loyalty/sms-delivery-api";

interface SmsFallbackCardProps {
  tenantId: string;
}

/**
 * Where reward codes go when no gateway phone is online: the store's own
 * Semaphore account (paid per SMS from the owner's credits), or nowhere — in
 * which case the customer is told to see the cashier instead of waiting.
 *
 * The key is write-only: the server checks it with Semaphore before storing
 * it and never sends it back, so this card only ever shows "on" or "off".
 */
export function SmsFallbackCard({ tenantId }: SmsFallbackCardProps) {
  const [settings, setSettings] = useState<LoyaltySmsSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [senderName, setSenderName] = useState("");
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

  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setIsBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApiKey("");
      setSenderName("");
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const save = () => run(() => saveLoyaltySmsFallback(deliveryTransportDeps(), tenantId, {
    apiKey: apiKey.trim(),
    senderName: senderName.trim() || null,
  }));
  const remove = () => run(() => clearLoyaltySmsFallback(deliveryTransportDeps(), tenantId));

  const fallback = settings?.fallback;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Backup for reward codes</Text>
      {settings ? (
        <Text style={[styles.status, settings.gatewayOnline ? styles.online : styles.offline]}>
          {settings.gatewayOnline ? "● A gateway phone is online" : "○ No gateway phone is online"}
        </Text>
      ) : null}
      {fallback?.configured ? (
        <>
          <Text style={styles.body}>
            Semaphore backup is on{fallback.senderName ? ` (sender: ${fallback.senderName})` : ""}. When no gateway phone is
            online, codes are sent through your Semaphore account (about 2 credits per code).
          </Text>
          <TouchableOpacity accessibilityRole="button" style={styles.buttonGhost} disabled={isBusy} onPress={() => void remove()}>
            <Text style={styles.buttonGhostLabel}>{isBusy ? "Working…" : "Remove backup"}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Without a backup, when no gateway phone is online customers are asked to see the cashier. Add your Semaphore
            API key to send codes from Semaphore instead.
          </Text>
          <TextInput
            accessibilityLabel="Semaphore API key"
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Semaphore API key"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TextInput
            accessibilityLabel="Sender name"
            style={styles.input}
            value={senderName}
            onChangeText={setSenderName}
            placeholder="Sender name (optional, approved in Semaphore)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={11}
          />
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.button}
            disabled={isBusy || apiKey.trim() === ""}
            onPress={() => void save()}
          >
            <Text style={styles.buttonLabel}>{isBusy ? "Checking…" : "Save backup"}</Text>
          </TouchableOpacity>
        </>
      )}
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
  title: { ...typography.heading, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  status: { ...typography.caption, fontWeight: "700" },
  online: { color: colors.success },
  offline: { color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
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
