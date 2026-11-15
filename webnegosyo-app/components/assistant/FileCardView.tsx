import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../theme/colors";
import { assistantToken } from "../../lib/assistant/api";
import { downloadServerExport, isServerExportPath } from "../../lib/export/server-export";
import { formatDownloadPath, saveExportFormat } from "../../lib/export/server-export-api";
import type { FileCard } from "../../lib/assistant/types";

type Props = { card: FileCard };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const SHEET_ID = /^[a-z][a-z0-9_]{0,39}$/;

/** The file of a just-saved layout, for the dates Owl previewed it with. Every part is checked: the card is stored history. */
function savedLayoutDownloads(save: FileCard["save"] | null, id: string | null): FileCard["downloads"] {
  if (!save || save.kind !== "format" || !id) return [];
  const sheets = Array.isArray(save.sheets) ? save.sheets.filter((sheet) => typeof sheet === "string" && SHEET_ID.test(sheet)) : [];
  const from = save.period?.from;
  const to = save.period?.to;
  if (sheets.length === 0 || typeof from !== "string" || typeof to !== "string" || !DAY_KEY.test(from) || !DAY_KEY.test(to)) return [];
  const path = (format: "xlsx" | "csv") => formatDownloadPath(save.tenantId, { id, sheets }, { preset: "custom", from, to }, format, "owl");
  return [
    { label: "Download Excel", href: path("xlsx") },
    { label: "CSV", href: path("csv") },
  ];
}

function rowsText(rows: number | null): string {
  if (rows === null) return "counted in the file";
  return `${rows.toLocaleString("en-PH")} ${rows === 1 ? "row" : "rows"}`;
}

/**
 * A file Owl prepared (web: file-card.tsx). Tapping a button downloads it
 * from the server as this account and opens the share sheet.
 */
export function FileCardView({ card }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  // A card comes back from stored history: offer Save only when its parts are there.
  const save = card.save && typeof card.save.tenantId === "string" && typeof card.save.name === "string" && typeof card.save.spec === "object" && card.save.spec !== null ? card.save : null;
  const isLayout = save?.kind === "format";
  const cardDownloads = (Array.isArray(card.downloads) ? card.downloads : []).filter((download) => isServerExportPath(download.href));
  // A layout Owl has just matched has no file until it is saved: the file for its dates is offered after the tap.
  const downloads = cardDownloads.length > 0 ? cardDownloads : savedLayoutDownloads(save, savedId);
  if (downloads.length === 0 && !save) return null;
  const sheets = Array.isArray(card.sheets) ? card.sheets : [];
  const notes = Array.isArray(card.notes) ? card.notes : [];

  const download = async (href: string) => {
    if (busy) return;
    setBusy(href);
    setError(null);
    try {
      await downloadServerExport(href, { getToken: assistantToken });
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "The file could not be prepared. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const keep = async () => {
    if (!save || saving !== "idle" || busy) return;
    setSaving("saving");
    setError(null);
    try {
      setSavedId(await saveExportFormat(save));
      setSaving("saved");
    } catch (cause) {
      setSaving("idle");
      setError(cause instanceof Error && cause.message ? cause.message : "That could not be saved. Try again in a moment.");
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{card.title}</Text>
      <Text style={styles.subtitle}>{card.subtitle}</Text>
      {sheets.map((sheet, index) => (
        <View key={`${index}:${sheet.name}`} style={styles.row}>
          <Text style={styles.sheet} numberOfLines={1}>
            {sheet.name}
          </Text>
          <Text style={styles.rows}>{rowsText(sheet.rows)}</Text>
        </View>
      ))}
      {notes.map((note, index) => (
        <Text key={index} style={styles.note}>
          {note}
        </Text>
      ))}
      {downloads.length > 0 ? (
        <View style={styles.actions}>
          {downloads.map((item, index) => (
            <Pressable
              key={item.href}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ busy: busy === item.href, disabled: busy !== null }}
              disabled={busy !== null}
              onPress={() => void download(item.href)}
              style={[index === 0 ? styles.primary : styles.secondary, busy !== null && styles.dimmed]}
              hitSlop={6}
            >
              {busy === item.href ? <ActivityIndicator size="small" color={index === 0 ? colors.card : colors.textPrimary} /> : null}
              <Text style={index === 0 ? styles.primaryText : styles.secondaryText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {save && saving === "saved" ? (
        <Text style={styles.saved} accessibilityLiveRegion="polite">
          Saved as “{save.name}”. Find it under My formats in Export.
        </Text>
      ) : save ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLayout ? "Save this format" : "Save to My formats"}
          accessibilityState={{ busy: saving === "saving", disabled: saving === "saving" || busy !== null }}
          disabled={saving === "saving" || busy !== null}
          onPress={() => void keep()}
          style={[styles.keep, (saving === "saving" || busy !== null) && styles.dimmed]}
          hitSlop={6}
        >
          {saving === "saving" ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
          <Text style={styles.secondaryText}>{saving === "saving" ? "Saving…" : isLayout ? "Save this format" : "Save to My formats"}</Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, padding: 16, gap: 6 },
  title: { fontSize: 14, fontWeight: "800", letterSpacing: -0.1, color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  sheet: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  rows: { fontSize: 12, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
  note: { fontSize: 12, color: colors.textSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  primary: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, backgroundColor: colors.textPrimary, borderRadius: radius.full, paddingHorizontal: 18 },
  primaryText: { fontSize: 14, fontWeight: "700", color: colors.card },
  secondary: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12 },
  secondaryText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  keep: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, minHeight: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: 14, marginTop: 4 },
  saved: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 4 },
  dimmed: { opacity: 0.6 },
  error: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
