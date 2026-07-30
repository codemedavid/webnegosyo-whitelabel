import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation } from "../../../lib/hooks";
import { colors, typography, spacing, radius } from "../../../theme/colors";
import { Card } from "../../../components/Card";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { ModifierSheet } from "../../../components/pos/ModifierSheet";
import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { formatPeso } from "../../../lib/format";
import { listProducts } from "../../../lib/products";
import {
  normalizeModifierGroups,
  type ModifierGroup,
  type ModifierSource,
} from "../../../lib/modifier-groups";
import {
  addLine,
  updateQty,
  removeLine,
  type PosCartLine,
  type PosCartSelection,
} from "../../../lib/pos-cart";
import {
  startEditSession,
  applyCart,
  describeSession,
  type EditSession,
} from "../../../lib/order-edit-session";
import { posCartToOrderItems, type ModifierCatalog } from "../../../lib/order-edit-cart";
import type { OrderPaymentLike } from "../../../lib/order-history-view";
import type { OrderItemDto } from "../../../lib/backends/supabase-orders";

/**
 * The edit screen: a register cart pre-loaded with a placed order.
 *
 * Deliberately thin over `order-edit-session.ts`. Every judgement the cashier
 * acts on — is this dirty, what changed, what is owed, may it be saved — comes
 * from that module, which is unit tested. Jest is scoped to `lib/` and `theme/`
 * here, so anything decided in this file is decided untested.
 */

const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;
const getOrderPaymentsRef = "orders:getOrderPayments" as unknown as FunctionReference<"query">;
const reviseOrderRef = "orders:reviseOrder" as unknown as FunctionReference<"mutation">;

interface EditableOrderDetail {
  _id: string;
  total: number;
  status: string;
  revisionNumber?: number;
  deliveryFee?: number;
  items?: OrderItemDto[];
}

