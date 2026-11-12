import { TextInput } from 'react-native'
import { useTokens } from '@/theme/theme-context'
import { CheckoutSection } from './checkout-section'

const MAX_NOTES = 300

export function NotesSection({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { colors, space, radius, type } = useTokens()
  return (
    <CheckoutSection title="Notes for the store">
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={MAX_NOTES}
        multiline
        placeholder="Less ice, no straw, call when outside…"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Notes for the store"
        style={[type.body, { color: colors.text, minHeight: 64, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, textAlignVertical: 'top' }]}
      />
    </CheckoutSection>
  )
}
