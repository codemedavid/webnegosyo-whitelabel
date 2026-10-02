import { Pressable, Text, View } from 'react-native'

interface BootErrorProps {
  onRetry: () => void
}

/**
 * Shown before the tenant theme exists (config failed to load), so it cannot
 * use tokens — deliberately neutral.
 */
export function BootError({ onRetry }: BootErrorProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#111111', textAlign: 'center' }}>We can't reach the store</Text>
      <Text style={{ fontSize: 15, color: '#555555', textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
        Check your connection and try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{ paddingHorizontal: 28, minHeight: 48, justifyContent: 'center', borderRadius: 999, backgroundColor: '#111111' }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
  )
}