export default function OrderEditScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const userId = useAuthStore((s) => s.userId);

  const { data: order, isLoading, error } = useSafeQuery<EditableOrderDetail | null>(
    getOrderByIdRef,
    orderId ? { orderId } : "skip",
  );
  const { data: payments, error: paymentsError } = useSafeQuery<OrderPaymentLike[]>(
    getOrderPaymentsRef,
    orderId ? { orderId } : "skip",
  );
  const reviseOrder = useSafeMutation(reviseOrderRef);

  const [catalog, setCatalog] = useState<ModifierCatalog | null>(null);
  const [products, setProducts] = useState<
    { id: string; name: string; price: number; groups: ModifierGroup[] }[]
  >([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [session, setSession] = useState<EditSession | null>(null);
  const [sheetFor, setSheetFor] = useState<
    { id: string; name: string; price: number; groups: ModifierGroup[] } | null
  >(null);
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // The live menu, needed to resolve the order's modifiers back to ids. An
  // order priced against a menu that has since changed still hydrates: unknown
  // options are reported as warnings, never dropped, and the line keeps the
  // price it was sold at.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    (async () => {
      try {
        const rows = await listProducts(tenantId);
        if (cancelled) return;

        const next: ModifierCatalog = {};
        const list = rows.map((product) => {
          const groups = normalizeModifierGroups(product as unknown as ModifierSource);
          next[product.id] = groups;
          return {
            id: product.id,
            name: product.name,
            price: Number(product.price) || 0,
            groups,
          };
        });

        setCatalog(next);
        setProducts(list.filter((p) => rows.find((r) => r.id === p.id)?.is_available));
      } catch (err) {
        if (!cancelled) {
          setCatalogError(err instanceof Error ? err.message : "Could not load the menu.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // Open the session once both the order and the menu have arrived. Payments
  // are required too: an order opened without its ledger looks unpaid, and the
  // screen would offer to collect a bill that was already settled.
  useEffect(() => {
    if (session || !order || !catalog || paymentsError) return;
    if (payments === undefined) return;

    setSession(
      startEditSession(
        {
          _id: order._id,
          total: order.total,
          revisionNumber: order.revisionNumber,
          items: order.items ?? [],
        },
        payments ?? [],
        catalog,
      ),
    );
  }, [order, catalog, payments, paymentsError, session]);

  const changes = useMemo(() => (session ? describeSession(session) : []), [session]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [products, search]);

  function mutateCart(next: PosCartLine[]) {
    if (!session) return;
    setSession(applyCart(session, next));
  }

  function handleAdd(
    item: { id: string; name: string; price: number },
    selections: PosCartSelection[],
    quantity: number,
  ) {
    if (!session) return;
    mutateCart(
      addLine(session.cart, {
        menuItemId: item.id,
        name: item.name,
        basePrice: item.price,
        quantity,
        selections,
      }),
    );
    setSheetFor(null);
    setIsAdding(false);
  }

  async function handleSave() {
    if (!session || !session.canSave || !order) return;

    if (isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }

    setIsSaving(true);
    try {
      await reviseOrder({
        orderId: session.orderId,
        expectedRevisionNumber: session.expectedRevisionNumber,
        items: posCartToOrderItems(session.cart),
        deliveryFee: order.deliveryFee,
        reason: reason.trim() || undefined,
        revisedBy: userId ?? undefined,
        editedAt: new Date().toISOString(),
      });

      // Settle only when money actually has to move. An edit that swapped one
      // item for another of the same price is complete the moment it saves.
      if (session.intent === "settled") {
        router.back();
        return;
      }
      // `push`, not `replace`: replacing into the tab navigator breaks it, and
      // `lib/tab-navigation.test.ts` locks that rule for every screen here.
      // Backing out of settle therefore lands on this screen with a now-stale
      // revision — which is safe rather than merely tolerable, because the
      // optimistic lock refuses a second save against it and says why.
      router.push(`/(main)/order-settle/${session.orderId}`);
    } catch (err) {
      Alert.alert(
        "Could not save",
        err instanceof Error ? err.message : "The edit was not saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <ErrorState message={error} onRetry={() => router.back()} />
      </View>
    );
  }

  if (paymentsError) {
    return (
      <View style={styles.screen}>
        <ErrorState
          message={
            "This order's payment history could not be loaded, so its bill cannot be edited safely. " +
            paymentsError
          }
          onRetry={() => router.back()}
        />
      </View>
    );
  }

  if (catalogError) {
    return (
      <View style={styles.screen}>
        <ErrorState message={catalogError} onRetry={() => router.back()} />
      </View>
    );
  }

  if (isLoading || !session) {
    return <LoadingState fullScreen message="Opening order..." />;
  }

  const difference = session.newTotal - session.originalTotal;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Edit order</Text>

        <View style={styles.totalsRow}>
          <View>
            <Text style={styles.totalsLabel}>Was</Text>
            <Text style={styles.wasTotal}>{formatPeso(session.originalTotal)}</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
          <View>
            <Text style={styles.totalsLabel}>Now</Text>
            <Text style={styles.nowTotal}>{formatPeso(session.newTotal)}</Text>
          </View>
          {difference !== 0 && (
            <Text
              style={[
                styles.difference,
                { color: difference > 0 ? colors.success : colors.danger },
              ]}
            >
              {difference > 0 ? "+" : "−"}
              {formatPeso(Math.abs(difference))}
            </Text>
          )}
        </View>

        {session.warnings.length > 0 && (
          <Card style={styles.warningCard}>
            {session.warnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                {warning}
              </Text>
            ))}
          </Card>
        )}

        <Card title="Items" style={styles.card}>
          {session.cart.map((line) => (
            <View key={line.key} style={styles.line}>
              <View style={styles.lineMain}>
                <Text style={styles.lineName}>{line.name}</Text>
                {line.selections.length > 0 && (
                  <Text style={styles.lineSub}>
                    {line.selections.map((s) => s.optionName).join(", ")}
                  </Text>
                )}
                <Text style={styles.lineSub}>{formatPeso(line.unitPrice)} each</Text>
              </View>

              <View style={styles.qtyControls}>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => mutateCart(updateQty(session.cart, line.key, line.quantity - 1))}
                >
                  <Text style={styles.qtyButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qty}>{line.quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => mutateCart(updateQty(session.cart, line.key, line.quantity + 1))}
                >
                  <Text style={styles.qtyButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.lineRight}>
                <Text style={styles.lineTotal}>{formatPeso(line.subtotal)}</Text>
                <TouchableOpacity onPress={() => mutateCart(removeLine(session.cart, line.key))}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.addButton} onPress={() => setIsAdding((v) => !v)}>
            <Text style={styles.addButtonText}>{isAdding ? "Done adding" : "+ Add item"}</Text>
          </TouchableOpacity>

          {isAdding && (
            <View style={styles.picker}>
              <TextInput
                style={styles.search}
                placeholder="Search the menu"
                placeholderTextColor={colors.textTertiary}
                value={search}
                onChangeText={setSearch}
              />
              {filteredProducts.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={styles.pickerRow}
                  onPress={() =>
                    product.groups.length > 0
                      ? setSheetFor(product)
                      : handleAdd(product, [], 1)
                  }
                >
                  <Text style={styles.pickerName}>{product.name}</Text>
                  <Text style={styles.pickerPrice}>{formatPeso(product.price)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>

        {changes.length > 0 && (
          <Card title="What changed" style={styles.card}>
            {changes.map((change) => (
              <Text key={change} style={styles.changeText}>
                • {change}
              </Text>
            ))}
          </Card>
        )}

        <Card title="Reason (optional)" style={styles.card}>
          <TextInput
            style={styles.reason}
            placeholder="e.g. Customer added a drink"
            placeholderTextColor={colors.textTertiary}
            value={reason}
            onChangeText={setReason}
            multiline
          />
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        {session.blockedReason ? (
          <Text style={styles.blockedText}>{session.blockedReason}</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.saveButton, (!session.canSave || isSaving) && styles.saveButtonDisabled]}
          disabled={!session.canSave || isSaving}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>
            {isSaving
              ? "Saving..."
              : session.intent === "collect"
                ? `Save · collect ${formatPeso(Math.abs(session.balance))}`
                : session.intent === "refund"
                  ? `Save · refund ${formatPeso(Math.abs(session.balance))}`
                  : "Save changes"}
          </Text>
        </TouchableOpacity>
      </View>

      {sheetFor && (
        <ModifierSheet
          visible
          itemName={sheetFor.name}
          basePrice={sheetFor.price}
          groups={sheetFor.groups}
          onCancel={() => setSheetFor(null)}
          onConfirm={(selections, quantity) => handleAdd(sheetFor, selections, quantity)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60, paddingBottom: 140 },
  backButton: { marginBottom: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  heading: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  totalsLabel: {
    ...typography.small,
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  wasTotal: {
    ...typography.body,
    color: colors.textSecondary,
    textDecorationLine: "line-through",
  },
  nowTotal: { ...typography.heading, color: colors.textPrimary, fontWeight: "700" },
  arrow: { ...typography.body, color: colors.textTertiary },
  difference: { ...typography.body, fontWeight: "700", marginLeft: "auto" },
  card: { marginBottom: spacing.lg },
  warningCard: { marginBottom: spacing.lg, backgroundColor: colors.warningLight },
  warningText: { ...typography.small, color: colors.textPrimary, marginBottom: 2 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  lineMain: { flex: 1 },
  lineName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  lineSub: { ...typography.small, color: colors.textSecondary },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: { ...typography.body, color: colors.textPrimary },
  qty: { ...typography.body, color: colors.textPrimary, minWidth: 24, textAlign: "center" },
  lineRight: { alignItems: "flex-end", minWidth: 76 },
  lineTotal: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  removeText: { ...typography.small, color: colors.danger },
  addButton: { paddingVertical: spacing.md, alignItems: "center" },
  addButtonText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  picker: { borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: spacing.sm },
  search: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  pickerName: { ...typography.body, color: colors.textPrimary },
  pickerPrice: { ...typography.body, color: colors.textSecondary },
  changeText: { ...typography.small, color: colors.textPrimary, marginBottom: 2 },
  reason: { ...typography.body, color: colors.textPrimary, minHeight: 44 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  blockedText: {
    ...typography.small,
    color: colors.danger,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});
