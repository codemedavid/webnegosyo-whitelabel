import React, { useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ViewerItem } from "../../lib/expenses/expense-detail";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { Modal } from "../Modal";

interface ReceiptViewerProps {
  items: readonly ViewerItem[];
  /** The receipt that was tapped. */
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

const VIEWER_GROUND = "#000000";

function clampIndex(index: number, count: number): number {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

/**
 * Receipts full screen on black: swipe sideways between them, "1 of 2" at the
 * top, a close button. A photo still on this phone says so. (No pinch zoom —
 * not needed to read a receipt held at phone width.)
 */
export function ReceiptViewer({ items, initialIndex, visible, onClose }: ReceiptViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const startAt = clampIndex(initialIndex, items.length);
  const [index, setIndex] = useState(startAt);
  const current = items[clampIndex(index, items.length)];

  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const pageWidth = event.nativeEvent.layoutMeasurement.width || width;
    setIndex(clampIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth), items.length));
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.ground}>
        <FlatList
          testID="receipt-pager"
          data={items}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startAt}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          onMomentumScrollEnd={onSettle}
          renderItem={({ item, index: itemIndex }) => (
            <View style={{ width, height }}>
              <Image
                source={{ uri: item.uri }}
                style={styles.image}
                resizeMode="contain"
                alt={`Receipt ${itemIndex + 1} of ${items.length}`}
                accessibilityLabel={`Receipt ${itemIndex + 1} of ${items.length}`}
              />
            </View>
          )}
        />
        <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
          {items.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {clampIndex(index, items.length) + 1} of {items.length}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close receipt" hitSlop={8}>
            <Icon name="close" size={22} color={colors.textOnDark} />
          </TouchableOpacity>
        </View>
        {current?.isWaiting ? (
          <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]} pointerEvents="none">
            <View style={styles.counter}>
              <Text style={styles.counterText}>Waiting to upload</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1, backgroundColor: VIEWER_GROUND },
  image: { flex: 1, width: "100%" },
  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  counter: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  counterText: { ...typography.caption, fontWeight: "700", color: colors.textOnDark, fontVariant: ["tabular-nums"] },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
});
