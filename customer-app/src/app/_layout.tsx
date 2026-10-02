import { QueryClientProvider } from '@tanstack/react-query'
import * as Font from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { BootError } from '@/components/navigation/boot-screen'
import type { AppFontKey } from '@/lib/contract'
import { queryClient, useAppConfig } from '@/lib/data/hooks'
import { FONT_ASSETS } from '@/theme/font-assets'
import { ThemeProvider, useTokens } from '@/theme/theme-context'

void SplashScreen.preventAutoHideAsync()

function useTenantFonts(fontKey: AppFontKey | undefined): boolean {
  const [loadedKey, setLoadedKey] = useState<AppFontKey | null>(null)
  useEffect(() => {
    if (!fontKey) return
    let isCurrent = true
    Font.loadAsync(FONT_ASSETS[fontKey])
      // A font that fails to load falls back to the system face; never block the store on it.
      .catch(() => undefined)
      .finally(() => {
        if (isCurrent) setLoadedKey(fontKey)
      })
    return () => {
      isCurrent = false
    }
  }, [fontKey])
  return fontKey !== undefined && loadedKey === fontKey
}

function ThemedStack() {
  const { colors, type } = useTokens()
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: type.headline.fontFamily, color: colors.text },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen
          name="added"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetAllowedDetents: [0.5, 0.85],
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
          }}
        />
        <Stack.Screen
          name="branch"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetAllowedDetents: [0.6, 0.95],
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
          }}
        />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="checkout" options={{ title: 'Review order' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Your order' }} />
        <Stack.Screen name="orders" options={{ title: 'Order history' }} />
      </Stack>
    </>
  )
}

/** Holds the splash until the tenant's config and font pair are ready, so the first frame is on-brand. */
function TenantGate() {
  const config = useAppConfig()
  const fontsReady = useTenantFonts(config.data?.theme.fontKey)
  const isReady = config.data !== undefined && fontsReady

  useEffect(() => {
    if (isReady || config.isError) void SplashScreen.hideAsync()
  }, [isReady, config.isError])

  if (config.isError) return <BootError onRetry={() => void config.refetch()} />
  if (!isReady || !config.data) return null
  return (
    <ThemeProvider theme={config.data.theme}>
      <ThemedStack />
    </ThemeProvider>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <TenantGate />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
