import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { OptionPills } from "../../components/OptionPills";
import { SectionHeader } from "../../components/SectionHeader";
import { ExportDayPicker } from "../../components/export/ExportDayPicker";
import { resourceKey } from "../../lib/backends/query-keys";
import { downloadServerExport } from "../../lib/export/server-export";
import {
  EXPORT_PERIODS,
  activePackId,
  exportDownloadPath,
  exportPeriod,
  exportPeriodProblem,
  exportStartChoice,
  exportToken,
  fetchExportCatalogue,
  fetchExportPreview,
  openCards,
  previewRowsText,
  toggleSheet,
  type ExportCatalogue,
  type ExportFormat,
  type ExportPeriodId,
  type ExportPreview,
  type ExportStartParams,
} from "../../lib/export/server-export-api";
import { canOpenExport } from "../../lib/export/export-routes";
import { useResource } from "../../lib/query/use-resource";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { colors, radius, spacing, typography } from "../../theme/colors";

const RESOURCE = "export-catalogue";
const CATALOGUE_STALE_MS = 5 * 60_000;
const FAILED = "The file could not be prepared. Try again in a moment.";

/**
 * Export: the same files as the web Export page, built by the server as this
 * account. Three steps on one screen — which dates, what to include, check it
 * and download. The catalogue (sheet names, who may have which) is the
 * server's, so nothing here can drift from the web.
 */
export default function ExportScreen() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const ctx = useTabVisibilityContext();
  const isAllowed = canOpenExport({ caller: ctx.caller, isDemo, orderBackend });
  // A report's Export button arrives with its own sheets and dates (`exportHref`).
  const params = useLocalSearchParams<{ sheets?: string; period?: string; from?: string; to?: string; days?: string }>();
  const start: ExportStartParams = { sheets: params.sheets, period: params.period, from: params.from, to: params.to, days: params.days };
  const startKey = [start.sheets, start.period, start.from, start.to, start.days].join("|");

  const fetcher = useCallback(() => fetchExportCatalogue(tenantId as string), [tenantId]);
  const catalogue = useResource<ExportCatalogue>(isAllowed && tenantId ? resourceKey(RESOURCE, tenantId) : null, fetcher, {
    staleTime: CATALOGUE_STALE_MS,
  });

  if (isDemo) {
    return (
      <Frame>
        <EmptyState icon="export" title="No exports in the demo" message="In your own store this makes an Excel or CSV file of your sales, orders, customers and more." inset />
      </Frame>
    );
  }
  if (!isAllowed) {
    return (
      <Frame>
        <EmptyState
          icon="lock"
          title="Export is not on this account"
          message={orderBackend === "platform" ? "You need the Reports permission to export. Ask the store owner." : "This store exports from its Orders, Sales and Customers screens."}
          inset
        />
      </Frame>
    );
  }
  if (catalogue.isLoading) {
    return (
      <Frame>
        <LoadingState message="Getting what you can export…" />
      </Frame>
    );
  }
  if (!catalogue.data || !tenantId) {
    return (
      <Frame>
        <ErrorState title="Export couldn't load" message={catalogue.error ?? "Try again in a moment."} onRetry={() => void catalogue.refetch()} />
      </Frame>
    );
  }
  return (
    <Frame>
      {/* Keyed by the door: the screen stays mounted, and another report's button must start afresh. */}
      <ExportBuilder key={startKey} tenantId={tenantId} catalogue={catalogue.data} start={start} />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <BackHeader title="Export" subtitle="Your figures as an Excel or CSV file" />
      {children}
    </View>
  );
}

interface ExportBuilderProps {
  tenantId: string;
  catalogue: ExportCatalogue;
  start: ExportStartParams;
}

type DayField = "from" | "to";

