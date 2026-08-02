import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { useAuthStore } from "../../stores/auth-store";
import {
  buildCustomerList,
  type CustomerListFilter,
  type CustomerRow,
  type ReachabilityStatus,
} from "../../lib/sms/customer-list";
import {
  listCustomers,
  listSuppressedPhones,
  setCustomerOptOut,
} from "../../lib/sms/customers-repo";
import type { SmsCustomer } from "../../lib/sms/types";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

/** Badge colours per reachability status. Green only for genuinely textable. */
const BADGE_STYLES: Record<ReachabilityStatus, { bg: string; fg: string }> = {
  textable: { bg: colors.successLight, fg: colors.success },
  no_consent: { bg: colors.infoLight, fg: colors.info },
  opted_out: { bg: colors.dangerLight, fg: colors.danger },
  suppressed: { bg: colors.dangerLight, fg: colors.danger },
  no_phone: { bg: colors.primaryLight, fg: colors.textSecondary },
};

function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`;
}

function lastOrderLabel(iso: string | null): string {
  if (!iso) return "No orders yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No orders yet";
  return `Last order ${date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default function CustomersScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);

  const [customers, setCustomers] = useState<SmsCustomer[]>([]);
  const [suppressedPhones, setSuppressedPhones] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerListFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      const [people, blocked] = await Promise.all([
        listCustomers(tenantId),
        listSuppressedPhones(tenantId),
      ]);
      setCustomers(people);
      setSuppressedPhones(blocked);
    } catch {
      // A failed read must not render as "no customers yet" — that made a
      // broken query indistinguishable from a genuinely empty database.
      setError("Could not load your customers. Pull down to try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(
    () => buildCustomerList(customers, { query, filter, suppressedPhones }),
    [customers, query, filter, suppressedPhones]
  );

  const toggleOptOut = async (customer: SmsCustomer) => {
    const nextOptOut = !customer.sms_opt_out;
    // Optimistic: the list is long and a round-trip per tap feels broken.
    setCustomers((current) =>
      current.map((c) => (c.id === customer.id ? { ...c, sms_opt_out: nextOptOut } : c))
    );
    try {
      await setCustomerOptOut(customer.id, nextOptOut);
    } catch {
      setCustomers((current) =>
        current.map((c) => (c.id === customer.id ? { ...c, sms_opt_out: !nextOptOut } : c))
      );
      Alert.alert("Could not save", "That change did not stick. Please try again.");
    }
  };

  if (isLoading) return <LoadingState message="Loading customers…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <View style={styles.screen}>
      <WorkspaceSwitcher />

      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.subtitle}>
          {list.stats.total} {list.stats.total === 1 ? "guest" : "guests"}, captured
          automatically from orders
        </Text>
      </View>

      {/*
        The reachable count is stated up front rather than discovered when a
        campaign sends to nobody. With the checkout opt-in not yet shipped this
        will read "0 can be texted", which is the honest number.
      */}
      <View style={styles.statsRow}>
        <Stat label="Can text" value={list.stats.textable} tone={colors.success} />
        <Stat label="Not opted in" value={list.stats.noConsent} tone={colors.info} />
        <Stat label="Opted out" value={list.stats.optedOut} tone={colors.danger} />
        <Stat label="No number" value={list.stats.noPhone} tone={colors.textSecondary} />
      </View>

      {Platform.OS !== "android" && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Follow-up texts send from the Android app, using this phone&apos;s SIM. You can
            browse and manage your customer list here.
          </Text>
        </View>
      )}

      {list.stats.textable === 0 && list.stats.total > 0 && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Nobody can be texted yet. Guests become reachable once they agree to SMS
            updates at checkout.
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          placeholder="Search name or number"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.filterRow}>
          <FilterChip
            label="All"
            isActive={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterChip
            label="Can text"
            isActive={filter === "textable"}
            onPress={() => setFilter("textable")}
          />
        </View>
      </View>

      <FlatList
        data={list.rows}
        keyExtractor={(row) => row.customer.id}
        contentContainerStyle={list.rows.length === 0 ? styles.emptyWrap : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState
            message={
              query
                ? `Nothing matches "${query}".`
                : "Customers appear here automatically once orders come in."
            }
            actionLabel={query ? "Clear search" : undefined}
            onAction={query ? () => setQuery("") : undefined}
          />
        }
        renderItem={({ item }) => (
          <CustomerCard row={item} onToggleOptOut={() => toggleOptOut(item.customer)} />
        )}
      />
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, isActive && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CustomerCard({
  row,
  onToggleOptOut,
}: {
  row: CustomerRow;
  onToggleOptOut: () => void;
}) {
  const { customer, reachability } = row;
  const badge = BADGE_STYLES[reachability.status];

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1}>
            {customer.name?.trim() || "Unnamed guest"}
          </Text>
          <Text style={styles.cardPhone}>{customer.phone_e164 ?? "No phone number"}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>{reachability.label}</Text>
        </View>
      </View>

      <View style={styles.cardMetrics}>
        <Text style={styles.metric}>
          {customer.order_count} {customer.order_count === 1 ? "order" : "orders"}
        </Text>
        <Text style={styles.metricDot}>·</Text>
        <Text style={styles.metric}>{peso(customer.total_spent)}</Text>
        <Text style={styles.metricDot}>·</Text>
        <Text style={styles.metric}>{lastOrderLabel(customer.last_order_at)}</Text>
      </View>

      {customer.phone_e164 && (
        <TouchableOpacity
          style={styles.optOutButton}
          onPress={onToggleOptOut}
          accessibilityRole="button"
        >
          <Text style={styles.optOutText}>
            {customer.sms_opt_out ? "Allow texts again" : "Do not text"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  statValue: { ...typography.heading, fontWeight: "700" },
  statLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
  },
  noticeText: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  controls: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  search: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  filterRow: { flexDirection: "row", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.textOnDark, fontWeight: "600" },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardIdentity: { flex: 1 },
  cardName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  cardPhone: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  badgeText: { ...typography.small, fontWeight: "600" },
  cardMetrics: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: spacing.sm,
  },
  metric: { ...typography.caption, color: colors.textSecondary },
  metricDot: { ...typography.caption, color: colors.textTertiary },
  optOutButton: { marginTop: spacing.sm, alignSelf: "flex-start" },
  optOutText: { ...typography.caption, color: colors.accent, fontWeight: "600" },
});
