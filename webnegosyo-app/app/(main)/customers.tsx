import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  type RefreshControlProps,
  Platform,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuthStore } from "../../stores/auth-store";
import { NEW_CAMPAIGN_ID, campaignHref } from "../../lib/navigation";
import {
  computeCampaignDueStates,
  type CampaignDueState,
} from "../../lib/sms/due-runs";
import { syncDueCampaignAlerts } from "../../lib/sms/due-alerts";
import {
  lastRunAtByCampaign,
  listCampaignRows,
  toScheduledCampaign,
} from "../../lib/sms/campaigns-repo";
import {
  buildCustomerList,
  type CustomerListFilter,
} from "../../lib/sms/customer-list";
import {
  listCustomers,
  listSuppressedPhones,
  setCustomerConsent,
  setCustomerOptOut,
} from "../../lib/sms/customers-repo";
import {
  consentActionFor,
  withConsentRecorded,
  type ConsentAction,
} from "../../lib/sms/consent-actions";
import type { SmsCustomer } from "../../lib/sms/types";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { ReachBar } from "../../components/sms/ReachBar";
import { GuestRow } from "../../components/sms/GuestRow";
import { CampaignCard } from "../../components/sms/CampaignCard";

type Section = "guests" | "campaigns";

export default function CustomersScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);

  const [customers, setCustomers] = useState<SmsCustomer[]>([]);
  const [suppressedPhones, setSuppressedPhones] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerListFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<Section>("guests");
  const [campaignStates, setCampaignStates] = useState<CampaignDueState[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      const [people, blocked, rows, lastRuns] = await Promise.all([
        listCustomers(tenantId),
        listSuppressedPhones(tenantId),
        listCampaignRows(tenantId),
        lastRunAtByCampaign(tenantId),
      ]);
      setCustomers(people);
      setSuppressedPhones(blocked);
      const states = computeCampaignDueStates(
        rows.map((row) => toScheduledCampaign(row, lastRuns[row.id] ?? null)),
        new Date()
      );
      setCampaignStates(states);
      // Fire-and-forget: a campaign that becomes due while the app is closed
      // is announced by Android itself. This never throws and never blocks the
      // list — see `due-alerts.ts`.
      void syncDueCampaignAlerts(states);
    } catch {
      // A failed read must not render as "no customers yet" — that made a
      // broken query indistinguishable from a genuinely empty database.
      setError("Could not load your customers. Pull down to try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  // On focus, not on mount. This tab never unmounts, so a mount-only effect
  // meant a campaign saved in the editor did not appear until the app was
  // force-quit from the background — which reads exactly like a failed save.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const list = useMemo(
    () => buildCustomerList(customers, { query, filter, suppressedPhones }),
    [customers, query, filter, suppressedPhones]
  );

  const dueCount = campaignStates.filter((state) => state.isDue).length;

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

  /**
   * Record what the guest just said at the counter.
   *
   * Confirmed before writing, because this is a consent record the merchant is
   * attesting to on the guest's behalf — a mis-tap here texts someone who never
   * agreed, and the tap is one row away from "Do not text".
   */
  const recordConsent = (customer: SmsCustomer, action: ConsentAction) => {
    if (!action.isEnabled) return;
    const nextConsent = action.kind === "record";

    const apply = async () => {
      setCustomers((current) =>
        current.map((c) => (c.id === customer.id ? withConsentRecorded(c, nextConsent) : c))
      );
      try {
        await setCustomerConsent(customer.id, nextConsent);
      } catch {
        setCustomers((current) =>
          current.map((c) => (c.id === customer.id ? withConsentRecorded(c, !nextConsent) : c))
        );
        Alert.alert("Could not save", "That change did not stick. Please try again.");
      }
    };

    if (!nextConsent) {
      apply();
      return;
    }

    Alert.alert(
      "Did they agree to texts?",
      `Only tap yes if ${customer.name?.trim() || "this guest"} told you they are happy to ` +
        "get follow-up texts from your store.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, they agreed", onPress: apply },
      ]
    );
  };

  if (isLoading) return <LoadingState message="Loading customers…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
    />
  );

  return (
    <View style={styles.screen}>
      <WorkspaceSwitcher />

      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        {/*
          Two levels of navigation used to wear the same pill. The switch
          between two halves of a screen is a segmented track; the filters
          below the reach bar are pills. Telling them apart is most of what
          made this screen confusing.
        */}
        <SegmentedControl
          options={[
            { label: `Guests ${list.stats.total}`, value: "guests" as Section },
            {
              label: dueCount > 0
                ? `Campaigns ${campaignStates.length} · ${dueCount} due`
                : `Campaigns ${campaignStates.length}`,
              value: "campaigns" as Section,
            },
          ]}
          value={section}
          onChange={setSection}
          accessibilityPrefix="Show"
        />
      </View>

      {section === "campaigns" ? (
        <CampaignsSection states={campaignStates} refreshControl={refreshControl} />
      ) : (
        <FlatList
          data={list.rows}
          keyExtractor={(row) => row.customer.id}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          // Rows sit on one shared surface, separated by a hairline — a roster,
          // not several hundred identical bordered cards on the canvas.
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <ReachBar stats={list.stats} filter={filter} onFilter={setFilter} />

              {Platform.OS !== "android" && (
                <Notice text="Follow-up texts send from the Android app, using that phone's SIM. You can browse and manage your customer list here." />
              )}

              {list.stats.textable === 0 && list.stats.total > 0 && (
                <Notice text="Nobody can be texted yet. Guests opt in at online checkout — or ask at the counter and tap “They agreed to texts” on their row." />
              )}

              <View style={styles.searchRow}>
                <Icon name="search" color={colors.textTertiary} size={17} />
                <TextInput
                  style={styles.search}
                  placeholder="Search name or number"
                  placeholderTextColor={colors.textTertiary}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query !== "" && (
                  <TouchableOpacity
                    onPress={() => setQuery("")}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Text style={styles.clearSearch}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              message={
                query
                  ? `Nothing matches “${query}”.`
                  : filter !== "all"
                    ? "No guests in this group."
                    : "Customers appear here automatically once orders come in."
              }
              actionLabel={query ? "Clear search" : filter !== "all" ? "Show everyone" : undefined}
              onAction={
                query ? () => setQuery("") : filter !== "all" ? () => setFilter("all") : undefined
              }
            />
          }
          renderItem={({ item }) => (
            <GuestRow
              row={item}
              consentAction={consentActionFor(item.customer, suppressedPhones)}
              onToggleOptOut={() => toggleOptOut(item.customer)}
              onRecordConsent={(action) => recordConsent(item.customer, action)}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * The campaign list. Due state comes from `due-runs.ts` rather than being
 * recomputed here, so what the merchant reads as "Ready to send" is the same
 * judgement the send path will make.
 */
function CampaignsSection({
  states,
  refreshControl,
}: {
  states: CampaignDueState[];
  refreshControl: React.ReactElement<RefreshControlProps>;
}) {
  return (
    <FlatList
      data={states}
      keyExtractor={(state) => state.campaignId}
      contentContainerStyle={styles.campaignContent}
      refreshControl={refreshControl}
      ListHeaderComponent={
        <TouchableOpacity
          style={styles.newCampaign}
          onPress={() => router.push(campaignHref(NEW_CAMPAIGN_ID))}
          accessibilityRole="button"
        >
          <Icon name="plus" color={colors.textOnDark} size={15} strokeWidth={2.25} />
          <Text style={styles.newCampaignText}>New campaign</Text>
        </TouchableOpacity>
      }
      ListEmptyComponent={
        <EmptyState message="No campaigns yet. A campaign is one message, sent to the guests you choose, on a date you pick." />
      }
      renderItem={({ item }) => (
        <CampaignCard
          state={item}
          onPress={() => router.push(campaignHref(item.campaignId))}
        />
      )}
    />
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  // Explicitly cream: the header lives inside the list's content container,
  // which carries the roster's white surface, so without this the reach card
  // and the search box would sit on white and the card would disappear into
  // its own backdrop.
  listHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  // The roster's surface. Rows carry their own padding so the divider can run
  // the full width, which is what makes a list read as one object.
  listContent: { paddingBottom: spacing.xxl, backgroundColor: colors.card },
  divider: { height: 1, backgroundColor: colors.separator },
  campaignContent: { padding: spacing.lg, gap: spacing.sm },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
  },
  search: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.textPrimary,
  },
  clearSearch: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  notice: {
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
  },
  noticeText: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  newCampaign: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  newCampaignText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});
