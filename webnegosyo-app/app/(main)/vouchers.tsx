import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { NEW_VOUCHER_ID, voucherHref } from "../../lib/navigation";
import { useVouchers } from "../../lib/query/use-vouchers";
import { useRefetchOnScreenFocus } from "../../lib/query/use-screen-focus";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useNowMs } from "../../lib/use-now-ms";
import { setVoucherActive } from "../../lib/voucher-admin/voucher-repository";
import {
  countByFilter,
  filterVouchers,
  type VoucherFilter,
} from "../../lib/voucher-admin/voucher-status";
import { VOUCHER_TEMPLATES } from "../../lib/voucher-admin/voucher-form";
import type { Voucher } from "../../lib/vouchers/types";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { VoucherTicket } from "../../components/vouchers/VoucherTicket";

/**
 * The store's promo codes.
 *
 * Opens on what is running now, because "is my code working?" is the question
 * that brings a merchant here mid-service; what is coming up and what has
 * ended are one tap away. Each code is drawn as a ticket with its switch on
 * the right, so pausing a promotion never needs the editor. A store with no
 * codes yet gets four ready-made ideas instead of a blank form.
 */

/** Past this many codes a search box earns its space. */
const SEARCH_THRESHOLD = 5;
const STALE_MS = 60_000;

type TabFilter = Exclude<VoucherFilter, "all">;

