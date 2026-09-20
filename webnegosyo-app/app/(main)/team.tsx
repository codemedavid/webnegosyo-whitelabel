import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { AddStaffSheet, type NewStaffDraft } from "../../components/staff/AddStaffSheet";
import { StaffCard } from "../../components/staff/StaffCard";
import { StaffSalesLeaderboard } from "../../components/staff/StaffSalesLeaderboard";
import { StaffStatStrip } from "../../components/staff/StaffStatStrip";
import { formatPeso } from "../../lib/format";
import { useManageStaff } from "../../lib/manage-staff-client";
import { listShifts, type ShiftRecord } from "../../lib/shift-service";
import { canOpenTeam, createStaff, listStaff, type StaffMember } from "../../lib/staff-service";
import { isTabAllowed } from "../../lib/staff-permissions";
import { listOrderActivity } from "../../lib/staff-activity/activity-service";
import type { OrderActivityEvent } from "../../lib/staff-activity/activity";
import {
  buildStaffDirectory,
  summarizeTeam,
} from "../../lib/staff-activity/staff-directory";
import { formatShiftLength } from "../../lib/staff-format";
import { useOutlets } from "../../lib/use-outlets";
import { useAuthStore } from "../../stores/auth-store";
import { colors, radius, spacing, typography } from "../../theme/colors";

/**
 * The team, as people you can walk up to.
 *
 * This screen used to be a roster of expandable rows: every account's
 * permissions, branch, pinned screen and password reset lived inside the list,
 * so scrolling past four colleagues meant scrolling past forty switches, and
 * nothing on it answered the question an owner actually opens it with — who
 * is on the counter right now, and what did they do today.
 *
 * Now the roster IS the report. Each card carries that person's own figures
 * and opens their screen, where their shifts, their day-by-day history and
 * everything that can be changed about their account live together.
 *
 * Every write still goes through the manage-staff edge function
 * (lib/staff-service.ts via lib/manage-staff-client.ts) — the phone never
 * holds the service-role key, and the server re-derives the caller's tenant
 * and authority from the JWT, so this screen is presentation only.
 */

