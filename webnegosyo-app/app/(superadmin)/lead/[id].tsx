import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/auth-store";
import {
  LEAD_STATUSES,
  allowedNextStatuses,
  formatBookingSlot,
  isTerminalStatus,
  type LeadRow,
  type LeadStatus,
} from "../../../lib/leads";
import { leadStatusTone, pluralize } from "../../../lib/superadmin-ui";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { ScreenHeader } from "../../../components/superadmin/ScreenHeader";
import { Pill } from "../../../components/superadmin/Pill";
import {
  colors,
  radius,
  shadow,
  spacing,
  typography,
} from "../../../theme/colors";

const LEAD_COLUMNS =
  "id, name, email, phone, booking_date, booking_time, status, source, converted_tenant_id, created_at";

interface LeadNote {
  id: string;
  note: string;
  created_at: string | null;
}

function statusLabel(status: string): string {
  return LEAD_STATUSES.find((s) => s.key === status)?.label ?? status;
}

/** Label/value pair inside the detail card. */
function DetailRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !isLast && styles.detailRowDivided]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>
        {value}
      </Text>
    </View>
  );
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.userId);
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("id", id)
      .single();

    if (queryError || !data) {
      setError(queryError?.message ?? "Lead not found");
      return;
    }
    setError(null);
    setLead(data as LeadRow);

    const { data: noteRows } = await supabase
      .from("lead_notes")
      .select("id, note, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });
    setNotes((noteRows ?? []) as LeadNote[]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChangeStatus = async (next: LeadStatus) => {
    if (!lead) return;
    setIsBusy(true);

    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: next })
      .eq("id", lead.id);

    if (updateError) {
      setIsBusy(false);
      Alert.alert("Could not update", updateError.message);
      return;
    }

    // Best-effort audit trail; a history failure must not lose the status move
    // the superadmin already made.
    const { error: historyError } = await supabase
      .from("lead_status_history")
      .insert({
        lead_id: lead.id,
        old_status: lead.status,
        new_status: next,
        changed_by: userId,
      });
    if (historyError) {
      console.warn("[leads] status history insert failed", historyError.message);
    }

    setIsBusy(false);
    await load();
  };

  const handleAddNote = async () => {
    const note = draftNote.trim();
    if (!lead || note === "") return;

    setIsBusy(true);
    const { error: insertError } = await supabase
      .from("lead_notes")
      .insert({ lead_id: lead.id, note, created_by: userId });
    setIsBusy(false);

    if (insertError) {
      Alert.alert("Could not save note", insertError.message);
      return;
    }
    setDraftNote("");
    await load();
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!lead) return <LoadingState fullScreen message="Loading lead…" />;

  const nextStatuses = allowedNextStatuses(lead.status);
  const canSubmitNote = !isBusy && draftNote.trim() !== "";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        title={lead.name}
        subtitle={formatBookingSlot(lead.booking_date, lead.booking_time)}
        onBack={() => router.back()}
        backLabel="Leads"
        right={
          <Pill label={statusLabel(lead.status)} tone={leadStatusTone(lead.status)} />
        }
      />

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <View style={styles.card}>
          <DetailRow label="Email" value={lead.email} />
          <DetailRow label="Phone" value={lead.phone} />
          <DetailRow
            label="Booking"
            value={formatBookingSlot(lead.booking_date, lead.booking_time)}
            isLast={!lead.source}
          />
          {lead.source ? (
            <DetailRow label="Source" value={lead.source} isLast />
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Pipeline</Text>
        {isTerminalStatus(lead.status) ? (
          <View style={styles.terminalCard}>
            <Text style={styles.terminalText}>
              This lead is {statusLabel(lead.status).toLowerCase()} — the pipeline
              is closed.
            </Text>
          </View>
        ) : (
          <View style={styles.buttonRow}>
            {nextStatuses.map((next) => (
              <TouchableOpacity
                key={next}
                style={[
                  styles.statusButton,
                  next === "lost" && styles.statusButtonDanger,
                  isBusy && styles.disabled,
                ]}
                onPress={() => void handleChangeStatus(next)}
                disabled={isBusy}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    next === "lost" && styles.statusButtonTextDanger,
                  ]}
                >
                  {next === "lost" ? "Mark lost" : `→ ${statusLabel(next)}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          {notes.length > 0 ? pluralize(notes.length, "note") : "Notes"}
        </Text>
        <View style={styles.card}>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note…"
            placeholderTextColor={colors.textTertiary}
            value={draftNote}
            onChangeText={setDraftNote}
            multiline
          />
          <TouchableOpacity
            style={[styles.addNoteButton, !canSubmitNote && styles.disabled]}
            onPress={() => void handleAddNote()}
            disabled={!canSubmitNote}
            activeOpacity={0.85}
          >
            <Text style={styles.addNoteText}>Add note</Text>
          </TouchableOpacity>
        </View>

        {notes.length === 0 ? (
          <Text style={styles.muted}>No notes yet.</Text>
        ) : (
          <View style={styles.card}>
            {notes.map((note, index) => (
              <View
                key={note.id}
                style={[styles.noteRow, index > 0 && styles.noteRowDivided]}
              >
                <Text style={styles.noteText}>{note.note}</Text>
                {note.created_at ? (
                  <Text style={styles.noteDate}>{note.created_at.slice(0, 10)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl * 2 },
  body: { padding: spacing.lg, gap: spacing.sm },

  sectionTitle: {
    ...typography.eyebrow,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  detailRow: { paddingVertical: spacing.md, gap: 2 },
  detailRowDivided: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  detailLabel: { ...typography.small, color: colors.textTertiary, fontWeight: "700" },
  detailValue: { ...typography.body, color: colors.textPrimary },

  terminalCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  terminalText: { ...typography.caption, color: colors.textSecondary },

  buttonRow: { flexDirection: "row", gap: spacing.sm },
  statusButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: "center",
  },
  statusButtonDanger: {
    backgroundColor: colors.dangerLight,
  },
  statusButtonText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
  statusButtonTextDanger: { color: colors.danger },
  disabled: { opacity: 0.5 },

  noteInput: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 76,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    marginTop: spacing.lg,
    textAlignVertical: "top",
  },
  addNoteButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  addNoteText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },

  muted: { ...typography.caption, color: colors.textTertiary, paddingVertical: spacing.sm },
  noteRow: { paddingVertical: spacing.md, gap: 2 },
  noteRowDivided: { borderTopWidth: 1, borderTopColor: colors.separator },
  noteText: { ...typography.body, color: colors.textPrimary },
  noteDate: { ...typography.small, color: colors.textTertiary },
});
