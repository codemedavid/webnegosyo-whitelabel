import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { router, type Href } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  LEAD_STATUSES,
  filterLeads,
  formatBookingSlot,
  summarizeLeads,
  type LeadRow,
  type LeadStatus,
} from "../../lib/leads";
import { leadStatusTone, pluralize } from "../../lib/superadmin-ui";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/superadmin/ScreenHeader";
import { SearchField } from "../../components/superadmin/SearchField";
import { FilterChips } from "../../components/superadmin/FilterChips";
import { Monogram } from "../../components/superadmin/Monogram";
import { Pill } from "../../components/superadmin/Pill";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

const LEAD_COLUMNS =
  "id, name, email, phone, booking_date, booking_time, status, source, converted_tenant_id, created_at";

function statusLabel(status: string): string {
  return LEAD_STATUSES.find((s) => s.key === status)?.label ?? status;
}

export default function LeadsScreen() {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | undefined>();

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("leads")
      .select(LEAD_COLUMNS)
      .order("created_at", { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLeads([]);
      return;
    }
    setError(null);
    setLeads((data ?? []) as LeadRow[]);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const visible = useMemo(
    () => filterLeads(leads ?? [], { query, status }),
    [leads, query, status]
  );
  const summary = useMemo(() => summarizeLeads(leads ?? []), [leads]);

  const statusOptions = useMemo(
    () => LEAD_STATUSES.map((s) => ({ ...s, count: summary[s.key] })),
    [summary]
  );

  if (leads === null) return <LoadingState fullScreen message="Loading leads…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const isFiltered = query !== "" || status !== undefined;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <ScreenHeader
        eyebrow="Platform"
        title="Leads"
        subtitle={
          isFiltered
            ? `${visible.length} of ${summary.total} shown`
            : pluralize(summary.total, "lead")
        }
      >
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>{summary.open}</Text>
            <Text style={styles.heroLabel}>Open</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>{summary.converted}</Text>
            <Text style={styles.heroLabel}>Converted</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>{summary.lost}</Text>
            <Text style={styles.heroLabel}>Lost</Text>
          </View>
        </View>
      </ScreenHeader>

      <View style={styles.body}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, email or phone"
        />

        <FilterChips
          caption="Pipeline"
          options={statusOptions}
          selected={status}
          onSelect={(key) => setStatus(status === key ? undefined : key)}
        />

        {visible.length === 0 ? (
          <EmptyState message="No leads match these filters" />
        ) : (
          visible.map((lead) => (
            <TouchableOpacity
              key={lead.id}
              style={styles.card}
              onPress={() => router.push(`/(superadmin)/lead/${lead.id}` as Href)}
              activeOpacity={0.75}
            >
              <View style={styles.cardHeader}>
                <Monogram name={lead.name} seed={lead.id} size={40} />
                <View style={styles.cardHeading}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {lead.name}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {lead.email}
                  </Text>
                </View>
                <Pill
                  label={statusLabel(lead.status)}
                  tone={leadStatusTone(lead.status)}
                />
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.cardSlot} numberOfLines={1}>
                  ◷ {formatBookingSlot(lead.booking_date, lead.booking_time)}
                </Text>
                <Text style={styles.cardPhone}>{lead.phone}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl * 2 },
  body: { padding: spacing.lg, gap: spacing.md },

  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  heroStat: { flex: 1, alignItems: "center", gap: 1 },
  heroValue: { fontSize: 22, fontWeight: "800", color: colors.heroInkText },
  heroLabel: { ...typography.small, color: colors.heroInkMuted },
  heroDivider: {
    width: 1,
    height: 26,
    backgroundColor: "rgba(253,251,247,0.14)",
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardHeading: { flex: 1, gap: 1 },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.sm,
  },
  cardSlot: { ...typography.small, color: colors.textSecondary, flex: 1 },
  cardPhone: { ...typography.small, color: colors.textTertiary },
});
