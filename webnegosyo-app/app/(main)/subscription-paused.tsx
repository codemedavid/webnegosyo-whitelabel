/**
 * Where a lapsed store lands.
 *
 * Deliberately a dead end with an explanation rather than a sign-out. The
 * merchant is still authenticated, so this screen can name their store and say
 * exactly what is owed and since when. Bouncing them to the login form instead
 * would tell them nothing, and they would just retype a password they know is
 * correct and conclude the app is broken.
 *
 * There is no "pay now" button because there is no gateway yet: payment is a
 * GCash or bank transfer that a human marks off. So the only honest call to
 * action is how to reach that human.
 */
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../../theme/colors";
import { useAuthStore } from "../../stores/auth-store";

const SUPPORT_EMAIL = "support@webnegosyo.com";

export default function SubscriptionPausedScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Subscription</Text>
        <Text style={styles.title}>Your account is on hold</Text>

        <Text style={styles.body}>
          {tenantName ? `${tenantName}'s ` : "Your "}
          admin tools are paused while the monthly subscription is unpaid.
        </Text>

        {/* Said plainly and early: the merchant's first fear on seeing this
            screen is that their shop has gone offline and orders are being
            lost. It has not, and they are not. */}
        <View style={styles.reassurance}>
          <Text style={styles.reassuranceTitle}>Your store is still open</Text>
          <Text style={styles.reassuranceBody}>
            Customers can browse your menu and place orders as normal. Only these
            admin tools are paused.
          </Text>
        </View>

        <Text style={styles.footer}>
          Already paid? Send your reference number to {SUPPORT_EMAIL} and we will
          restore access.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.textTertiary,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.primary },
  body: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  reassurance: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  reassuranceTitle: { fontSize: 15, fontWeight: "700", color: colors.primary },
  reassuranceBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  footer: { fontSize: 13, lineHeight: 19, color: colors.textTertiary },
});
