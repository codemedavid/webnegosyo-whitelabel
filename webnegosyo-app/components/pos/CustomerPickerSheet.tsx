import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import {
  listCustomers,
  createCustomer,
  DuplicateCustomerError,
  type CustomerRecord,
} from "../../lib/customers/repo";
import { draftFromSearch, validateCustomerDraft } from "../../lib/customers/validation";
import type { AttachedCustomer } from "../../lib/customers/pos-attachment";

interface CustomerPickerSheetProps {
  visible: boolean;
  tenantId: string;
  onCancel: () => void;
  /** Null means the cashier chose "walk-in" — the sale belongs to nobody. */
  onPick: (customer: AttachedCustomer | null) => void;
}

function toAttached(record: CustomerRecord): AttachedCustomer {
  return {
    id: record.id,
    name: record.name,
    phoneE164: record.phoneE164,
    email: record.email,
  };
}

/** The line under a guest's name: their number, or their email, or nothing. */
function subtitleFor(record: CustomerRecord): string {
  return record.phoneE164 ?? record.email ?? "";
}

/**
 * Pick the guest a counter sale belongs to.
 *
 * Three ways out, in the order a cashier reaches for them: find someone who
 * already exists, save the number they just read out as a new guest, or say
 * explicitly that this is a walk-in. The last one matters — an anonymous sale
 * is the common case, and the cashier must be able to say so in one tap rather
 * than by abandoning the sheet.
 *
 * Quick-create sends only what was typed. A guest saved from the counter has a
 * number and nothing else, which is enough to be found again; the rest can be
 * filled in later from the customer screen.
 */
export function CustomerPickerSheet({
  visible,
  tenantId,
  onCancel,
  onPick,
}: CustomerPickerSheetProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(query);

  // Reset between openings: the previous sale's search left on screen would
  // invite the cashier to attach the previous customer to this one.
  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setResults([]);
    setError(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || !tenantId) return;
    let cancelled = false;

    setIsSearching(true);
    listCustomers(tenantId, { search: debouncedQuery, limit: 20 })
      .then((rows) => {
        if (!cancelled) setResults(rows);
      })
      .catch(() => {
        // A failed search shows an empty list with a message rather than
        // pretending the store has no customers.
        if (!cancelled) {
          setResults([]);
          setError("Could not search customers. Check your connection.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, tenantId, debouncedQuery]);

  const handleQuickCreate = useCallback(async () => {
    const draft = draftFromSearch(query);
    if (!draft || isSaving) return;

    const validated = validateCustomerDraft(draft);
    if (!validated.ok) {
      setError(
        validated.errors.form ??
          validated.errors.phone ??
          validated.errors.email ??
          validated.errors.name ??
          "That guest could not be saved.",
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const created = await createCustomer(tenantId, validated.value);
      onPick(toAttached(created));
    } catch (err) {
      // A duplicate is not a failure worth blocking on: the guest exists, so
      // say so and let the search that is already on screen find them.
      setError(
        err instanceof DuplicateCustomerError
          ? "That number is already saved — search for it above."
          : "Could not save that guest. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [query, isSaving, tenantId, onPick]);

  const quickCreateDraft = draftFromSearch(query);
  const canQuickCreate = quickCreateDraft !== null && !isSearching && results.length === 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Who is this for?</Text>
            <TouchableOpacity onPress={onCancel} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.search}
            placeholder="Search name or number"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="words"
          />

          <TouchableOpacity
            style={styles.walkIn}
            onPress={() => onPick(null)}
            accessibilityRole="button"
          >
            <Text style={styles.walkInText}>Walk-in — no customer</Text>
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}

          {isSearching ? (
            <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onPick(toAttached(item))}
                  accessibilityRole="button"
                >
                  <Text style={styles.rowName}>{item.name ?? subtitleFor(item)}</Text>
                  {item.name !== null && subtitleFor(item) !== "" && (
                    <Text style={styles.rowSubtitle}>{subtitleFor(item)}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                canQuickCreate ? null : (
                  <Text style={styles.empty}>
                    {query.trim() === ""
                      ? "No customers yet."
                      : "Nobody matches that."}
                  </Text>
                )
              }
            />
          )}

          {canQuickCreate && (
            <TouchableOpacity
              style={styles.create}
              onPress={handleQuickCreate}
              disabled={isSaving}
              accessibilityRole="button"
            >
              <Text style={styles.createText}>
                {isSaving ? "Saving…" : `Save "${query.trim()}" as a new guest`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  cancel: { ...typography.body, color: colors.textSecondary },
  search: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  walkIn: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  walkInText: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  spinner: { marginTop: spacing.lg },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowName: { ...typography.body, color: colors.textPrimary },
  rowSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  empty: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  create: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  createText: { ...typography.body, color: colors.card, fontWeight: "600" },
});
