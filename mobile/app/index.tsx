import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { useTheme } from '@/theme/provider'
import { useCartStore } from '@/stores/cart-store'
import { useQueryClient } from '@tanstack/react-query'
import { TENANT_SLUG } from '@/lib/constants'

export default function SplashRedirect() {
  const { tenant, isLoading } = useTheme()
  const setTenantContext = useCartStore(s => s.setTenantContext)
  const queryClient = useQueryClient()
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!isLoading && tenant) {
      setHasError(false)
      setTenantContext(tenant.id, tenant.slug)
      router.replace('/(main)/home')
    } else if (!isLoading && !tenant) {
      // Query finished but no tenant found — show error
      setHasError(true)
    }
  }, [isLoading, tenant])

  const handleRetry = () => {
    setHasError(false)
    queryClient.invalidateQueries({ queryKey: ['tenant', TENANT_SLUG] })
  }

  if (hasError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Unable to load store</Text>
        <Text style={styles.errorSub}>Please check your connection and try again</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#111111" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  errorText: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  errorSub: { fontSize: 14, color: '#888', marginBottom: 24, textAlign: 'center', paddingHorizontal: 40 },
  retryButton: {
    backgroundColor: '#111111',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: { color: '#ffffff', fontWeight: '600', fontSize: 16 },
})