const PERIODS = [
  { label: "Today", value: 1 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
] as const;

const VIEWS = [
  { label: "Team", value: "team" as const },
  { label: "Sales", value: "sales" as const },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export default function TeamScreen() {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const myOutletId = useAuthStore((s) => s.outletId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const myUserId = useAuthStore((s) => s.userId);
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);

  const invokeManageStaff = useManageStaff();
  const allowed = canOpenTeam({ role, isOwner, permissions, outletId: myOutletId, isDemo });
  const canSeeSales = isTabAllowed({ role, isOwner, permissions }, "analytics");

  const { outlets } = useOutlets();
  const [view, setView] = useState<"team" | "sales">("team");
  const [days, setDays] = useState<number>(7);
  const [query, setQuery] = useState("");
  const [showFormer, setShowFormer] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [events, setEvents] = useState<OrderActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const outletName = useCallback(
    (outletId: string | null) =>
      outletId ? outlets.find((o) => o.id === outletId)?.name ?? "Unknown branch" : "Whole store",
    [outlets],
  );

  const nowMs = Date.now();
  const window = useMemo(
    () => ({ startMs: Date.now() - days * DAY_MS, endMs: Date.now() }),
    [days],
  );

  const reload = useCallback(async () => {
    try {
      setLoadError(null);
      const roster = await listStaff(invokeManageStaff);
      setStaff(roster);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load your team");
      setIsLoading(false);
      return;
    }

    // Shifts and activity are supporting detail: a store whose log cannot be
    // read still gets a roster it can manage, rather than an error screen.
    const sinceIso = new Date(window.startMs).toISOString();
    const outletId = isOwner ? undefined : myOutletId ?? undefined;
    if (tenantId && !isDemo) {
      const [shiftRows, activityRows] = await Promise.all([
        listShifts(tenantId, { outletId, sinceIso }).catch(() => [] as ShiftRecord[]),
        listOrderActivity(tenantId, { outletId, sinceIso }).catch(() => [] as OrderActivityEvent[]),
      ]);
      setShifts(shiftRows);
      setEvents(activityRows);
    }
    setIsLoading(false);
  }, [invokeManageStaff, tenantId, isDemo, isOwner, myOutletId, window.startMs]);

  useEffect(() => {
    if (!allowed) {
      setIsLoading(false);
      return;
    }
    void reload();
  }, [allowed, reload]);

  const entries = useMemo(
    () => buildStaffDirectory({ members: staff, events, shifts, window, nowMs: Date.now() }),
    [staff, events, shifts, window],
  );
  const stats = useMemo(() => summarizeTeam(entries), [entries]);
  const formerCount = entries.filter((entry) => entry.isFormer).length;
  const visible = entries.filter((entry) => {
    if (entry.isFormer !== showFormer) return false;
    if (query.trim() === "") return true;
    const needle = query.trim().toLowerCase();
    return (
      entry.name.toLowerCase().includes(needle) ||
      (entry.email ?? "").toLowerCase().includes(needle)
    );
  });

  const handleCreate = (draft: NewStaffDraft) => {
    setBusy(true);
    void (async () => {
      try {
        await createStaff(invokeManageStaff, {
          ...draft,
          // A branch admin may only fill its own branch; the server enforces
          // this too, so the lock here is honesty, not the boundary.
          outletId: isOwner ? draft.outletId : myOutletId,
        });
        setIsAddOpen(false);
        await reload();
      } catch (error) {
        Alert.alert(
          "Could not add them",
          error instanceof Error ? error.message : "The staff request failed",
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  if (!allowed) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Team" />
        <EmptyState
          icon="account"
          title="Not your roster"
          message="Only the store owner or a branch admin can manage staff."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <BackHeader
        title="Team"
        subtitle={isOwner ? "Who works here, and what each of them did" : `Staff for ${outletName(myOutletId)}`}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          // Its own flag, not `isLoading`: a pull must spin the control, never
          // replace the list the merchant is looking at with a loader.
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              void reload().finally(() => setIsRefreshing(false));
            }}
            tintColor={colors.accent}
          />
        }
      >
        {canSeeSales ? (
          <View style={styles.pad}>
            <SegmentedControl
              options={VIEWS}
              value={view}
              onChange={setView}
              accessibilityPrefix="Show"
            />
          </View>
        ) : null}

        {view === "sales" && canSeeSales ? (
          <View style={styles.pad}>
            <StaffSalesLeaderboard staff={staff} />
          </View>
        ) : isLoading ? (
          <LoadingState message="Loading your team…" />
        ) : loadError ? (
          <ErrorState title="Couldn't load your team" message={loadError} onRetry={() => void reload()} />
        ) : (
          <>
            <View style={styles.pad}>
              <SegmentedControl
                options={PERIODS}
                value={days}
                onChange={setDays}
                accessibilityPrefix="Count"
              />
            </View>

            <StaffStatStrip
              stats={[
                { label: "Team", value: String(stats.headcount), hint: `${formerCount} past` },
                {
                  label: "On shift",
                  value: String(stats.onShift),
                  tone: stats.onShift > 0 ? "positive" : "default",
                  hint: stats.onShift === 0 ? "No drawer open" : "Drawer open now",
                },
                {
                  label: "Rang up",
                  value: formatPeso(stats.posSalesTotal, 0),
                  hint: `${stats.posSales} counter sales`,
                },
                {
                  label: "Handled",
                  value: String(stats.ordersHandled),
                  tone: stats.cancelled > 0 ? "warning" : "default",
                  hint: stats.cancelled === 0 ? "None cancelled" : `${stats.cancelled} cancelled`,
                },
                {
                  label: "Variance",
                  value: stats.netVariance === null ? "—" : formatPeso(stats.netVariance, 0),
                  tone: stats.netVariance !== null && stats.netVariance !== 0 ? "warning" : "default",
                  hint:
                    stats.netVariance === null
                      ? "No drawer counted"
                      : `${formatShiftLength(stats.workedMs)} on the floor`,
                },
              ]}
            />

            <View style={styles.pad}>
              <TextInput
                style={styles.search}
                placeholder="Search by name or email"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Search staff"
                autoCapitalize="none"
                value={query}
                onChangeText={setQuery}
              />
            </View>

            <View style={[styles.pad, styles.actions]}>
              <Button
                label="Add staff"
                icon="plus"
                size="sm"
                onPress={() => setIsAddOpen(true)}
                disabled={busy}
              />
              {formerCount > 0 ? (
                <Button
                  label={showFormer ? "Current staff" : `Past staff (${formerCount})`}
                  tone="ghost"
                  size="sm"
                  onPress={() => setShowFormer((current) => !current)}
                />
              ) : null}
            </View>

            <View style={[styles.pad, styles.list]}>
              {visible.length === 0 ? (
                <EmptyState
                  icon="account"
                  title={query.trim() === "" ? "Nobody here yet" : "No one matches that search"}
                  message={
                    query.trim() === ""
                      ? showFormer
                        ? "Nobody has left this store yet."
                        : "Add an account so your staff can ring up sales and take orders."
                      : undefined
                  }
                  inset
                />
              ) : (
                visible.map((entry) => (
                  <StaffCard
                    key={entry.userId}
                    entry={entry}
                    branchName={outlets.length > 0 ? outletName(entry.outletId) : undefined}
                    isSelf={entry.userId === myUserId}
                    nowMs={nowMs}
                    onPress={() => router.push(`/(main)/staff/${entry.userId}`)}
                  />
                ))
              )}
            </View>

            <Text style={styles.footnote}>
              Counter sales are credited to whoever rang them up. Web orders count as work handled,
              never as drawer cash.
            </Text>
          </>
        )}
      </ScrollView>

      <AddStaffSheet
        visible={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={handleCreate}
        busy={busy}
        outlets={outlets}
        canAssignBranch={isOwner}
        branchName={outletName(myOutletId)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  pad: { paddingHorizontal: spacing.xl },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  list: { gap: spacing.sm },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.card,
  },
  footnote: {
    ...typography.small,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
});
