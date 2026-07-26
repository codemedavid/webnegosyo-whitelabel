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
import { useLocalSearchParams } from "expo-router";
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
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import {
  colors,
  typography,
  radius,
  spacing,
  shadow,
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Lead</Text>
      <Text style={styles.title}>{lead.name}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{statusLabel(lead.status)}</Text>

        <Text style={styles.label}>Contact</Text>
        <Text style={styles.value}>{lead.email}</Text>
        <Text style={styles.value}>{lead.phone}</Text>

        <Text style={styles.label}>Booking</Text>
        <Text style={styles.value}>
          {formatBookingSlot(lead.booking_date, lead.booking_time)}
        </Text>

        {lead.source ? (
          <>
            <Text style={styles.label}>Source</Text>
            <Text style={styles.value}>{lead.source}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Move to</Text>
        {isTerminalStatus(lead.status) ? (
          <Text style={styles.muted}>
            This lead is {statusLabel(lead.status).toLowerCase()} — the pipeline
            is closed.
          </Text>
        ) : (
          <View style={styles.buttonRow}>
            {nextStatuses.map((next) => (
              <TouchableOpacity
                key={next}
                style={[
                  styles.statusButton,
                  next === "lost" && styles.statusButtonDanger,
                ]}
                onPress={() => void handleChangeStatus(next)}
                disabled={isBusy}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    next === "lost" && styles.statusButtonTextDanger,
                  ]}
                >
                  {statusLabel(next)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Add a note"
          placeholderTextColor={colors.textTertiary}
          value={draftNote}
          onChangeText={setDraftNote}
          multiline
        />
        <TouchableOpacity
          style={[styles.addNoteButton, isBusy && styles.disabled]}
          onPress={() => void handleAddNote()}
          disabled={isBusy || draftNote.trim() === ""}
          activeOpacity={0.8}
        >
          <Text style={styles.addNoteText}>Add note</Text>
        </TouchableOpacity>

        {notes.length === 0 ? (
          <Text style={styles.muted}>No notes yet.</Text>
        ) : (
          notes.map((note) => (
            <View key={note.id} style={styles.noteRow}>
              <Text style={styles.noteText}>{note.note}</Text>
              {note.created_at ? (
                <Text style={styles.noteDate}>
                  {note.created_at.slice(0, 10)}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.sm,
  },
  label: {
    ...typography.eyebrow,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  value: { ...typography.body, color: colors.textPrimary },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textTertiary },
  buttonRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  statusButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
  },
  statusButtonDanger: { backgroundColor: colors.dangerLight },
  statusButtonText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
  statusButtonTextDanger: { color: colors.danger },
  noteInput: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minHeight: 72,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    marginTop: spacing.sm,
  },
  addNoteButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  disabled: { opacity: 0.6 },
  addNoteText: { color: colors.textOnDark, fontSize: 15, fontWeight: "700" },
  noteRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  noteText: { ...typography.body, color: colors.textPrimary },
  noteDate: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
});
