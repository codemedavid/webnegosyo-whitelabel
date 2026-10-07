import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Modal } from "../Modal";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { centeredDialog, useCenteredDialog } from "./dialog-layout";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { DuplicateCustomerError } from "../../lib/customers/repo";
import {
  createAttachableCustomer,
  findAttachableCustomers,
  type AttachableCustomer,
} from "../../lib/customers/attach-lookup";
import { hasPermission } from "../../lib/staff-permissions";
import { useAuthStore } from "../../stores/auth-store";
import { draftFromSearch, validateCustomerDraft } from "../../lib/customers/validation";
import type { AttachedCustomer } from "../../lib/customers/pos-attachment";
import {
  attachFailureDetail,
  describeAttachFailure,
  describeScanFailure,
  identifyWalletCard,
  resolveScannedCustomer,
} from "../../lib/loyalty/wallet-card";
import { MemberCardScanner } from "./MemberCardScanner";

interface CustomerPickerSheetProps {
  visible: boolean;
  tenantId: string;
  onCancel: () => void;
  /** Null means the cashier chose "walk-in" — the sale belongs to nobody. */
  onPick: (customer: AttachedCustomer | null) => void;
}

/** The line under a guest's name: their number, or their email, or nothing. */
function subtitleFor(record: AttachableCustomer): string {
  return record.phoneE164 ?? record.email ?? "";
}

/** What an empty result list says — a cashier without the grant cannot browse. */
function emptyMessage(query: string, canBrowse: boolean): string {
  if (query.trim() !== "") return "Nobody matches that.";
  return canBrowse ? "No customers yet." : "Type the guest's full number or email to find them.";
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
  const [results, setResults] = useState<AttachableCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isResolvingCard, setIsResolvingCard] = useState(false);

  const debouncedQuery = useDebouncedValue(query);

  // The guest list is PII: only the `customers` grant may browse it. A
  // register-only cashier finds a guest by their exact number or email (RLS
  // enforces this; the flag only picks the path that will succeed).
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const canBrowse = hasPermission({ role, isOwner, permissions }, "customers");

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
    findAttachableCustomers(tenantId, debouncedQuery, canBrowse)
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
  }, [visible, tenantId, debouncedQuery, canBrowse]);

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
      onPick(await createAttachableCustomer(tenantId, validated.value));
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

  // A scanned Wallet card resolves to the guest with that number — the same
  // attachment a phone search would make, so the sale earns the normal way.
  const handleCardScanned = useCallback(async (code: string) => {
    setIsScannerOpen(false);
    setIsResolvingCard(true);
    setError(null);
    try {
      const identified = await identifyWalletCard(tenantId, code);
      if (!identified.ok) {
        setError(describeScanFailure(identified.reason));
        return;
      }
      onPick(await resolveScannedCustomer(tenantId, identified.phoneE164));
    } catch (err) {
      // The cause (e.g. a missing register function, a permission refusal)
      // must reach the logs — the cashier only sees the short version.
      console.warn("[pos] wallet card attach failed:", attachFailureDetail(err));
      setError(describeAttachFailure(err));
    } finally {
      setIsResolvingCard(false);
    }
  }, [tenantId, onPick]);

  const quickCreateDraft = draftFromSearch(query);
  const canQuickCreate = quickCreateDraft !== null && !isSearching && results.length === 0;

  // A docked sheet becomes a centred dialog once the glass is a tablet's
  // (components/pos/dialog-layout.ts).
  const isCentered = useCenteredDialog();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={[styles.backdrop, isCentered && centeredDialog.backdrop]}>
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          <View style={styles.header}>
            <Text style={styles.title}>Who is this for?</Text>
            <TouchableOpacity onPress={onCancel} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.search}
            placeholder={canBrowse ? "Search name or number" : "Guest's number or email"}
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

          <TouchableOpacity
            style={styles.walkIn}
            onPress={() => setIsScannerOpen(true)}
            disabled={isResolvingCard}
            accessibilityRole="button"
          >
            <Text style={styles.scanText}>
              {isResolvingCard ? "Checking loyalty card…" : "Scan loyalty card (Apple / Google Wallet)"}
            </Text>
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
                  onPress={() => onPick(item)}
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
                    {emptyMessage(query, canBrowse)}
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
      <MemberCardScanner
        visible={isScannerOpen}
        onCancel={() => setIsScannerOpen(false)}
        onScanned={handleCardScanned}
      />
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
  scanText: { ...typography.body, color: colors.primary, fontWeight: "600" },
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
