import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../Button";
import { Icon } from "../Icon";
import { SectionHeader } from "../SectionHeader";
import { downloadServerExport } from "../../lib/export/server-export";
import {
  exportToken,
  formatDownloadPath,
  formatPeriodProblem,
  type ExportCatalogue,
  type ExportFormat,
  type ExportPeriod,
  type ExportSavedFormat,
} from "../../lib/export/server-export-api";
import { colors, radius, spacing, typography } from "../../theme/colors";

const FAILED = "The file could not be prepared. Try again in a moment.";

interface Props {
  tenantId: string;
  formats: readonly ExportSavedFormat[];
  period: ExportPeriod;
  catalogue: Pick<ExportCatalogue, "today" | "maxDetailDays">;
}

/**
 * "My formats" (web: my-formats.tsx): reports the store saved from Owl's
 * custom report card, each made again for the dates picked above. The server
 * builds the file as this account; a format this account cannot run says why.
 */
export function ExportFormats({ tenantId, formats, period, catalogue }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; isError: boolean } | null>(null);
  if (formats.length === 0) return null;

  const download = async (saved: ExportSavedFormat, format: ExportFormat) => {
    if (busy) return;
    setBusy(`${saved.id}:${format}`);
    setMessage(null);
    try {
      const name = await downloadServerExport(formatDownloadPath(tenantId, saved, period, format), { getToken: exportToken });
      setMessage({ id: saved.id, text: `${name} is ready.`, isError: false });
    } catch (cause) {
      setMessage({ id: saved.id, text: cause instanceof Error && cause.message ? cause.message : FAILED, isError: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="My formats" hint="Reports you saved, for the dates above" />
      {formats.map((saved) => {
        const problem = saved.lockedNote ?? formatPeriodProblem(period, saved, catalogue);
        return (
          <View key={saved.id} style={styles.card} testID={`export-format-${saved.id}`}>
            <View style={styles.head}>
              {saved.lockedNote ? <Icon name="lock" size={14} color={colors.textTertiary} /> : null}
              <Text style={[styles.name, saved.lockedNote ? styles.locked : null]}>{saved.name}</Text>
            </View>
            <Text style={styles.about}>{saved.summary}</Text>
            {saved.savedBy ? <Text style={styles.about}>Saved by {saved.savedBy}</Text> : null}
            {problem ? (
              <Text style={[styles.about, saved.lockedNote ? null : styles.problem]} accessibilityLiveRegion="polite">
                {problem}
              </Text>
            ) : (
              <View style={styles.actions}>
                <View style={styles.action}>
                  <Button
                    label="Excel"
                    icon="export"
                    onPress={() => void download(saved, "xlsx")}
                    isLoading={busy === `${saved.id}:xlsx`}
                    disabled={busy !== null && busy !== `${saved.id}:xlsx`}
                    accessibilityLabel={`Download ${saved.name} as Excel`}
                    testID={`export-format-${saved.id}-xlsx`}
                  />
                </View>
                <View style={styles.action}>
                  <Button
                    label="CSV"
                    tone="secondary"
                    onPress={() => void download(saved, "csv")}
                    isLoading={busy === `${saved.id}:csv`}
                    disabled={busy !== null && busy !== `${saved.id}:csv`}
                    accessibilityLabel={`Download ${saved.name} as CSV`}
                    testID={`export-format-${saved.id}-csv`}
                  />
                </View>
              </View>
            )}
            {message?.id === saved.id ? (
              <Text style={[styles.status, message.isError && styles.problem]} accessibilityLiveRegion="polite" testID={`export-format-${saved.id}-status`}>
                {message.text}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.separator, padding: spacing.lg, gap: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  locked: { color: colors.textMuted },
  about: { ...typography.caption, color: colors.textMuted },
  problem: { fontWeight: "600", color: colors.danger },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
  status: { ...typography.caption, fontWeight: "600", color: colors.textMuted, marginTop: spacing.xs },
});
