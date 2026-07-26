import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
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
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { colors, typography, radius, spacing, shadow } from "../../theme/colors";

const LEAD_COLUMNS =
  "id, name, email, phone, booking_date, booking_time, status, source, converted_tenant_id, created_at";

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

  if (leads === null) return <LoadingState fullScreen message="Loading leads…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <Text style={styles.eyebrow}>Platform</Text>
      <Text style={styles.title}>Leads</Text>

      <View style={styles.statRow}>
        <StatCard value={summary.open} label="Open" />
        <StatCard value={summary.converted} label="Converted" />
        <StatCard value={summary.total} label="Total" />
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search name, email or phone"
        placeholderTextColor={colors.textTertiary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {LEAD_STATUSES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chip, status === s.key && styles.chipActive]}
              onPress={() => setStatus(status === s.key ? undefined : s.key)}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.chipText, status === s.key && styles.chipTextActive]}
              >
                {s.label} ({summary[s.key]})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {visible.length === 0 ? (
        <EmptyState message="No leads match these filters" />
      ) : (
        visible.map((lead) => (
          <TouchableOpacity
            key={lead.id}
            style={styles.card}
            onPress={() => router.push(`/(superadmin)/lead/${lead.id}` as Href)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{lead.name}</Text>
              <Text style={styles.statusText}>
                {LEAD_STATUSES.find((s) => s.key === lead.status)?.label ??
                  lead.status}
              </Text>
            </View>
            <Text style={styles.cardMeta}>{lead.email}</Text>
            <Text style={styles.cardMeta}>{lead.phone}</Text>
            <Text style={styles.cardSlot}>
              {formatBookingSlot(lead.booking_date, lead.booking_time)}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary },
  statRow: { flexDirection: "row", gap: spacing.md },
  search: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: colors.textOnDark },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  cardTitle: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  statusText: { ...typography.small, color: colors.accent, fontWeight: "700" },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  cardSlot: { ...typography.small, color: colors.textTertiary, marginTop: spacing.xs },
});
