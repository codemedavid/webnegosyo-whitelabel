import type { ReactNode } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTokens } from '@/theme/theme-context'

interface SheetModalProps {
  isVisible: boolean
  onClose: () => void
  children: ReactNode
  accessibilityLabel: string
}

/** A small bottom sheet for one decision (edit name, delete account) without leaving the screen. */
/**
 * For one decision WITHOUT typing. A text field belongs in a native form sheet
 * route (see app/edit-name.tsx): here the first tap with the keyboard up only
 * closed the keyboard and the button never fired.
 */
export function SheetModal({ isVisible, onClose, children, accessibilityLabel }: SheetModalProps) {
  const { colors, space, radius } = useTokens()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: space.xl,
            paddingBottom: Math.max(insets.bottom, space.lg) + space.md,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.border,
              marginTop: -space.sm,
              marginBottom: space.lg,
            }}
          />
          {children}
        </View>
      </View>
    </Modal>
  )
}
