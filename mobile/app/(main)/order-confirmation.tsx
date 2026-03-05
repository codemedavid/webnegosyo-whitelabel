import React, { useEffect, useRef, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useTheme, CONFIRMATION_OVERRIDES } from '@/theme/provider'
import { formatPrice } from '@/lib/cart-utils'
import { openMessenger } from '@/lib/messenger-linking'
import { useOrderStore } from '@/stores/order-store'
import { Button } from '@/components/ui/button'

export default function OrderConfirmationScreen() {
  const { theme, tenant } = useTheme()
  const completedOrder = useOrderStore(s => s.completedOrder)
  const clearCompletedOrder = useOrderStore(s => s.clearCompletedOrder)
  const hasAutoOpened = useRef(false)

  const messengerUrl = completedOrder?.messengerUrl
  const orderId = completedOrder?.orderId

  // Resolve colors: env override → theme fallback
  const c = {
    bg: CONFIRMATION_OVERRIDES.bg || theme.background,
    title: CONFIRMATION_OVERRIDES.title || theme.textPrimary,
    subtitle: CONFIRMATION_OVERRIDES.subtitle || theme.textSecondary,
    cardBg: CONFIRMATION_OVERRIDES.cardBg || theme.cards,
    cardBorder: CONFIRMATION_OVERRIDES.cardBorder || theme.border,
    label: CONFIRMATION_OVERRIDES.label || theme.textSecondary,
    value: CONFIRMATION_OVERRIDES.value || theme.textPrimary,
    totalLabel: CONFIRMATION_OVERRIDES.totalLabel || theme.textPrimary,
    totalValue: CONFIRMATION_OVERRIDES.totalValue || theme.buttonPrimary,
    divider: CONFIRMATION_OVERRIDES.divider || theme.border,
    successIcon: CONFIRMATION_OVERRIDES.successIcon || theme.success,
    successBg: CONFIRMATION_OVERRIDES.successBg || (theme.success + '20'),
    buttonBg: CONFIRMATION_OVERRIDES.buttonBg || theme.buttonPrimary,
    buttonText: CONFIRMATION_OVERRIDES.buttonText || theme.buttonPrimaryText,
    footerNote: CONFIRMATION_OVERRIDES.footerNote || theme.textMuted,
  }

  // Auto-open Messenger when screen loads
  useEffect(() => {
    if (messengerUrl && !hasAutoOpened.current) {
      hasAutoOpened.current = true
      const timer = setTimeout(() => {
        openMessenger(messengerUrl, completedOrder?.messengerMessage).catch(err =>
          console.warn('Failed to open Messenger:', err)
        )
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [messengerUrl, completedOrder?.messengerMessage])

  const handleOpenMessenger = useCallback(() => {
    if (messengerUrl) {
      openMessenger(messengerUrl, completedOrder?.messengerMessage)
    }
  }, [messengerUrl, completedOrder?.messengerMessage])

  const handleCopyMessage = useCallback(async () => {
    if (completedOrder?.messengerMessage) {
      await Clipboard.setStringAsync(completedOrder.messengerMessage)
      Alert.alert('Copied', 'Order message copied to clipboard')
    }
  }, [completedOrder?.messengerMessage])

  const handleBackToMenu = useCallback(() => {
    clearCompletedOrder()
    router.replace('/(main)/home')
  }, [clearCompletedOrder])

  // Fallback if no order data (e.g. app restarted)
  if (!completedOrder) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
        <View style={styles.centeredContent}>
          <Ionicons name="receipt-outline" size={48} color={c.footerNote} />
          <Text style={[styles.fallbackText, { color: c.subtitle }]}>
            No order data available
          </Text>
          <Button
            title="Back to Home"
            onPress={() => router.replace('/(main)/home')}
            size="lg"
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Success Header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: c.successBg }]}>
            <Ionicons name="checkmark-circle" size={56} color={c.successIcon} />
          </View>
          <Text style={[styles.title, { color: c.title }]}>Order Placed!</Text>
          <Text style={[styles.subtitle, { color: c.subtitle }]}>
            Your order has been sent to {tenant?.name || 'the restaurant'}
          </Text>
          {orderId ? (
            <Text style={[styles.orderIdText, { color: c.footerNote }]}>
              Order #{orderId.slice(0, 8).toUpperCase()}
            </Text>
          ) : null}
        </View>

        {/* Order Type */}
        {completedOrder.orderTypeName ? (
          <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
            <View style={styles.cardRow}>
              <Ionicons name="receipt-outline" size={18} color={c.label} />
              <Text style={[styles.cardLabel, { color: c.label }]}>Order Type</Text>
            </View>
            <Text style={[styles.cardValue, { color: c.value }]}>
              {completedOrder.orderTypeName}
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
          <View style={styles.cardRow}>
            <Ionicons name="people-outline" size={18} color={c.label} />
            <Text style={[styles.cardLabel, { color: c.label }]}>Customer History</Text>
          </View>
          <Text style={[styles.cardValue, { color: c.value }]}>
            {!completedOrder.isCustomerHistoryTracked
              ? 'History not tracked (missing phone, email, or name)'
              : completedOrder.previousOrderCount > 0
                ? `${completedOrder.previousOrderCount} past order${completedOrder.previousOrderCount === 1 ? '' : 's'} before this order`
                : 'First order from this customer on this phone'}
          </Text>
          {completedOrder.isCustomerHistoryTracked ? (
            <Text style={[styles.historySubtext, { color: c.label }]}>
              Total saved orders for this customer: {completedOrder.totalOrderCount}
            </Text>
          ) : null}
        </View>

        {/* Customer Information */}
        {completedOrder.formFields.length > 0 ? (
          <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: c.value }]}>
              Customer Information
            </Text>
            {completedOrder.formFields.map(field => {
              const val = completedOrder.customerData[field.field_name]
              if (!val || !val.trim()) return null
              return (
                <View key={field.field_name} style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: c.label }]}>
                    {field.field_label}
                  </Text>
                  <Text style={[styles.infoValue, { color: c.value }]} numberOfLines={2}>
                    {val}
                  </Text>
                </View>
              )
            })}
          </View>
        ) : null}

        {/* Order Items */}
        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: c.value }]}>
            Order Summary
          </Text>
          {completedOrder.items.map((item, index) => {
            let variationText = ''
            if (item.selected_variations && Object.keys(item.selected_variations).length > 0) {
              variationText = Object.values(item.selected_variations).map(o => o.name).join(', ')
            } else if (item.selected_variation) {
              variationText = item.selected_variation.name
            }

            return (
              <View key={item.id}>
                {index > 0 ? (
                  <View style={[styles.divider, { backgroundColor: c.divider }]} />
                ) : null}
                <View style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: c.value }]}>
                      {item.menu_item.name}
                      {variationText ? (
                        <Text style={[styles.itemVariation, { color: c.label }]}>
                          {' '}({variationText})
                        </Text>
                      ) : null}
                    </Text>
                    <Text style={[styles.itemQty, { color: c.label }]}>
                      x{item.quantity}
                    </Text>
                    {item.selected_addons.length > 0 ? (
                      <Text style={[styles.itemAddons, { color: c.footerNote }]}>
                        Add-ons: {item.selected_addons.map(a => a.name).join(', ')}
                      </Text>
                    ) : null}
                    {item.special_instructions ? (
                      <Text style={[styles.itemNote, { color: c.footerNote }]}>
                        Note: {item.special_instructions}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.itemPrice, { color: c.value }]}>
                    {formatPrice(item.subtotal)}
                  </Text>
                </View>
              </View>
            )
          })}

          {/* Total */}
          <View style={[styles.totalDivider, { backgroundColor: c.divider }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: c.totalLabel }]}>Total</Text>
            <Text style={[styles.totalValue, { color: c.totalValue }]}>
              {formatPrice(completedOrder.total)}
            </Text>
          </View>
        </View>

        {/* Payment Method */}
        {completedOrder.paymentMethodName ? (
          <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
            <View style={styles.cardRow}>
              <Ionicons name="card-outline" size={18} color={c.label} />
              <Text style={[styles.cardLabel, { color: c.label }]}>Payment Method</Text>
            </View>
            <Text style={[styles.cardValue, { color: c.value }]}>
              {completedOrder.paymentMethodName}
            </Text>
            {completedOrder.paymentMethodDetails ? (
              <Text style={[styles.paymentDetails, { color: c.label }]}>
                {completedOrder.paymentMethodDetails}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.buttons}>
          {messengerUrl ? (
            <Button
              title="Open Messenger"
              onPress={handleOpenMessenger}
              fullWidth
              size="lg"
              style={{ backgroundColor: c.buttonBg }}
              textStyle={{ color: c.buttonText }}
            />
          ) : null}
          <Button
            title="Copy Order Message"
            variant="outline"
            onPress={handleCopyMessage}
            fullWidth
            size="lg"
            style={{ borderColor: c.cardBorder }}
            textStyle={{ color: c.value }}
          />
          <Button
            title="Back to Home"
            variant="outline"
            onPress={handleBackToMenu}
            fullWidth
            size="lg"
            style={{ borderColor: c.cardBorder }}
            textStyle={{ color: c.value }}
          />
          {orderId ? (
            <Button
              title="Track Order"
              variant="ghost"
              onPress={() => router.push({ pathname: '/(main)/order-status', params: { orderId } })}
              fullWidth
              textStyle={{ color: c.label }}
            />
          ) : null}
        </View>

        <Text style={[styles.footerNote, { color: c.footerNote }]}>
          If Messenger didn&apos;t open, use the buttons above to open it manually or copy your order message.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  fallbackText: { fontSize: 16, textAlign: 'center' },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 4 },
  orderIdText: { fontSize: 13, marginTop: 4 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardLabel: { fontSize: 13, fontWeight: '500' },
  cardValue: { fontSize: 16, fontWeight: '700' },
  historySubtext: { fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 12 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  itemInfo: { flex: 1, marginRight: 12 },
  itemName: { fontSize: 14, fontWeight: '600' },
  itemVariation: { fontSize: 12, fontWeight: '400' },
  itemQty: { fontSize: 12, marginTop: 2 },
  itemAddons: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  itemNote: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  itemPrice: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 2 },
  totalDivider: { height: 1, marginTop: 8, marginBottom: 10 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 17, fontWeight: '700' },
  totalValue: { fontSize: 20, fontWeight: '800' },
  paymentDetails: { fontSize: 13, marginTop: 4 },
  buttons: { marginTop: 8, gap: 10 },
  footerNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
})
