import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { formatPeso } from "../lib/format";
import {
  getInitials,
  getAvatarColor,
  getUrgency,
  getUrgencyColor,
  getOrderTypeMeta,
  getStatusMeta,
  formatTimeAgo,
} from "../lib/order-visuals";

export interface OrderCardOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact?: string;
  total: number;
  itemCount: number;
  orderType?: string;
  status: string;
  source?: string;
  paymentStatus?: string;
}

interface OrderCardProps {
  order: OrderCardOrder;
  onPress: () => void;
  /** Product image urls to preview as a small thumbnail strip. */
  thumbnails?: string[];
  /** Label for the primary "advance" action, e.g. "Confirmed". Omit to hide. */
  nextStatusLabel?: string;
  onAdvance?: () => void;
  onCancel?: () => void;
  /** Tighter, action-free variant used in the dashboard "Needs attention" list. */
  compact?: boolean;
}

const MAX_THUMBNAILS = 4;

export function OrderCard({
  order,
  onPress,
  thumbnails,
  nextStatusLabel,
  onAdvance,
  onCancel,
  compact = false,
}: OrderCardProps) {
  const status = getStatusMeta(order.status);
  const typeMeta = getOrderTypeMeta(order.orderType);
  const isActive = order.status !== "delivered" && order.status !== "cancelled";
  const urgencyColor = getUrgencyColor(getUrgency(order._creationTime));
  const accentColor = isActive ? urgencyColor : colors.separator;
  const isUnpaid = order.paymentStatus != null && order.paymentStatus !== "paid";

  const shownThumbs = (thumbnails ?? []).filter(Boolean).slice(0, MAX_THUMBNAILS);
  const extraThumbs = Math.max(0, order.itemCount - shownThumbs.length);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: accentColor }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Order for ${order.customerName}, ${status.label}, ${formatPeso(order.total)}`}
    >
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(order.customerName) }]}>
          <Text style={styles.avatarText}>{getInitials(order.customerName)}</Text>
        </View>
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {order.customerName}
          </Text>
          {order.customerContact ? (
            <Text style={styles.contact} numberOfLines={1}>
              {order.customerContact}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          <Text style={styles.total}>{formatPeso(order.total)}</Text>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.typeChip}>
          <Text style={styles.typeLabel}>{typeMeta.label}</Text>
        </View>
        <Text style={styles.meta}>
          {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
        </Text>
        {order.source ? <Text style={styles.metaDot}>·</Text> : null}
        {order.source ? <Text style={styles.meta}>{order.source}</Text> : null}
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.meta}>{formatTimeAgo(order._creationTime)}</Text>
        {isUnpaid ? (
          <View style={styles.unpaidChip}>
            <Text style={styles.unpaidText}>Unpaid</Text>
          </View>
        ) : null}
      </View>

      {shownThumbs.length > 0 && (
        <View style={styles.thumbRow}>
          {shownThumbs.map((url, i) => (
            <Image key={`${url}-${i}`} source={{ uri: url }} style={styles.thumb} alt="" />
          ))}
          {extraThumbs > 0 && (
            <View style={[styles.thumb, styles.thumbMore]}>
              <Text style={styles.thumbMoreText}>+{extraThumbs}</Text>
            </View>
          )}
        </View>
      )}

      {!compact && (nextStatusLabel || onCancel) && (
        <View style={styles.actions}>
          {nextStatusLabel && onAdvance && (
            <TouchableOpacity
              style={styles.advanceButton}
              onPress={onAdvance}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Mark order as ${nextStatusLabel}`}
            >
              <Text style={styles.advanceText}>Mark as {nextStatusLabel}</Text>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Cancel order for ${order.customerName}`}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const AVATAR_SIZE = 40;
const THUMB_SIZE = 40;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.textOnDark, fontWeight: "800", fontSize: 15 },
  identity: { flex: 1 },
  name: { ...typography.heading, color: colors.textPrimary },
  contact: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  right: { alignItems: "flex-end", gap: spacing.xs },
  total: { ...typography.heading, color: colors.accent },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  typeLabel: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  meta: { ...typography.caption, color: colors.textSecondary },
  metaDot: { ...typography.caption, color: colors.textTertiary },
  unpaidChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.dangerLight,
  },
  unpaidText: { ...typography.small, color: colors.danger, fontWeight: "700" },
  thumbRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.md },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
  },
  thumbMore: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.separator },
  thumbMoreText: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  advanceButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 10,
    alignItems: "center",
  },
  advanceText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
  cancelButton: { paddingVertical: 10, paddingHorizontal: spacing.md },
  cancelText: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});
