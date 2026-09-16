import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  BackHandler,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useNavigation, useFocusEffect } from "expo-router";
import { useAuthStore } from "../../stores/auth-store";
import { usePosCartStore } from "../../stores/pos-cart-store";
import { hasPermission } from "../../lib/staff-permissions";
import {
  callLoyaltyPos,
  isLoyaltyPosEnabled,
  newLoyaltyRequestId,
  readPendingLoyaltySale,
  savePendingLoyaltySale,
  readReservedLoyaltyQuote,
  saveReservedLoyaltyQuote,
  LoyaltyPosApiError,
  type PendingLoyaltySale,
} from "../../lib/loyalty/pos-api";
import { colors, spacing, radius } from "../../theme/colors";
import { goTo } from "../../lib/tab-navigation";
interface Quote {
  quoteId: string;
  expiresAt: string;
  totalCentavos: number;
  discount: { label: string; amountCentavos: number };
  paymentMethods: { id: string; name: string; kind: "cash" | "manual" }[];
}
export default function PosLoyaltyScreen() {
  const auth = useAuthStore();
  return <LoyaltyCheckout key={`${auth.tenantId}:${auth.userId}`} />;
}
function LoyaltyCheckout() {
  const auth = useAuthStore();
  const cart = usePosCartStore();
  const navigation = useNavigation();
  const allowLeave = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scan, setScan] = useState(false);
  const [token, setToken] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pending, setPending] = useState<PendingLoyaltySale | null>(null);
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [reservedId, setReservedId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const scopeActive = () => {
    const current = useAuthStore.getState();
    return (
      alive.current &&
      current.tenantId === auth.tenantId &&
      current.userId === auth.userId
    );
  };
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    settlementId: string;
    totalCentavos: number;
  } | null>(null);
  const requestId = useRef(newLoyaltyRequestId());
  const inflight = useRef(false);
  const allowed =
    !auth.isDemo &&
    hasPermission(
      { role: auth.role, isOwner: auth.isOwner, permissions: auth.permissions },
      "loyalty_redeem",
    );
  useFocusEffect(
    useCallback(() => {
      let current = true;
      allowLeave.current = false;
      setReady(false);
      if (auth.tenantId && auth.userId)
        Promise.all([
          readPendingLoyaltySale(auth.tenantId, auth.userId),
          readReservedLoyaltyQuote(auth.tenantId, auth.userId),
        ]).then(
          ([sale, reservation]) => {
            if (current && alive.current) {
              setPending(sale);
              setReservedId(reservation);
              setReady(true);
            }
          },
          () => {
            if (current)
              setError(
                "Pending sale recovery is unavailable. Please reopen this screen.",
              );
          },
        );
      return () => {
        current = false;
      };
    }, [auth.tenantId, auth.userId]),
  );
  useEffect(() => {
    const listener = BackHandler.addEventListener(
      "hardwareBackPress",
      () => !!pending || !!reservedId || busy,
    );
    return () => listener.remove();
  }, [pending, reservedId, busy]);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!allowLeave.current && (pending || reservedId || busy)) {
          event.preventDefault();
          setError("Finish or cancel this reward before leaving.");
        }
      }),
    [navigation, pending, reservedId, busy],
  );
  const run = async (action: () => Promise<void>) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (scopeActive())
        setError(
          e instanceof Error ? e.message : "Could not complete the request.",
        );
    } finally {
      if (scopeActive()) setBusy(false);
      inflight.current = false;
    }
  };
  const preview = () =>
    run(async () => {
      if (
        !auth.tenantId ||
        !auth.userId ||
        !cart.orderTypeId ||
        !cart.lines.length
      )
        throw new Error("Add items and choose an order type first.");
      if (
        cart.editContext ||
        cart.discount.manual ||
        cart.discount.vouchers.length ||
        cart.lines.some((line) => line.note || line.carryover)
      )
        throw new Error(
          "Use a new sale without vouchers, manual discounts, bundles, or item notes.",
        );
      const id = reservedId ?? requestId.current;
      await saveReservedLoyaltyQuote(auth.tenantId, auth.userId, id);
      if (!scopeActive()) return;
      setReservedId(id);
      const result = await callLoyaltyPos("quotes", {
        tenantId: auth.tenantId,
        requestId: id,
        claimToken: token,
        outletId: cart.saleOutlet?.id ?? null,
        orderTypeId: cart.orderTypeId,
        cart: {
          lines: cart.lines.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            selectedOptionIds: line.selections.map((option) => option.optionId),
          })),
        },
      });
      if (!scopeActive()) return;
      setQuote(result.quote);
      setMethod(result.quote.paymentMethods[0]?.id ?? "");
      setAmount(String(result.quote.totalCentavos / 100));
    });
  const settle = () =>
    run(async () => {
      if (!auth.tenantId || !auth.userId) return;
      const cents = Math.round(Number(amount) * 100);
      if (
        !pending &&
        (!quote ||
          !method ||
          !Number.isSafeInteger(cents) ||
          cents < quote.totalCentavos)
      )
        throw new Error("Enter the full amount received.");
      if (
        !pending &&
        quote?.paymentMethods.find((option) => option.id === method)?.kind ===
          "manual" &&
        !reference.trim()
      )
        throw new Error("Enter the payment reference.");
      const sale = pending ?? {
        quoteId: quote!.quoteId,
        clientOrderId: newLoyaltyRequestId(),
        tender: {
          methodId: method,
          amountTenderedCentavos: cents,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        },
      };
      // Journal BEFORE calling settlement. An ambiguous response never goes through
      // the old POS order creator; every retry uses this exact quote, ID and tender.
      await savePendingLoyaltySale(auth.tenantId, auth.userId, sale);
      if (!scopeActive()) return;
      setPending(sale);
      try {
        const result = await callLoyaltyPos("settlements", {
          tenantId: auth.tenantId,
          ...sale,
        });
        await saveReservedLoyaltyQuote(auth.tenantId, auth.userId, null);
        await savePendingLoyaltySale(auth.tenantId, auth.userId, null);
        if (scopeActive()) {
          setReservedId(null);
          setReceipt(result.receipt);
          cart.reset();
          setQuote(null);
          setPending(null);
        }
      } catch (e) {
        // These responses establish that no receipt was committed for this request.
        if (
          e instanceof LoyaltyPosApiError &&
          (e.status === 422 ||
            (e.status === 409 &&
              [
                "Quote expired",
                "Reward reservation expired or unavailable",
                "Live loyalty is not enabled",
              ].includes(e.message)))
        ) {
          await savePendingLoyaltySale(auth.tenantId, auth.userId, null);
          if (scopeActive()) setPending(null);
        }
        throw e;
      }
    });
  const resetScreen = () => {
    setReceipt(null);
    setQuote(null);
    setPending(null);
    setReservedId(null);
    setToken("");
    setReference("");
    setScan(false);
    setError("");
    requestId.current = newLoyaltyRequestId();
  };
  const cancel = () =>
    run(async () => {
      if (pending) throw new Error("Recover the pending sale before leaving.");
      if (reservedId && auth.tenantId && auth.userId) {
        const result = await callLoyaltyPos(
          "quotes",
          { tenantId: auth.tenantId, quoteId: reservedId },
          "DELETE",
        );
        if (!result.released)
          throw new Error("Reward release could not be confirmed.");
        await saveReservedLoyaltyQuote(auth.tenantId, auth.userId, null);
      }
      if (scopeActive()) {
        resetScreen();
        allowLeave.current = true;
        goTo(router, "/(main)/pos-tender");
      }
    });
  if (!allowed)
    return (
      <View style={styles.body}>
        <Text>Loyalty redemption permission is required.</Text>
      </View>
    );
  if (!isLoyaltyPosEnabled() && !pending && !reservedId)
    return (
      <View style={styles.body}>
        <Text>Loyalty redemption is not enabled for this app yet.</Text>
      </View>
    );
  if (scan)
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            setToken(data);
            setScan(false);
            requestId.current = newLoyaltyRequestId();
          }}
        />
        <TouchableOpacity style={styles.button} onPress={() => setScan(false)}>
          <Text style={styles.white}>Cancel scan</Text>
        </TouchableOpacity>
      </View>
    );
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>Redeem a reward</Text>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      {receipt ? (
        <>
          <Text style={styles.title}>Sale completed</Text>
          <Text>₱{(receipt.totalCentavos / 100).toFixed(2)} paid</Text>
          <Text selectable>Receipt {receipt.settlementId}</Text>
          <Text>
            The order is syncing to your order list. Do not create another sale.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              resetScreen();
              allowLeave.current = true;
              goTo(router, "/(main)/pos");
            }}
          >
            <Text style={styles.white}>New sale</Text>
          </TouchableOpacity>
        </>
      ) : pending ? (
        <>
          <Text>
            A sale needs confirmation. Retry to recover its receipt; do not
            collect payment again.
          </Text>
          <TouchableOpacity
            style={styles.button}
            disabled={busy}
            onPress={() => void settle()}
          >
            <Text style={styles.white}>
              {busy ? "Recovering…" : "Recover sale"}
            </Text>
          </TouchableOpacity>
        </>
      ) : quote ? (
        <>
          <Text>
            {quote.discount.label}: −₱
            {(quote.discount.amountCentavos / 100).toFixed(2)}
          </Text>
          <Text style={styles.title}>
            Pay ₱{(quote.totalCentavos / 100).toFixed(2)}
          </Text>
          <Text>
            Complete payment before{" "}
            {new Date(quote.expiresAt).toLocaleTimeString()}.
          </Text>
          {quote.paymentMethods.map((option) => (
            <TouchableOpacity
              key={option.id}
              disabled={busy}
              onPress={() => {
                setMethod(option.id);
                setAmount(String(quote.totalCentavos / 100));
              }}
            >
              <Text>
                {method === option.id ? "Selected: " : ""}
                {option.name}
              </Text>
            </TouchableOpacity>
          ))}
          {quote.paymentMethods.find((option) => option.id === method)?.kind ===
          "manual" ? (
            <>
              <Text>Payment reference</Text>
              <TextInput
                style={styles.input}
                accessibilityLabel="Payment reference"
                value={reference}
                onChangeText={setReference}
                maxLength={128}
                autoCapitalize="none"
              />
            </>
          ) : null}
          <Text>Amount received (₱)</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Amount received"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TouchableOpacity
            style={styles.button}
            disabled={busy}
            onPress={() => void settle()}
          >
            <Text style={styles.white}>
              {busy ? "Completing…" : "Complete sale"}
            </Text>
          </TouchableOpacity>
        </>
      ) : reservedId ? (
        <>
          <Text>
            A reward preview needs confirmation. Finish checking it or cancel to
            release the reward before starting another sale.
          </Text>
          {token ? (
            <TouchableOpacity
              style={styles.button}
              disabled={busy}
              onPress={() => void preview()}
            >
              <Text style={styles.white}>Retry preview</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : (
        <>
          <Text>
            Scan the customer’s verified reward QR before taking payment.
          </Text>
          <TouchableOpacity
            style={styles.button}
            disabled={busy || !ready}
            onPress={() =>
              void run(async () => {
                const result = permission?.granted
                  ? permission
                  : await requestPermission();
                if (result.granted) setScan(true);
                else
                  throw new Error(
                    "Allow camera access or paste the claim code.",
                  );
              })
            }
          >
            <Text style={styles.white}>Scan reward QR</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            accessibilityLabel="Claim code"
            placeholder="Or paste the claim code"
            value={token}
            onChangeText={(value) => {
              setToken(value);
              requestId.current = newLoyaltyRequestId();
            }}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.button}
            disabled={busy || !token || !ready}
            onPress={() => void preview()}
          >
            <Text style={styles.white}>
              {busy ? "Checking…" : "Preview reward"}
            </Text>
          </TouchableOpacity>
        </>
      )}
      {!pending && !receipt ? (
        <TouchableOpacity disabled={busy} onPress={() => void cancel()}>
          <Text>Cancel redemption</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  white: { color: colors.textOnDark, fontWeight: "600" },
});
