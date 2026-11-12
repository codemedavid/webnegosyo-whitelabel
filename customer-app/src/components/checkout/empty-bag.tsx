import { router } from 'expo-router'
import { ShoppingBag } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { useTokens } from '@/theme/theme-context'

export function EmptyBag() {
  const { colors, space } = useTokens()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.sm,
        }}
      >
        <ShoppingBag size={38} color={colors.onPrimarySoft} />
      </View>
      <AppText variant="title" align="center" accessibilityRole="header">
        Your bag is empty
      </AppText>
      <AppText variant="body" color="textMuted" align="center">
        Add a drink or a bite and it will wait for you here.
      </AppText>
      <Button label="Browse the menu" size="lg" onPress={() => router.navigate('/order')} style={{ alignSelf: 'stretch', marginTop: space.lg }} />
    </View>
  )
}
