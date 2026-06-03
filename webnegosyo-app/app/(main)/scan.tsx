import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  type LayoutChangeEvent,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeMutation } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { supabase } from "../../lib/supabase";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import {
  decodeQrToOrder,
  QR_SIZE_WARN_THRESHOLD,
  type DecodeResult,
  type QrOrderItemV1,
  type QrOrderPayloadV1,
} from "../../lib/qr-order-codec";

const createOrderRef = "orders:createOrder" as unknown as FunctionReference<"mutation">;

type DecodeError = Extract<DecodeResult, { ok: false }>["error"];

const DECODE_ERROR_MESSAGE: Record<DecodeError, string> = {
  empty: "Nothing was scanned. Try again.",
  corrupt: "This QR code could not be read. Ask the customer to refresh and try again.",
  version: "This QR was made by a newer app version. Please update.",
  checksum: "This QR code looks damaged or tampered with. Ask the customer to refresh.",
};

type ScreenState =
  | { mode: "scanning" }
  | { mode: "error"; error: DecodeError }
  | { mode: "validating"; payload: QrOrderPayloadV1 }
  | {
      mode: "preview";
      payload: QrOrderPayloadV1;
      items: QrOrderItemV1[];
      total: number;
      pricesUpdated: boolean;
    };

const SCAN_DEBOUNCE_MS = 1500;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const tenantId = useAuthStore((s) => s.tenantId);
  const createOrder = useSafeMutation(createOrderRef);

  const [state, setState] = useState<ScreenState>({ mode: "scanning" });
  const [isAccepting, setIsAccepting] = useState(false);
  const lastScanRef = useRef(0);

  // Re-validate base prices against the Supabase catalog and recompute totals
  // using catalog prices where they differ. Light-touch: only the per-item base
  // price is compared; variation/addon adjustments are preserved from the QR.
  const validateAndPreview = useCallback(
    async (payload: QrOrderPayloadV1) => {
      setState({ mode: "validating", payload });

      const ids = [...new Set(payload.items.map((i) => i.menuItemId))];
      const priceMap = new Map<string, number>();

      try {
        const { data } = await supabase
          .from("menu_items")
          .select("id, price")
          .eq("tenant_id", tenantId ?? payload.tenantId)
          .in("id", ids);
        for (const row of (data ?? []) as { id: string; price: number }[]) {
          priceMap.set(String(row.id), row.price);
        }
      } catch {
        // If catalog lookup fails, fall back to the QR-supplied prices.
      }

      let pricesUpdated = false;
      const items: QrOrderItemV1[] = payload.items.map((item) => {
        const catalogPrice = priceMap.get(item.menuItemId);
        if (catalogPrice === undefined || Math.abs(catalogPrice - item.price) < 0.01) {
          return item;
        }
        // Catalog base price differs: apply it and recompute the subtotal while
        // preserving the per-unit variation/addon delta from the QR payload.
        pricesUpdated = true;
        const perUnitDelta = round2(item.subtotal / item.quantity - item.price);
        const newUnit = round2(catalogPrice + perUnitDelta);
        return {
          ...item,
          price: catalogPrice,
          subtotal: round2(newUnit * item.quantity),
        };
      });

      const total = round2(items.reduce((sum, i) => sum + i.subtotal, 0));

      setState({ mode: "preview", payload, items, total, pricesUpdated });
    },
    [tenantId]
  );

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      const now = Date.now();
      if (now - lastScanRef.current < SCAN_DEBOUNCE_MS) return;
      lastScanRef.current = now;

      const raw = result.data ?? "";
      if (raw.length > QR_SIZE_WARN_THRESHOLD) {
        console.warn(
          `[scan] QR payload length ${raw.length} exceeds warn threshold ${QR_SIZE_WARN_THRESHOLD}`
        );
      }

      const decoded = decodeQrToOrder(raw);
      if (!decoded.ok) {
        setState({ mode: "error", error: decoded.error });
        return;
      }
      void validateAndPreview(decoded.payload);
    },
    [validateAndPreview]
  );

  const resetToScanning = useCallback(() => {
    lastScanRef.current = 0;
    setState({ mode: "scanning" });
  }, []);

  // Whenever the scan tab regains focus (e.g. after accepting an order and
  // navigating back), start fresh so the camera is live for the next order
  // instead of showing the previously accepted one.
  useFocusEffect(
    useCallback(() => {
      lastScanRef.current = 0;
      setIsAccepting(false);
      setState({ mode: "scanning" });
    }, [])
  );

  const handleAccept = useCallback(async () => {
    if (state.mode !== "preview" || isAccepting) return;
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    if (!convexUrl) {
      Alert.alert("Not connected", "Convex is not configured for this tenant.");
      return;
    }

    const { payload, items, total } = state;
    setIsAccepting(true);

    try {
      const hasUpsellItems = items.some((i) => i.isUpsellItem);
      const hasBundleItems = items.some((i) => i.isBundleItem);

      await createOrder({
        customerName: payload.customerName,
        customerContact: payload.customerContact,
        customerData: payload.customerData,
        total,
        orderType: payload.orderType,
        orderTypeId: payload.orderTypeId,
        source: "qr_handoff",
        clientOrderId: payload.cid,
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        paymentMethod: payload.paymentMethod,
        hasUpsellItems,
        hasBundleItems,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          menuItemName: i.menuItemName,
          quantity: i.quantity,
          price: i.price,
          subtotal: i.subtotal,
          specialInstructions: i.specialInstructions,
          variation: i.variation,
          variationSelections: i.variationSelections,
          addons: i.addons,
          isUpsellItem: i.isUpsellItem,
          isBundleItem: i.isBundleItem,
          bundleId: i.bundleId,
          bundleName: i.bundleName,
          slotName: i.slotName,
        })),
      });

      // createOrder is idempotent on clientOrderId, so a duplicate scan just
      // returns the existing order. Either way the order is now in the queue,
      // so we land the vendor straight on the orders list.
      router.replace("/(main)/orders");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to accept the order.";
      Alert.alert("Could not accept order", msg, [{ text: "OK" }]);
      setIsAccepting(false);
    }
  }, [state, isAccepting, convexUrl, createOrder]);

  const handleReject = useCallback(() => {
    // Reject writes nothing. Return to the dashboard.
    router.back();
  }, []);

  // --- Permission gating ---
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.screen}>
        <ScanHeader title="Scan QR" onClose={() => router.back()} />
        <View style={styles.permissionBody}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            Allow camera access to scan customer order QR codes.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={requestPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Grant access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScanHeader title="Scan QR" onClose={() => router.back()} />

      {state.mode === "scanning" && (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcode}
          />
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.reticle} />
            <Text style={styles.overlayHint}>
              Point at the customer&apos;s order QR
            </Text>
          </View>
        </View>
      )}

      {state.mode === "error" && (
        <View style={styles.center}>
          <Card style={styles.errorCard}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Can&apos;t read this QR</Text>
            <Text style={styles.errorText}>{DECODE_ERROR_MESSAGE[state.error]}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={resetToScanning}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Rescan</Text>
            </TouchableOpacity>
          </Card>
        </View>
      )}

      {state.mode === "validating" && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.validatingText}>Checking prices…</Text>
        </View>
      )}

      {state.mode === "preview" && (
        <PreviewPanel
          payload={state.payload}
          items={state.items}
          total={state.total}
          pricesUpdated={state.pricesUpdated}
          isAccepting={isAccepting}
          onAccept={handleAccept}
          onReject={handleReject}
          onRescan={resetToScanning}
        />
      )}
    </View>
  );
}

function ScanHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
        <Text style={styles.closeText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

function PreviewPanel({
  payload,
  items,
  total,
  pricesUpdated,
  isAccepting,
  onAccept,
  onReject,
  onRescan,
}: {
  payload: QrOrderPayloadV1;
  items: QrOrderItemV1[];
  total: number;
  pricesUpdated: boolean;
  isAccepting: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRescan: () => void;
}) {
  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  return (
    <View style={styles.previewWrap}>
      <ScrollView contentContainerStyle={styles.previewContent}>
        <View style={styles.previewTitleRow}>
          <Text style={styles.previewTitle}>Review order</Text>
          <Badge label="pending" variant="pending" />
        </View>

        <Card title="Customer" style={styles.previewSection}>
          <Text style={styles.value}>{payload.customerName || "—"}</Text>
          <Text style={styles.sub}>{payload.customerContact || "—"}</Text>
          <Text style={styles.sub}>{payload.orderType || "N/A"}</Text>
          {payload.paymentMethod ? (
            <Text style={styles.sub}>Payment: {payload.paymentMethod}</Text>
          ) : null}
        </Card>

        {pricesUpdated && (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeText}>
              Prices updated from your menu since the customer scanned. The
              totals below use your current catalog prices.
            </Text>
          </View>
        )}

        <Card title={`Items (${itemCount})`} style={styles.previewSection}>
          {items.map((item, i) => (
            <View
              key={`${item.menuItemId}-${i}`}
              style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}
            >
              <View style={{ flex: 1 }}>
                {item.slotName ? (
                  <Text style={styles.slotLabel}>{item.slotName}</Text>
                ) : null}
                <Text style={styles.itemName}>{item.menuItemName}</Text>
                {item.variationSelections && item.variationSelections.length > 0 ? (
                  item.variationSelections.map((v, vi) => (
                    <Text key={vi} style={styles.itemDetail}>
                      {v.typeName}: {v.optionName}
                    </Text>
                  ))
                ) : item.variation ? (
                  <Text style={styles.itemDetail}>Variation: {item.variation}</Text>
                ) : null}
                {item.addons && item.addons.length > 0 ? (
                  <Text style={styles.itemDetail}>
                    Add-ons: {item.addons.map((a) => a.name).join(", ")}
                  </Text>
                ) : null}
                {item.specialInstructions ? (
                  <Text style={styles.itemDetail}>Note: {item.specialInstructions}</Text>
                ) : null}
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemQty}>x{item.quantity}</Text>
                <Text style={styles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₱{total.toFixed(2)}</Text>
          </View>
        </Card>

        <TouchableOpacity onPress={onRescan} activeOpacity={0.7}>
          <Text style={styles.rescanLink}>Scan a different QR</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.previewActions}>
        <SlideToAccept onComplete={onAccept} isAccepting={isAccepting} />
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onReject}
          disabled={isAccepting}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SLIDE_HEIGHT = 60;
const KNOB_SIZE = 52;
const SLIDE_PADDING = 4;
const COMPLETE_THRESHOLD = 0.85;

function SlideToAccept({
  onComplete,
  isAccepting,
}: {
  onComplete: () => void;
  isAccepting: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const completedRef = useRef(false);

  const maxSlide = Math.max(0, trackWidth - KNOB_SIZE - SLIDE_PADDING * 2);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isAccepting && !completedRef.current,
        onMoveShouldSetPanResponder: () => !isAccepting && !completedRef.current,
        onPanResponderMove: (_, gesture) => {
          if (maxSlide <= 0) return;
          const x = Math.min(Math.max(0, gesture.dx), maxSlide);
          translateX.setValue(x);
        },
        onPanResponderRelease: (_, gesture) => {
          if (maxSlide <= 0) return;
          const x = Math.min(Math.max(0, gesture.dx), maxSlide);
          if (x >= maxSlide * COMPLETE_THRESHOLD) {
            completedRef.current = true;
            Animated.timing(translateX, {
              toValue: maxSlide,
              duration: 120,
              // JS driver: the same value also drives `width`/opacity below,
              // which the native driver cannot animate.
              useNativeDriver: false,
            }).start(() => onComplete());
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: false,
              bounciness: 0,
            }).start();
          }
        },
      }),
    [maxSlide, isAccepting, onComplete, translateX]
  );

  // Track-fill width and label fade follow the knob position.
  const fillWidth = translateX.interpolate({
    inputRange: [0, Math.max(1, maxSlide)],
    outputRange: [KNOB_SIZE + SLIDE_PADDING * 2, trackWidth || KNOB_SIZE],
    extrapolate: "clamp",
  });
  const labelOpacity = translateX.interpolate({
    inputRange: [0, Math.max(1, maxSlide) * 0.6],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.slideTrack} onLayout={handleLayout}>
      <Animated.View style={[styles.slideFill, { width: fillWidth }]} pointerEvents="none" />
      <Animated.Text
        style={[styles.slideLabel, { opacity: labelOpacity }]}
        pointerEvents="none"
      >
        Slide to accept
      </Animated.Text>
      <Animated.View
        style={[styles.slideKnob, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {isAccepting ? (
          <ActivityIndicator color={colors.success} />
        ) : (
          <Text style={styles.slideKnobArrow}>›››</Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.md,
  },
  headerTitle: { ...typography.title, color: colors.textPrimary },
  closeButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  closeText: { ...typography.body, color: colors.primary, fontWeight: "500" },

  // Camera
  cameraWrap: { flex: 1, margin: spacing.xl, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  reticle: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderRadius: radius.lg,
    backgroundColor: "transparent",
  },
  overlayHint: {
    ...typography.body,
    color: "#FFFFFF",
    marginTop: spacing.xl,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },

  // Permission
  permissionBody: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  permissionIcon: { fontSize: 48, marginBottom: spacing.lg },
  permissionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  permissionText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },

  // Error
  errorCard: { alignItems: "center", width: "100%" },
  errorIcon: { fontSize: 40, marginBottom: spacing.sm },
  errorTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.xs },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },

  validatingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },

  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", ...typography.heading },

  // Preview
  previewWrap: { flex: 1 },
  previewContent: { padding: spacing.xl, paddingBottom: spacing.md },
  previewTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  previewTitle: { ...typography.title, color: colors.textPrimary },
  previewSection: { marginBottom: spacing.md },
  value: { ...typography.heading, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  noticeBanner: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.statusPending.text },

  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
  itemBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.separator },
  slotLabel: {
    ...typography.small,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  itemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  itemDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemRight: { alignItems: "flex-end", marginLeft: spacing.md },
  itemQty: { ...typography.caption, color: colors.textSecondary },
  itemPrice: { ...typography.body, color: colors.primary, fontWeight: "600" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  totalLabel: { ...typography.heading, color: colors.textPrimary },
  totalValue: { ...typography.heading, color: colors.primary },
  rescanLink: {
    ...typography.body,
    color: colors.primary,
    textAlign: "center",
    paddingVertical: spacing.md,
  },

  previewActions: {
    padding: spacing.xl,
    gap: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.separator,
    backgroundColor: colors.card,
    ...shadow.sm,
  },
  // Slide to accept
  slideTrack: {
    height: SLIDE_HEIGHT,
    borderRadius: SLIDE_HEIGHT / 2,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.separator,
    justifyContent: "center",
    overflow: "hidden",
  },
  slideFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.success,
    borderRadius: SLIDE_HEIGHT / 2,
  },
  slideLabel: {
    ...typography.heading,
    color: colors.textSecondary,
    textAlign: "center",
  },
  slideKnob: {
    position: "absolute",
    left: SLIDE_PADDING,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  slideKnobArrow: {
    color: colors.success,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -2,
  },
  cancelButton: { alignItems: "center", paddingVertical: spacing.md },
  cancelText: { ...typography.body, color: colors.textSecondary, fontWeight: "500" },
});
