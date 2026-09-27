import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../../stores/auth-store";
import { hasPermission } from "../../../lib/staff-permissions";
import { getCustomerProfile, type CustomerProfile } from "../../../lib/customers/repo";
import {
  contactLinksFor,
  displayNameOf,
  distinctChannels,
  loyaltyKeyFor,
} from "../../../lib/customers/profile";
import { avatarIndexFor, initialsOf } from "../../../lib/sms/avatar";
import { loyaltyMemberHref } from "../../../lib/navigation";
import { colors, typography, spacing, radius } from "../../../theme/colors";
import { BackHeader } from "../../../components/BackHeader";
import { Icon } from "../../../components/Icon";
import { LoadingState } from "../../../components/LoadingState";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";

/**
 * One guest, opened from the Customers list.
 *
 * The list row is a roster line: a name, a number and three figures. This is
 * everything the store knows about the person behind it — how to reach them,
 * what they spend, what they usually order, how they order, whether they may be
 * texted — and the door to their order and stamp history.
 *
 * Keyed by the `customers` row id and read straight from the platform table
 * (see `lib/customers/repo.ts`), so it works for every guest on the list,
 * whatever backend holds their orders and whether or not they hold a card.
 */
export default function CustomerScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const holder = { role, isOwner, permissions };

  // The tab bar hides the guest list from an ungranted staffer, but this is a
  // detail route reachable by URL, so it refuses on its own as well.
  const isAllowed = hasPermission(holder, "customers");
  const canOpenLoyalty = hasPermission(holder, "loyalty_manage");

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [isRefreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !customerId) {
      setStatus("missing");
      return;
    }
    try {
      const next = await getCustomerProfile(tenantId, customerId);
      setProfile(next);
      setStatus(next ? "ready" : "missing");
    } catch {
      // A failed read must not look like "no such guest".
      setStatus("error");
    }
  }, [tenantId, customerId]);

  // On focus: a tab route stays mounted, so a mount-only read would keep
  // showing the first guest opened after the merchant taps a second one.
  useFocusEffect(
    useCallback(() => {
      if (!isAllowed) return;
      setProfile((current) => (current?.id === customerId ? current : null));
      setStatus((current) => (current === "ready" ? current : "loading"));
      void load();
    }, [isAllowed, load, customerId])
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (!isAllowed) {
    return (
      <View style={styles.container}>
        <BackHeader title="Customer" />
        <EmptyState title="No access" message="Your account cannot see customer details." />
      </View>
    );
  }

  const isStale = profile !== null && profile.id !== customerId;
  if (status === "loading" || isStale) {
    return (
      <View style={styles.container}>
        <BackHeader title="Customer" />
        <LoadingState />
      </View>
    );
  }

  if (status !== "ready" || !profile) {
    return (
      <View style={styles.container}>
        <BackHeader title="Customer" />
        {status === "missing" ? (
          <EmptyState title="Not found" message="This guest is no longer on your list." />
        ) : (
          <ErrorState
            message="This guest could not be loaded."
            onRetry={() => {
              setStatus("loading");
              void load();
            }}
          />
        )}
      </View>
    );
  }

  const name = displayNameOf(profile.name);
  const links = contactLinksFor(profile.phoneE164, profile.email);
  const loyaltyKey = loyaltyKeyFor(profile.phoneE164, profile.email);
  const channels = distinctChannels(profile.channelsUsed);
  const ring = colors.avatarPalette[avatarIndexFor(profile.id, colors.avatarPalette.length)];

  return (
    <View style={styles.container}>
      <BackHeader title={name} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {/* ── Who they are ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <View style={[styles.avatar, { borderColor: ring }]}>
              <Text style={styles.initials}>{initialsOf(profile.name)}</Text>
            </View>
            <View style={styles.identity}>
              <Text style={styles.name} numberOfLines={2}>
                {name}
              </Text>
              <Text style={styles.muted}>
                {profile.firstOrderAt
                  ? `Guest since ${longDate(profile.firstOrderAt)}`
                  : "No orders yet"}
              </Text>
            </View>
          </View>

          <DetailLine label="Phone" value={profile.phoneE164 ?? "No phone number"} />
          {profile.email ? <DetailLine label="Email" value={profile.email} /> : null}

          {(links.call || links.email) && (
            <View style={styles.contactRow}>
              {links.call ? <ContactButton label="Call" url={links.call} /> : null}
              {links.text ? <ContactButton label="Text" url={links.text} /> : null}
              {links.email ? <ContactButton label="Email" url={links.email} /> : null}
            </View>
          )}
        </View>

        {/* ── What they are worth ────────────────────────────────────── */}
        <View style={[styles.card, styles.stats]}>
          <Stat label="Orders" value={String(profile.orderCount)} />
          <Stat label="Spent" value={peso(profile.totalSpent)} />
          <Stat label="Average" value={peso(profile.averageOrderValue)} />
          <Stat label="Last order" value={shortDate(profile.lastOrderAt)} />
        </View>

        {/* ── What they order, and how ───────────────────────────────── */}
        {profile.topItems.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>Usually orders</Text>
            {profile.topItems.map((item, index) => (
              <View key={`${index}:${item.name}`} style={styles.itemRow}>
                <Text style={styles.value} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.muted}>×{item.quantity}</Text>
              </View>
            ))}
          </View>
        )}

        {channels.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>Orders by</Text>
            <View style={styles.chips}>
              {channels.map((channel) => (
                <View key={channel} style={styles.chip}>
                  <Text style={styles.chipText}>{channel}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── May we text them ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.label}>Texts</Text>
          <Text style={profile.smsOptOut ? styles.warn : styles.value}>
            {textingLine(profile)}
          </Text>
          {profile.notes ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Notes</Text>
              <Text style={styles.value}>{profile.notes}</Text>
            </>
          ) : null}
        </View>

        {/* ── Their orders and stamps ────────────────────────────────── */}
        {canOpenLoyalty && loyaltyKey ? (
          <TouchableOpacity
            style={[styles.card, styles.linkRow]}
            onPress={() => router.push(loyaltyMemberHref(loyaltyKey))}
            accessibilityRole="button"
          >
            <View style={styles.identity}>
              <Text style={styles.linkTitle}>Order history & rewards</Text>
              <Text style={styles.muted}>Past orders, addresses, stamp cards</Text>
            </View>
            <Icon name="chevron" color={colors.textTertiary} size={18} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.value} selectable numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ContactButton({ label, url }: { label: string; url: string }) {
  const open = async () => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(`Could not ${label.toLowerCase()}`, "This device has no app for that.");
    }
  };
  return (
    <TouchableOpacity style={styles.contactButton} onPress={open} accessibilityRole="button">
      <Text style={styles.contactText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function textingLine(profile: CustomerProfile): string {
  if (!profile.phoneE164) return "No phone number — cannot be texted.";
  if (profile.smsOptOut) return "Asked not to be texted.";
  if (profile.smsConsent) return "Agreed to follow-up texts.";
  return "Has not agreed to texts yet.";
}

function peso(amount: number): string {
  return `₱${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH")}`;
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortDate(iso: string | null): string {
  const date = parseDate(iso);
  return date ? date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
}

function longDate(iso: string): string {
  const date = parseDate(iso);
  return date
    ? date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

const AVATAR = 52;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.xs,
  },
  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  identity: { flex: 1, gap: 2 },
  name: { ...typography.title, color: colors.textPrimary },
  detailLine: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 2 },
  detailLabel: { ...typography.caption, color: colors.textSecondary, width: 52 },
  contactRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  contactButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  contactText: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1 },
  statValue: { ...typography.heading, color: colors.textPrimary },
  statLabel: { ...typography.small, color: colors.textSecondary },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  spaced: { marginTop: spacing.sm },
  value: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  muted: { ...typography.caption, color: colors.textSecondary },
  warn: { ...typography.body, color: colors.danger, fontWeight: "600" },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 2,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2 },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipText: { ...typography.caption, color: colors.textPrimary },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  linkTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
});
