import { TriangleAlert } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { PressableScale } from '@/components/ui/pressable-scale'
import { readableOn } from '@/lib/theme/tokens'
import { useTokens } from '@/theme/theme-context'
import { SheetModal } from './sheet-modal'

interface DeleteAccountSheetProps {
  isVisible: boolean
  storeName: string
  onConfirm: () => void
  onClose: () => void
  isDeleting?: boolean
  /** Why the store couldn't delete it; the account stays until it can. */
  error?: string | null
}

const CONSEQUENCES = [
  'Your app profile, saved details and sign-in on every phone are erased.',
  'The store keeps its records of orders you’ve placed and stamps you’ve earned with your number.',
]

/** In-app account deletion (App Store 5.1.1(v)): one clear screen, one deliberate tap. */
export function DeleteAccountSheet({ isVisible, storeName, onConfirm, onClose, isDeleting = false, error = null }: DeleteAccountSheetProps) {
  const { colors, space, radius } = useTokens()
  return (
    <SheetModal isVisible={isVisible} onClose={onClose} accessibilityLabel="Delete your account">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <TriangleAlert size={24} color={colors.danger} />
        <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          Delete your account?
        </AppText>
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginTop: space.sm }}>
        This deletes your {storeName} account. It can’t be undone.
      </AppText>
      <View style={{ gap: space.sm, marginVertical: space.lg, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}>
        {CONSEQUENCES.map((line) => (
          <AppText key={line} variant="callout">
            • {line}
          </AppText>
        ))}
      </View>
      {error ? (
        <AppText variant="callout" color="danger" accessibilityLiveRegion="polite" style={{ marginBottom: space.md }}>
          {error}
        </AppText>
      ) : null}
      <PressableScale
        haptic="light"
        onPress={onConfirm}
        disabled={isDeleting}
        accessibilityState={{ busy: isDeleting, disabled: isDeleting }}
        accessibilityLabel="Delete my account"
        style={{ minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText variant="headline" style={{ color: readableOn(colors.danger, colors.surface) }}>
          {isDeleting ? 'Deleting…' : 'Delete my account'}
        </AppText>
      </PressableScale>
      <Button label="Keep my account" variant="ghost" onPress={onClose} style={{ marginTop: space.sm }} />
    </SheetModal>
  )
}