function ExportBuilder({ tenantId, catalogue, start }: ExportBuilderProps) {
  // Read once: the builder is re-keyed when the door changes.
  const [initial] = useState(() => exportStartChoice(start, catalogue));
  const [preset, setPreset] = useState<ExportPeriodId>(initial.preset);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [dayField, setDayField] = useState<DayField | null>(null);
  const [picked, setPicked] = useState<string[]>(initial.picked);
  const [openCard, setOpenCard] = useState<string | null>(null);
  // A preview belongs to the exact choice it was read for: change anything and it is gone.
  const [preview, setPreview] = useState<{ key: string; value: ExportPreview } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const period = useMemo(() => exportPeriod(preset, from, to), [preset, from, to]);
  const pickedCards = useMemo(() => openCards(catalogue).filter((card) => picked.includes(card.id)), [catalogue, picked]);
  const problem = picked.length === 0 ? "Tick at least one thing to include." : exportPeriodProblem(period, pickedCards, catalogue);
  const choiceKey = `${preset}|${from}|${to}|${picked.join(",")}`;
  const shown = preview?.key === choiceKey ? preview.value : null;
  const packId = activePackId(picked, catalogue.packs);
  const isBusy = isChecking || downloading !== null;

  const check = async () => {
    if (problem || isBusy) return;
    setIsChecking(true);
    setMessage(null);
    try {
      const value = await fetchExportPreview({ tenantId, sheets: picked, period });
      setPreview({ key: choiceKey, value });
    } catch (cause) {
      setMessage({ text: cause instanceof Error && cause.message ? cause.message : FAILED, isError: true });
    } finally {
      setIsChecking(false);
    }
  };

  const download = async (format: ExportFormat) => {
    if (problem || isBusy) return;
    setDownloading(format);
    setMessage(null);
    try {
      const name = await downloadServerExport(exportDownloadPath({ tenantId, sheets: picked, period }, format), { getToken: exportToken });
      setMessage({ text: `${name} is ready.`, isError: false });
    } catch (cause) {
      setMessage({ text: cause instanceof Error && cause.message ? cause.message : FAILED, isError: true });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {catalogue.branchLabel ? <Text style={styles.note}>Every file is for {catalogue.branchLabel} only.</Text> : null}
      {catalogue.isMixedBackend ? (
        <Text style={styles.note}>Files hold orders saved in the main database. Orders your store took on its earlier system are not included.</Text>
      ) : null}

      <SectionHeader title="1 · Which dates" />
      <OptionPills
        options={EXPORT_PERIODS.map((option) => ({ label: option.label, value: option.id }))}
        isSelected={(value) => value === preset}
        onSelect={setPreset}
        accessibilityPrefix="Dates"
      />
      {preset === "custom" ? (
        <View style={styles.days}>
          <DayButton label="From" day={from} onPress={() => setDayField("from")} />
          <DayButton label="To" day={to} onPress={() => setDayField("to")} />
        </View>
      ) : null}

      <SectionHeader title="2 · What to include" hint="Each one is a tab in the file" />
      {catalogue.packs.length > 0 ? (
        <OptionPills
          options={catalogue.packs.map((pack) => ({ label: pack.label, value: pack.id }))}
          isSelected={(value) => value === packId}
          onSelect={(value) => setPicked(catalogue.packs.find((pack) => pack.id === value)?.sheets ?? picked)}
          accessibilityPrefix="Ready-made set"
        />
      ) : null}
      {catalogue.groups.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          <View style={styles.card}>
            {group.cards.map((card, index) => {
              const isOn = picked.includes(card.id);
              const isLocked = card.lockedNote !== null;
              const isOpen = openCard === card.id;
              return (
                <View key={card.id} style={index > 0 ? styles.divided : null}>
                  <View style={styles.sheetRow}>
                    <TouchableOpacity
                      style={styles.tick}
                      onPress={() => setPicked(toggleSheet(picked, card.id, catalogue))}
                      disabled={isLocked}
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isOn, disabled: isLocked }}
                      accessibilityLabel={`${card.name}. One row is ${card.rowIs}.${card.lockedNote ? ` ${card.lockedNote}` : ""}`}
                      testID={`export-sheet-${card.id}`}
                    >
                      <View style={[styles.box, isOn && styles.boxOn, isLocked && styles.boxLocked]}>
                        {isOn ? <Icon name="check" size={14} color={colors.textOnDark} /> : null}
                        {isLocked ? <Icon name="lock" size={12} color={colors.textTertiary} /> : null}
                      </View>
                      <View style={styles.sheetText}>
                        <Text style={[styles.sheetName, isLocked && styles.locked]}>{card.name}</Text>
                        <Text style={styles.sheetAbout}>{card.lockedNote ?? `One row is ${card.rowIs}`}</Text>
                      </View>
                    </TouchableOpacity>
                    {!isLocked && card.columns.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => setOpenCard(isOpen ? null : card.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        accessibilityLabel={`${isOpen ? "Hide" : "Show"} the columns of ${card.name}`}
                      >
                        <Text style={styles.columnsLink}>{isOpen ? "Hide" : "Columns"}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {isOpen ? <Text style={styles.columns}>{card.columns.join(" · ")}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      <SectionHeader title="3 · Check and download" />
      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
      {shown ? (
        <PreviewCard preview={shown} />
      ) : (
        <Button label="See what's inside" icon="report" tone="secondary" size="lg" onPress={() => void check()} isLoading={isChecking} disabled={problem !== null || downloading !== null} testID="export-check" />
      )}
      <Button label="Download Excel" icon="export" size="lg" onPress={() => void download("xlsx")} isLoading={downloading === "xlsx"} disabled={problem !== null || (isBusy && downloading !== "xlsx")} testID="export-download-xlsx" />
      <Button
        label="Download CSV"
        tone="secondary"
        onPress={() => void download("csv")}
        isLoading={downloading === "csv"}
        disabled={problem !== null || (isBusy && downloading !== "csv")}
        accessibilityHint="One CSV file, or a zip with one file per tab"
        testID="export-download-csv"
      />
      {message ? (
        <Text style={[styles.status, message.isError && styles.failed]} accessibilityLiveRegion="polite" testID="export-status">
          {message.text}
        </Text>
      ) : null}

      {dayField ? (
        <ExportDayPicker
          title={dayField === "from" ? "Start day" : "End day"}
          value={dayField === "from" ? from : to}
          today={catalogue.today}
          onPick={dayField === "from" ? setFrom : setTo}
          onClose={() => setDayField(null)}
        />
      ) : null}
    </ScrollView>
  );
}

function DayButton({ label, day, onPress }: { label: string; day: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.day} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${label} ${day}. Change`}>
      <Text style={styles.dayLabel}>{label}</Text>
      <Text style={styles.dayValue}>{day}</Text>
    </TouchableOpacity>
  );
}

function PreviewCard({ preview }: { preview: ExportPreview }) {
  return (
    <View style={styles.card} testID="export-preview">
      <View style={styles.previewHead}>
        <Text style={styles.previewTitle}>{preview.periodLabel}</Text>
        <Text style={styles.sheetAbout}>{preview.branchLabel}</Text>
      </View>
      {preview.sheets.map((sheet) => (
        <View key={sheet.id} style={styles.divided}>
          <View style={styles.previewRow}>
            <Text style={styles.sheetName} numberOfLines={1}>
              {sheet.name}
            </Text>
            <Text style={styles.rows}>{previewRowsText(sheet.rows)}</Text>
          </View>
          {sheet.notes.map((note) => (
            <Text key={note} style={styles.previewNote}>
              {note}
            </Text>
          ))}
        </View>
      ))}
      {preview.leftOut.map((sheet) => (
        <View key={sheet.name} style={styles.divided}>
          <Text style={[styles.sheetName, styles.locked, styles.leftOut]}>{sheet.name} is left out</Text>
          <Text style={styles.previewNote}>{sheet.note}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 3, gap: spacing.md, maxWidth: 720, width: "100%", alignSelf: "center" },
  note: { ...typography.caption, color: colors.textMuted },
  days: { flexDirection: "row", gap: spacing.sm },
  day: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 52, justifyContent: "center" },
  dayLabel: { ...typography.small, fontWeight: "700", color: colors.textMuted },
  dayValue: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  group: { gap: spacing.xs },
  groupLabel: { ...typography.eyebrow, color: colors.textMuted },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.lg },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tick: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textTertiary, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxLocked: { backgroundColor: colors.surfaceSubtle, borderColor: colors.separator },
  sheetText: { flex: 1, gap: 2 },
  sheetName: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  sheetAbout: { ...typography.caption, color: colors.textMuted },
  locked: { color: colors.textMuted },
  columnsLink: { ...typography.caption, fontWeight: "700", color: colors.accent },
  columns: { ...typography.caption, color: colors.textMuted, paddingBottom: spacing.md, paddingLeft: 24 + spacing.md },
  problem: { ...typography.caption, fontWeight: "600", color: colors.danger },
  previewHead: { paddingVertical: spacing.md, gap: 2 },
  previewTitle: { ...typography.heading, color: colors.textPrimary },
  previewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
  rows: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  previewNote: { ...typography.caption, color: colors.textMuted, paddingBottom: spacing.md },
  leftOut: { paddingTop: spacing.md, paddingBottom: 2 },
  status: { ...typography.caption, fontWeight: "600", color: colors.textMuted },
  failed: { color: colors.danger },
});
