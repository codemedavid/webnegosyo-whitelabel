import React from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import { useOrderRealtime } from '@/lib/queries/use-order-realtime'
import { formatPrice } from '@/lib/cart-utils'

const STATUS_STEPS = [
  { key: 'pending', label: 'Pending', icon: 'time-outline' as const },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle-outline' as const },
  { key: 'preparing', label: 'Preparing', icon: 'restaurant-outline' as const },
  { key: 'ready', label: 'Ready', icon: 'bag-check-outline' as const },
  { key: 'delivered', label: 'Delivered', icon: 'bicycle-outline' as const },
]

export default function OrderStatusScreen() {
  const { theme } = useTheme()
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const { order, isLoading } = useOrderRealtime(orderId)

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.buttonPrimary} />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textMuted} />
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>Order not found</Text>
      </View>
    )
  }

  const currentIndex = STATUS_STEPS.findIndex(s => s.key === order.status)
  const isCancelled = order.status === 'cancelled'

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Order info header */}
      <View style={[styles.header, { backgroundColor: theme.cards, borderBottomColor: theme.border }]}>
        <Text style={[styles.orderId, { color: theme.textMuted }]}>
          Order #{order.id.slice(0, 8).toUpperCase()}
        </Text>
        <Text style={[styles.orderTotal, { color: theme.buttonPrimary }]}>
          {formatPrice(order.total)}
        </Text>
        {order.customer_name ? (
          <Text style={[styles.customerName, { color: theme.textSecondary }]}>
            {order.customer_name}
          </Text>
        ) : null}
      </View>

      {/* Status timeline */}
      <View style={styles.timeline}>
        {isCancelled ? (
          <View style={styles.cancelledBox}>
            <Ionicons name="close-circle" size={48} color={theme.error} />
            <Text style={[styles.cancelledText, { color: theme.error }]}>Order Cancelled</Text>
          </View>
        ) : (
          STATUS_STEPS.map((step, index) => {
            const isActive = index <= currentIndex
            const isCurrent = index === currentIndex
            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepIndicator}>
                  <View
                    style={[
                      styles.stepCircle,
                      {
                        backgroundColor: isActive ? theme.buttonPrimary : theme.border,
                        borderColor: isCurrent ? theme.buttonPrimary : 'transparent',
                        borderWidth: isCurrent ? 3 : 0,
                      },
                    ]}
                  >
                    <Ionicons
                      name={step.icon}
                      size={20}
                      color={isActive ? theme.buttonPrimaryText : theme.textMuted}
                    />
                  </View>
                  {index < STATUS_STEPS.length - 1 ? (
                    <View
                      style={[
                        styles.stepLine,
                        { backgroundColor: index < currentIndex ? theme.buttonPrimary : theme.border },
                      ]}
                    />
                  ) : null}
                </View>
                <View style={styles.stepContent}>
                  <Text
                    style={[
                      styles.stepLabel,
                      { color: isActive ? theme.textPrimary : theme.textMuted },
                      isCurrent && { fontWeight: '700' },
                    ]}
                  >
                    {step.label}
                  </Text>
                  {isCurrent ? (
                    <Text style={[styles.stepHint, { color: theme.textSecondary }]}>Current status</Text>
                  ) : null}
                </View>
              </View>
            )
          })
        )}
      </View>

      {/* Live indicator */}
      {!isCancelled ? (
        <View style={styles.liveIndicator}>
          <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
          <Text style={[styles.liveText, { color: theme.textSecondary }]}>Live updates</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, marginTop: 12 },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  orderId: { fontSize: 13, marginBottom: 4 },
  orderTotal: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  customerName: { fontSize: 14 },
  timeline: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepIndicator: { alignItems: 'center', width: 44 },
  stepCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { width: 3, height: 32, marginVertical: 4 },
  stepContent: {
    flex: 1,
    marginLeft: 14,
    paddingTop: 10,
    paddingBottom: 24,
  },
  stepLabel: { fontSize: 16, fontWeight: '500' },
  stepHint: { fontSize: 12, marginTop: 2 },
  cancelledBox: { alignItems: 'center', paddingVertical: 40 },
  cancelledText: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 13 },
})
