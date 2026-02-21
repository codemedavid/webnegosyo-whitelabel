import React from 'react'
import { Stack } from 'expo-router'
import { useTheme, CART_BRANDING_OVERRIDES } from '@/theme/provider'

export default function MainLayout() {
  const { theme } = useTheme()
  const cartTitle = CART_BRANDING_OVERRIDES.title || 'Cart'
  const cartBackTitle = CART_BRANDING_OVERRIDES.backTitle || 'Menu'

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.header },
        headerTintColor: theme.headerFont,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="menu" options={{ headerShown: false }} />
      <Stack.Screen
        name="item/[itemId]"
        options={{ title: '', headerTransparent: true, headerBackTitle: 'Back' }}
      />
      <Stack.Screen name="cart" options={{ title: cartTitle, headerBackTitle: cartBackTitle }} />
      <Stack.Screen name="checkout" options={{ title: 'Checkout', headerBackTitle: cartTitle }} />
      <Stack.Screen
        name="order-confirmation"
        options={{ title: 'Order Confirmed', headerShown: false }}
      />
      <Stack.Screen name="order-status" options={{ title: 'Order Status', headerBackTitle: 'Back' }} />
    </Stack>
  )
}
