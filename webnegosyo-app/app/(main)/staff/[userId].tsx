import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { BackHeader } from "../../../components/BackHeader";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { DayHistoryList } from "../../../components/staff/DayHistoryList";
import { ListRow } from "../../../components/ListRow";
import { activityHref } from "../../../lib/activity/activity-links";
import { ShiftHistoryList } from "../../../components/staff/ShiftHistoryList";
import { shiftSalesHref } from "../../../lib/cash-routes";
import { StaffAccessPanel } from "../../../components/staff/StaffAccessPanel";
import { StaffAvatar } from "../../../components/staff/StaffAvatar";
import { StaffStatStrip } from "../../../components/staff/StaffStatStrip";
import { formatPeso } from "../../../lib/format";
import { useManageStaff } from "../../../lib/manage-staff-client";
import { listShifts, type ShiftRecord } from "../../../lib/shift-service";
import {
  canOpenTeam,
  listStaff,
  removeStaff,
  resetStaffPassword,
  updateStaffBranch,
  updateStaffDefaultScreen,
  updateStaffPermissions,
  type StaffMember,
} from "../../../lib/staff-service";
import { listOrderActivity, loadLastSeenAt } from "../../../lib/staff-activity/activity-service";
import { staffPeriodWindow } from "../../../lib/staff-activity/period";
import type { OrderActivityEvent } from "../../../lib/staff-activity/activity";
import {
  buildStaffDirectory,
  groupActivityByDay,
} from "../../../lib/staff-activity/staff-directory";
import { formatClock, formatLastActive, formatShiftLength } from "../../../lib/staff-format";
import { useOutlets } from "../../../lib/use-outlets";
import { useAuthStore } from "../../../stores/auth-store";
import { colors, radius, spacing, typography } from "../../../theme/colors";

/**
 * One person.
 *
 * Everything the store knows about a colleague on one screen: whether they
 * are on the counter right now, what they rang up and handled day by day,
 * every drawer they held and how it reconciled — and, last, the controls that
 * change any of it.
 *
 * Three views rather than one long scroll, because they are three different
 * questions and only one of them is ever being asked. Access is last on
 * purpose: the question that brings an owner here almost never ends in a
 * permission change, and putting Remove at the top of someone's history is a
 * screen that makes firing them the default act.
 */

const PERIODS = [
  { label: "Today", value: 1 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
] as const;

export default function StaffProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  // A tab screen stays mounted for the life of the app, so without a key the
  // second profile opened inherits the first one's period, figures and
  // loading flags — and briefly shows someone else's day under a new name.
  return <StaffProfile key={userId ?? "none"} userId={userId ?? ""} />;
}

