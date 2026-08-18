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
import { isSmsCampaignsAvailable } from "../../lib/sms/availability";
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
import { ExportSheet } from "../../components/ExportSheet";
import { fetchAllCustomersForExport } from "../../lib/customers/repo";
import { runCustomersExport } from "../../lib/export/run-export";

type Section = "guests" | "campaigns";

// Module scope, not a hook: the platform cannot change while the app is
// running, and holding it in state would invite a render where the campaign UI
// exists for a frame on a device that can never send.
const canSendSms = isSmsCampaignsAvailable(Platform.OS);

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
  const [isExportOpen, setExportOpen] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!tenantId) return;
    setExporting(true);
    setExportError(null);
    try {
      // The management read, not the SMS-shaped list on screen: the export
      // carries spend and consent columns the campaign view never loads.
      const { customers: allCustomers, isComplete } =
        await fetchAllCustomersForExport(tenantId);
      await runCustomersExport({ customers: allCustomers, nowMs: Date.now() });
      setExportOpen(false);
      if (!isComplete) {
        Alert.alert(
          "Export shared",
          "Your guest list is larger than the export limit — the file holds the most recent guests only."
        );
      }
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

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

      // On a platform with no send path there is nothing to show and nothing
      // to remind anyone about, so the campaign reads never happen — two
      // Supabase round trips on every focus, spent on a list the merchant
      // cannot see.
      if (!canSendSms) return;

      const [rows, lastRuns] = await Promise.all([
        listCampaignRows(tenantId),
        lastRunAtByCampaign(tenantId),
      ]);
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>Customers</Text>
          <TouchableOpacity
            onPress={() => {
              setExportError(null);
              setExportOpen(true);
            }}
            style={styles.exportButton}
            activeOpacity={0.8}
          >
            <Text style={styles.exportButtonText}>Export</Text>
          </TouchableOpacity>
        </View>
        {/*
          Two levels of navigation used to wear the same pill. The switch
          between two halves of a screen is a segmented track; the filters
          below the reach bar are pills. Telling them apart is most of what
          made this screen confusing.

          Absent entirely where sending is impossible: a lone "Campaigns" half
          leading to a surface iOS can never use is the dead end #37 removed.
        */}
        {canSendSms && (
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
        )}
      </View>

      {canSendSms && section === "campaigns" ? (
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

              {/*
                No "use the Android app instead" notice here. Pointing an iOS
                merchant at a surface they cannot reach is the dead end #37
                removed; the list itself is still useful, so it stays.
              */}
              {canSendSms && list.stats.textable === 0 && list.stats.total > 0 && (
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

      <ExportSheet
        visible={isExportOpen}
        title="Export customers"
        isBusy={isExporting}
        errorMessage={exportError}
        showPresets={false}
        onExport={handleExport}
        onClose={() => setExportOpen(false)}
      />
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
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  exportButton: {
    borderColor: colors.separator,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  exportButtonText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
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
