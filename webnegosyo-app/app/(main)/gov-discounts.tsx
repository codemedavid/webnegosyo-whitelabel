/**
 * Reports: Senior & PWD, the sales book on the phone.
 *
 * For owners and managers holding `discount_review`. Totals are net of
 * reversals (a grant adds on its day, its reversal subtracts on its own), by
 * kind and by cashier, then "Needs a look" — standing grants with a high or
 * medium flag that nobody has reviewed — then every grant, IDs masked. A tap
 * opens the grant with its flags explained and Mark OK / Mark as problem.
 *
 * Read with the signed-in user's session, so RLS decides the scope (a
 * branch-locked reviewer sees their branch only); bounded by the Manila-day
 * window and paged past the 1000-row cap up to 5,000 rows.
 */
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { canReviewGovDiscounts } from "../../lib/tax-settings/access";
import {
  DEFAULT_GOV_REPORT_PERIOD,
  GOV_REPORT_PERIOD_LABELS,
  GOV_REPORT_PERIODS,
  resolveGovReportPeriod,
  type GovReportPeriodKey,
} from "../../lib/gov-reports/period";
import { MAX_LEDGER_ROWS, submitGovReview } from "../../lib/gov-reports/service";
import type { GrantEntry, ReviewVerdict } from "../../lib/gov-reports/types";
import { useGovReport } from "../../lib/query/use-gov-report";
import { useTaxSettingsCache } from "../../lib/query/use-tax-settings-cache";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SectionHeader } from "../../components/SectionHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { GovKpiGrid } from "../../components/gov-reports/GovKpiGrid";
import { GovGroupList } from "../../components/gov-reports/GovGroupList";
import { GrantRow } from "../../components/gov-reports/GrantRow";
import { GrantDetailSheet } from "../../components/gov-reports/GrantDetailSheet";

const PERIOD_OPTIONS = GOV_REPORT_PERIODS.map((key) => ({ label: GOV_REPORT_PERIOD_LABELS[key], value: key }));
/** Rows drawn at a time; the totals above always cover every row. */
const LEDGER_PAGE = 40;

function GrantList({ grants, onOpen }: { grants: readonly GrantEntry[]; onOpen: (grant: GrantEntry) => void }) {
  return (
    <View style={styles.group}>
      {grants.map((grant, index) => (
        <GrantRow key={grant.id} grant={grant} onPress={onOpen} isLast={index === grants.length - 1} />
      ))}
    </View>
  );
}

export default function GovDiscountsScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const canReview = canReviewGovDiscounts({ role, isOwner, permissions, isDemo });
  const { invalidateReport } = useTaxSettingsCache();

  const [periodKey, setPeriodKey] = useState<GovReportPeriodKey>(DEFAULT_GOV_REPORT_PERIOD);
  const [shown, setShown] = useState(LEDGER_PAGE);
  const [openGrantId, setOpenGrantId] = useState<string | null>(null);
  const period = useMemo(() => resolveGovReportPeriod(periodKey, Date.now()), [periodKey]);
  const query = useGovReport(canReview ? tenantId : null, period);
  const report = query.data?.report ?? null;
  const openGrant = report?.grants.find((grant) => grant.id === openGrantId) ?? null;

  const choosePeriod = (key: GovReportPeriodKey) => {
    setPeriodKey(key);
    setShown(LEDGER_PAGE);
  };

  const handleReview = async (grant: GrantEntry, verdict: ReviewVerdict, note: string | null) => {
    if (!tenantId) return;
    await submitGovReview({ tenantId, claimId: grant.id, verdict, note });
    setOpenGrantId(null);
    await invalidateReport(tenantId);
  };

  const header = (
    <BackHeader title="Senior & PWD" subtitle={canReview ? period.label : "Sales book"} />
  );

  if (!canReview) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          icon="report"
          title="Manager report"
          message="Only the owner, or a manager with the Senior/PWD review permission, can open the sales book."
        />
      </View>
    );
  }

  const body = (() => {
    if (query.isLoading) return <LoadingState message="Reading the sales book" />;
    if (!report) {
      return (
        <ErrorState
          title="Couldn't read the sales book"
          message={query.error ?? "Check your connection and try again."}
          onRetry={() => void query.refetch()}
        />
      );
    }
    if (report.grants.length === 0 && report.totals.sales === 0) {
      return (
        <EmptyState
          icon="report"
          title="No Senior or PWD discounts"
          message={`Nothing was recorded for ${period.label}. Discounts given on the register show up here.`}
          inset
        />
      );
    }
    const visible = report.grants.slice(0, shown);
    return (
      <>
        {query.data?.isTruncated ? (
          <View style={styles.notice} accessibilityRole="alert">
            <Text style={styles.noticeText}>
              More than {MAX_LEDGER_ROWS.toLocaleString("en-PH")} entries in this period — the figures below are
              incomplete. Use the web report for the full sales book.
            </Text>
          </View>
        ) : null}

        <GovKpiGrid totals={report.totals} reversedCount={report.reversedCount} />

        <SectionHeader
          title="Needs a look"
          hint={
            report.needsALook.length > 0
              ? "Flagged and not reviewed yet. Tap one to check it."
              : "Nothing flagged is waiting for you."
          }
          trailing={
            report.needsALook.length > 0 ? (
              <View style={styles.count} accessibilityLabel={`${report.needsALook.length} need a look`}>
                <Text style={styles.countText}>{report.needsALook.length}</Text>
              </View>
            ) : null
          }
        />
        {report.needsALook.length > 0 ? (
          <GrantList grants={report.needsALook} onOpen={(grant) => setOpenGrantId(grant.id)} />
        ) : null}

        <SectionHeader title="By kind" />
        <GovGroupList groups={report.byKind} />

        <SectionHeader title="By cashier" hint="A correction counts against whoever gave the discount." />
        <GovGroupList groups={report.byCashier} />

        <SectionHeader
          title="Every discount"
          hint={`${report.grants.length} given · newest first · IDs masked`}
        />
        <GrantList grants={visible} onOpen={(grant) => setOpenGrantId(grant.id)} />
        {report.grants.length > shown ? (
          <Button
            label={`Show ${Math.min(LEDGER_PAGE, report.grants.length - shown)} more`}
            tone="secondary"
            onPress={() => setShown((count) => count + LEDGER_PAGE)}
            fullWidth
            style={styles.more}
          />
        ) : null}
      </>
    );
  })();

  return (
    <View style={styles.screen}>
      {header}
      <View style={styles.periods}>
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={periodKey}
          onChange={choosePeriod}
          accessibilityPrefix="Show"
        />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {body}
      </ScrollView>
      <GrantDetailSheet
        key={openGrant?.id ?? "none"}
        grant={openGrant}
        tenantId={tenantId}
        photoId={openGrant ? query.data?.photoIdByGrant[openGrant.id] ?? null : null}
        onClose={() => setOpenGrantId(null)}
        onSubmitReview={handleReview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  periods: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxl * 2 },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  notice: {
    backgroundColor: colors.statusPending.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.statusPending.text, fontWeight: "600" },
  count: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  countText: { ...typography.caption, fontWeight: "800", color: colors.textOnDark },
  more: { marginTop: spacing.md },
});