function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function StaffProfile({ userId }: { userId: string }) {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const myOutletId = useAuthStore((s) => s.outletId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);

  const invokeManageStaff = useManageStaff();
  const allowed = canOpenTeam({ role, isOwner, permissions, outletId: myOutletId, isDemo });
  const { outlets } = useOutlets();

  const [view, setView] = useState<"activity" | "shifts" | "access">("activity");
  const [days, setDays] = useState<number>(7);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [events, setEvents] = useState<OrderActivityEvent[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped by a pull or a save so "now" — the window's end — moves too.
  const [refreshTick, setRefreshTick] = useState(0);
  // Only the newest read may land: tapping 7 days then Today used to let the
  // slower answer win, so the chip said one period and the figures another.
  const activityRequest = useRef(0);

  const window = useMemo(
    () => staffPeriodWindow(days, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshTick re-reads the clock
    [days, refreshTick],
  );

  const outletName = useCallback(
    (outletId: string | null) =>
      outletId ? outlets.find((o) => o.id === outletId)?.name ?? "Unknown branch" : "Whole store",
    [outlets],
  );

  /** The account itself — read once, and again after a save or a pull. */
  const loadRoster = useCallback(async () => {
    try {
      setLoadError(null);
      setStaff(await listStaff(invokeManageStaff));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load this account");
    } finally {
      setIsLoading(false);
    }
    if (tenantId && !isDemo && userId) {
      // Supporting detail: a failure leaves the hero on the period's own figure.
      setLastSeenAt(await loadLastSeenAt(tenantId, userId).catch(() => null));
    }
  }, [invokeManageStaff, tenantId, isDemo, userId]);

  /** Their record for the chosen period — never re-asks the roster. */
  const loadActivity = useCallback(async () => {
    const request = activityRequest.current + 1;
    activityRequest.current = request;
    if (!tenantId || isDemo || !userId) {
      setIsActivityLoading(false);
      return;
    }
    setIsActivityLoading(true);
    const sinceIso = new Date(window.startMs).toISOString();
    const [shiftResult, activityResult] = await Promise.allSettled([
      listShifts(tenantId, { staffUserId: userId, sinceIso }),
      listOrderActivity(tenantId, { actorUserId: userId, sinceIso }),
    ]);
    if (activityRequest.current !== request) return;

    setShifts(shiftResult.status === "fulfilled" ? shiftResult.value : []);
    setEvents(activityResult.status === "fulfilled" ? activityResult.value : []);
    // A failed read must not pass for a quiet day.
    const failure = [shiftResult, activityResult].find((result) => result.status === "rejected");
    setActivityError(
      failure && failure.status === "rejected"
        ? failure.reason instanceof Error
          ? failure.reason.message
          : "Their activity could not be read."
        : null,
    );
    setIsActivityLoading(false);
  }, [tenantId, isDemo, userId, window.startMs]);

  const reload = useCallback(async () => {
    setRefreshTick((tick) => tick + 1);
    await loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (!allowed) {
      setIsLoading(false);
      return;
    }
    void loadRoster();
  }, [allowed, loadRoster]);

  useEffect(() => {
    if (!allowed) return;
    void loadActivity();
  }, [allowed, loadActivity]);

  const member = staff.find((row) => row.userId === userId) ?? null;

  // The directory builder is what knows how to make a person out of a roster
  // row, an activity summary and a pile of shifts — including the case where
  // the roster row is gone. Reusing it keeps a figure here identical to the
  // same figure on the card that opened this screen.
  const [entry] = useMemo(
    () =>
      buildStaffDirectory({
        members: member ? [member] : [],
        events,
        shifts,
        window,
        nowMs: Date.now(),
      }),
    [member, events, shifts, window],
  );

  const days_ = useMemo(() => groupActivityByDay(events, shifts), [events, shifts]);
  const lastActiveAt = laterOf(entry?.lastActiveAt ?? null, lastSeenAt);

  /** Runs a write, reports failure to the merchant, and refreshes. */
  const run = useCallback(
    (work: () => Promise<void>) => {
      setBusy(true);
      void (async () => {
        try {
          await work();
          await reload();
        } catch (error) {
          Alert.alert(
            "Could not save",
            error instanceof Error ? error.message : "The staff request failed",
          );
        } finally {
          setBusy(false);
        }
      })();
    },
    [reload],
  );

  if (!allowed) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Staff" />
        <EmptyState
          icon="account"
          title="Not your roster"
          message="Only the store owner or a branch admin can open a staff profile."
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Staff" />
        <LoadingState message="Loading this account…" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Staff" />
        <ErrorState title="Couldn't load this account" message={loadError} onRetry={() => void reload()} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Staff" />
        <EmptyState
          icon="account"
          title="No such account"
          message="This person is no longer on your team and left no record in this period."
        />
      </View>
    );
  }

  // A branch admin manages its own branch only. The edge function enforces
  // this on every write; hiding the panel keeps the screen honest about it.
  const canManage = member !== null && !member.isOwner && (isOwner || member.outletId === myOutletId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const periodLabel = PERIODS.find((period) => period.value === days)?.label ?? "this period";

  return (
    <View style={styles.screen}>
      {/* The hero names the person; the header only says where you are. */}
      <BackHeader
        title="Staff"
        subtitle={outlets.length > 0 ? outletName(entry.outletId) : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
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
        <View style={styles.hero}>
          <StaffAvatar name={entry.name} seed={entry.userId} size="lg" />
          <View style={styles.heroCopy}>
            <Text style={styles.heroName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {entry.email ?? "No email on file"}
            </Text>
            {entry.openShift ? (
              <View style={styles.status}>
                <View style={styles.dot} />
                <Text style={styles.statusOn} numberOfLines={1}>
                  On shift since {formatClock(entry.openShift.openedAt)} · float{" "}
                  {formatPeso(entry.openShift.openingFloat)}
                </Text>
              </View>
            ) : (
              <Text style={styles.heroMeta} numberOfLines={1}>
                {entry.isFormer
                  ? "Removed from this store"
                  : lastActiveAt
                    ? `Last active ${formatLastActive(lastActiveAt, nowMs)}`
                    : "No activity yet"}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.pad}>
          <SegmentedControl
            options={PERIODS}
            value={days}
            onChange={setDays}
            accessibilityPrefix="Count"
          />
        </View>

        <StaffStatStrip
          layout="grid"
          stats={[
            {
              label: "Rang up",
              value: formatPeso(entry.activity.posSalesTotal, 0),
              hint: `${entry.activity.posSales} counter sales`,
            },
            {
              label: "Confirmed",
              value: String(entry.activity.confirmed),
              hint: `${formatPeso(entry.activity.confirmedTotal, 0)} of web orders`,
            },
            { label: "Completed", value: String(entry.activity.completed), hint: "Handed over" },
            {
              label: "Cancelled",
              value: String(entry.activity.cancelled),
              tone: entry.activity.cancelled > 0 ? "warning" : "default",
              hint: entry.activity.cancelled === 0 ? "None" : "Worth a look",
            },
            {
              label: "Shifts",
              value: String(entry.shifts.count),
              hint:
                entry.shifts.count === 0
                  ? "No drawer opened"
                  : `${formatShiftLength(entry.shifts.workedMs)} on the floor`,
            },
          ]}
        />

        <View style={styles.pad}>
          <SegmentedControl
            options={[
              { label: "Activity", value: "activity" as const },
              { label: "Shifts", value: "shifts" as const },
              ...(canManage ? [{ label: "Access", value: "access" as const }] : []),
            ]}
            value={view}
            onChange={setView}
            accessibilityPrefix="Show"
          />
        </View>

        <View style={styles.pad}>
          {view !== "access" && activityError ? (
            <ErrorState
              title="Couldn't read their activity"
              message={activityError}
              onRetry={() => void loadActivity()}
            />
          ) : view !== "access" && isActivityLoading ? (
            <LoadingState message={`Loading ${periodLabel.toLowerCase()}…`} />
          ) : view === "activity" ? (
            <>
              <DayHistoryList
                days={days_}
                nowIso={nowIso}
                nowMs={nowMs}
                emptyMessage={
                  lastActiveAt && Date.parse(lastActiveAt) < window.startMs
                    ? `Nothing ${days === 1 ? "today" : "in this period"}. Last active ${formatLastActive(lastActiveAt, nowMs)}.`
                    : undefined
                }
                emptyActionLabel={days < 30 && lastActiveAt ? "Show 30 days" : undefined}
                onEmptyAction={days < 30 && lastActiveAt ? () => setDays(30) : undefined}
              />
              {/* Everything they did — refunds, stock, drawers — in Store activity. */}
              <ListRow
                icon="clock"
                title="See all activity"
                subtitle="Refunds, cancels, stock and drawer changes"
                onPress={() => router.push(activityHref({ actor: { id: entry.userId, name: entry.name } }) as never)}
                style={styles.allActivity}
              />
            </>
          ) : view === "shifts" ? (
            <ShiftHistoryList
              shifts={shifts}
              nowMs={nowMs}
              nowIso={nowIso}
              branchName={outlets.length > 0 ? outletName : undefined}
              onOpenShift={(shiftId) => router.push(shiftSalesHref(shiftId) as never)}
            />
          ) : canManage && member ? (
            <StaffAccessPanel
              member={member}
              outlets={outlets}
              canAssignBranch={isOwner}
              busy={busy}
              onUpdatePermissions={(next) =>
                run(() => updateStaffPermissions(invokeManageStaff, member.userId, next))
              }
              onUpdateBranch={(outletId) =>
                run(() => updateStaffBranch(invokeManageStaff, member.userId, outletId))
              }
              onUpdateDefaultScreen={(tab) =>
                run(() => updateStaffDefaultScreen(invokeManageStaff, member.userId, tab))
              }
              onResetPassword={(password) =>
                run(async () => {
                  await resetStaffPassword(invokeManageStaff, member.userId, password);
                  Alert.alert("Password updated", "Share the new password with your staff member.");
                })
              }
              onRefuseEmptyPermissions={() =>
                Alert.alert(
                  "Keep one permission",
                  "An account needs at least one permission. Remove the account instead.",
                )
              }
              onRemove={() =>
                Alert.alert(
                  "Remove staff account?",
                  `${entry.name} will lose access immediately. This cannot be undone.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () => {
                        setBusy(true);
                        void (async () => {
                          try {
                            await removeStaff(invokeManageStaff, member.userId);
                            router.back();
                          } catch (error) {
                            Alert.alert(
                              "Could not remove",
                              error instanceof Error ? error.message : "The staff request failed",
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      },
                    },
                  ],
                )
              }
            />
          ) : null}
        </View>

        {member === null ? (
          <Text style={styles.footnote}>
            This account has been removed from the store. Their record is kept so past orders and
            shifts stay attributable.
          </Text>
        ) : member.isOwner ? (
          <Text style={styles.footnote}>
            This is the owner account. Its password and details are changed from Account, and its
            access cannot be limited.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  allActivity: { marginTop: spacing.md, borderRadius: radius.lg, overflow: "hidden" },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  pad: { paddingHorizontal: spacing.xl },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
  },
  heroCopy: { flex: 1, gap: 4 },
  heroName: { ...typography.title, fontSize: 20, color: colors.textPrimary },
  heroMeta: { ...typography.caption, color: colors.textSecondary },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  statusOn: { ...typography.caption, fontWeight: "700", color: colors.success },
  footnote: {
    ...typography.small,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xl,
  },
});