export default function VouchersScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { vouchers, isLoading, error, refetch, isRefetching, dataUpdatedAt, patch, invalidate } =
    useVouchers(tenantId);

  const [filter, setFilter] = useState<TabFilter>("live");
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  // A clock that moves, so a code that expires while the tab sits open drops
  // out of Live; one value per render keeps each pill and the counts agreeing.
  const nowMs = useNowMs();
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  useRefetchOnScreenFocus({
    enabled: tenantId !== null,
    staleMs: STALE_MS,
    dataUpdatedAt,
    isFetching: isRefetching,
    refetch,
  });

  const counts = useMemo(() => countByFilter(vouchers, now), [vouchers, now]);
  const isSearching = query.trim() !== "";
  // A search looks across every tab: a merchant typing a code does not know
  // or care whether it has ended.
  const shown = useMemo(
    () => filterVouchers(vouchers, isSearching ? "all" : filter, query, now),
    [vouchers, filter, query, isSearching, now],
  );

  const blockedByDemo = (): boolean => {
    if (!useAuthStore.getState().isDemo) return false;
    Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
    return true;
  };

  const openNew = (templateId?: string) => {
    if (blockedByDemo()) return;
    const href = voucherHref(NEW_VOUCHER_ID);
    router.push(templateId ? `${href}?template=${encodeURIComponent(templateId)}` : href);
  };

  const applyActive = useCallback(
    async (voucher: Voucher, isActive: boolean) => {
      if (!tenantId) return;
      patch((list) => list.map((v) => (v.id === voucher.id ? { ...v, isActive } : v)));
      try {
        await setVoucherActive(voucher.id, tenantId, isActive);
        await invalidate();
      } catch {
        // Put it back: a switch left showing "on" for a code the till refuses
        // is a merchant promising a discount nobody can get.
        patch((list) => list.map((v) => (v.id === voucher.id ? { ...v, isActive: voucher.isActive } : v)));
        Alert.alert("Couldn't update", "Check your connection and try again.");
      }
    },
    [tenantId, patch, invalidate],
  );

  const handleToggle = (voucher: Voucher) => {
    if (blockedByDemo()) return;
    if (!voucher.isActive) {
      void applyActive(voucher, true);
      return;
    }
    Alert.alert(
      `Switch off ${voucher.code}?`,
      "Customers and your counter won't be able to use it. You can switch it back on any time.",
      [
        { text: "Keep it on", style: "cancel" },
        { text: "Switch off", style: "destructive", onPress: () => void applyActive(voucher, false) },
      ],
    );
  };

  const onRefresh = () => refreshWithMinSpinner([refetch], setIsRefreshing);

  const filterOptions = [
    { label: `Live · ${counts.live}`, value: "live" as const },
    { label: `Upcoming · ${counts.upcoming}`, value: "upcoming" as const },
    { label: `Ended · ${counts.ended}`, value: "ended" as const },
  ];

  const renderBody = () => {
    if (isLoading) return <LoadingState message="Loading your vouchers…" />;
    if (error && vouchers.length === 0) {
      return (
        <ErrorState
          title="Couldn't load vouchers"
          message="Check your connection, then try again."
          onRetry={() => void refetch()}
        />
      );
    }
    if (vouchers.length === 0) return <FirstVoucher onStart={openNew} />;

    return (
      <>
        {vouchers.length >= SEARCH_THRESHOLD ? (
          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search codes or names"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel="Search vouchers"
            />
          </View>
        ) : null}

        {isSearching ? (
          <Text style={styles.resultCount}>
            {shown.length} {shown.length === 1 ? "match" : "matches"}
          </Text>
        ) : (
          <SegmentedControl
            options={filterOptions}
            value={filter}
            onChange={setFilter}
            accessibilityPrefix="Show"
          />
        )}

        <View style={styles.list}>
          {shown.length === 0 ? (
            <EmptyState
              inset
              icon="voucher"
              title={isSearching ? "No matching codes" : EMPTY_COPY[filter].title}
              message={isSearching ? `Nothing matches “${query.trim()}”.` : EMPTY_COPY[filter].message}
              actionLabel={isSearching || filter === "ended" ? undefined : "New voucher"}
              onAction={isSearching || filter === "ended" ? undefined : () => openNew()}
            />
          ) : (
            shown.map((voucher) => (
              <VoucherTicket
                key={voucher.id}
                voucher={voucher}
                now={now}
                onPress={() => router.push(voucherHref(voucher.id))}
                trailing={
                  <Switch
                    value={voucher.isActive}
                    onValueChange={() => handleToggle(voucher)}
                    trackColor={{ false: colors.separator, true: colors.success }}
                    accessibilityLabel={`${voucher.code} ${voucher.isActive ? "on" : "off"}`}
                  />
                }
              />
            ))
          )}
        </View>
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Vouchers"
        subtitle="Promo codes for checkout and the counter"
        actions={<IconButton icon="plus" label="New voucher" tone="primary" onPress={() => openNew()} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {renderBody()}
      </ScrollView>
    </View>
  );
}

const EMPTY_COPY: Record<TabFilter, { title: string; message: string }> = {
  live: {
    title: "Nothing running right now",
    message: "Create a code, or switch one back on from Ended.",
  },
  upcoming: {
    title: "Nothing scheduled",
    message: "Give a new code a start date to line it up ahead of time.",
  },
  ended: {
    title: "Nothing has ended",
    message: "Codes that expire, run out or are switched off land here.",
  },
};

/** The first-run screen: what a voucher is, and four one-tap ways to start. */
function FirstVoucher({ onStart }: { onStart: (templateId?: string) => void }) {
  return (
    <View>
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Icon name="voucher" size={28} color={colors.accent} />
        </View>
        <Text style={styles.introTitle}>Bring customers back with a code</Text>
        <Text style={styles.introText}>
          Customers type it at online checkout, or your cashier applies it at the counter. You
          decide how much it takes off, for how long, and how many times it can be used.
        </Text>
        <TouchableOpacity
          style={styles.introButton}
          onPress={() => onStart()}
          accessibilityRole="button"
        >
          <Icon name="plus" size={18} color={colors.textOnDark} />
          <Text style={styles.introButtonText}>Create a voucher</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.ideasTitle}>Or start from an idea</Text>
      <View style={styles.ideas}>
        {VOUCHER_TEMPLATES.map((template) => (
          <TouchableOpacity
            key={template.id}
            style={styles.idea}
            onPress={() => onStart(template.id)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${template.title}, ${template.hint}`}
          >
            <Text style={styles.ideaTitle}>{template.title}</Text>
            <Text style={styles.ideaHint}>{template.hint}</Text>
            <View style={styles.ideaArrow}>
              <Icon name="arrow-right" size={16} color={colors.textPrimary} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 3 },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  resultCount: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },

  list: { gap: spacing.md, marginTop: spacing.lg },

  intro: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "flex-start",
    ...shadow.sm,
  },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  introTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2, color: colors.textPrimary },
  introText: { ...typography.body, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 21 },
  introButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  introButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },

  ideasTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.xxl, marginBottom: spacing.md },
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  idea: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 104,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  ideaTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  ideaHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  ideaArrow: { marginTop: "auto", paddingTop: spacing.sm, alignSelf: "flex-end" },
});
