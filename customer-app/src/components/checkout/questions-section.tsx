import { useState } from 'react'
import { ScrollView, Switch, TextInput, View, type KeyboardTypeOptions } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { TICKED, upcomingDays } from '@/lib/checkout/questions'
import type { AppCheckoutQuestion } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'
import { CheckoutSection } from './checkout-section'

/** The order route keeps 500 characters per answer. */
const ANSWER_MAX = 500

const KEYBOARDS: Partial<Record<AppCheckoutQuestion['type'], KeyboardTypeOptions>> = {
  number: 'number-pad',
  phone: 'phone-pad',
  email: 'email-address',
}

interface QuestionsSectionProps {
  questions: readonly AppCheckoutQuestion[]
  /** By question id. */
  answers: Readonly<Record<string, string>>
  onAnswer: (questionId: string, value: string) => void
  /** The store's refusal per question name, from the last attempt. */
  errors: Readonly<Record<string, string>>
}

function Chip({ label, isSelected, onPress, hint }: { label: string; isSelected: boolean; onPress: () => void; hint?: string }) {
  const { colors, space, radius } = useTokens()
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: isSelected ? colors.primary : colors.border,
        backgroundColor: isSelected ? colors.primarySoft : colors.surface,
      }}
    >
      <AppText variant="bodyStrong" color={isSelected ? 'onPrimarySoft' : 'text'}>
        {label}
      </AppText>
    </PressableScale>
  )
}

function DateChoices({ question, value, onChange }: { question: AppCheckoutQuestion; value: string; onChange: (next: string) => void }) {
  const { space } = useTokens()
  // Today's 14 days, worked out once per visit to the screen.
  const [days] = useState(() => upcomingDays(Date.now()))
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}>
      {days.map((day) => (
        <Chip key={day.value} label={day.label} isSelected={value === day.value} onPress={() => onChange(day.value)} hint={question.label} />
      ))}
    </ScrollView>
  )
}

function QuestionControl({ question, value, onChange }: { question: AppCheckoutQuestion; value: string; onChange: (next: string) => void }) {
  const { colors, space, radius, type } = useTokens()
  switch (question.type) {
    case 'choice':
      return (
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {question.options.map((option) => (
            <Chip key={option} label={option} isSelected={value === option} onPress={() => onChange(option)} hint={question.label} />
          ))}
        </View>
      )
    case 'checkbox':
      return (
        <Switch
          value={value === TICKED}
          onValueChange={(isOn) => onChange(isOn ? TICKED : '')}
          trackColor={{ true: colors.primary, false: colors.border }}
          accessibilityLabel={question.label}
        />
      )
    case 'date':
      return <DateChoices question={question} value={value} onChange={onChange} />
    default: {
      const isLong = question.type === 'textarea'
      return (
        <TextInput
          value={value}
          onChangeText={onChange}
          maxLength={ANSWER_MAX}
          multiline={isLong}
          placeholder={question.placeholder ?? undefined}
          placeholderTextColor={colors.textMuted}
          keyboardType={KEYBOARDS[question.type] ?? 'default'}
          autoCapitalize={question.type === 'email' ? 'none' : 'sentences'}
          returnKeyType={isLong ? 'default' : 'done'}
          accessibilityLabel={question.label}
          style={[
            type.body,
            {
              color: colors.text,
              minHeight: isLong ? 64 : 48,
              paddingHorizontal: space.md,
              paddingVertical: isLong ? space.md : 0,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceMuted,
              textAlignVertical: isLong ? 'top' : 'center',
            },
          ]}
        />
      )
    }
  }
}

/** The store's own checkout questions for the chosen order type ("Pickup date", "Which gate?"). */
export function QuestionsSection({ questions, answers, onAnswer, errors }: QuestionsSectionProps) {
  const { space } = useTokens()
  if (questions.length === 0) return null
  return (
    <CheckoutSection title="A few more details">
      <View style={{ gap: space.lg }}>
        {questions.map((question) => {
          const error = errors[question.name]
          const isInline = question.type === 'checkbox'
          const control = <QuestionControl question={question} value={answers[question.id] ?? ''} onChange={(next) => onAnswer(question.id, next)} />
          return (
            <View key={question.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{question.label}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {question.isRequired ? 'Required' : 'Optional'}
                  </AppText>
                </View>
                {isInline ? control : null}
              </View>
              {isInline ? null : control}
              {error ? (
                <AppText variant="callout" color="danger" accessibilityLiveRegion="polite">
                  {error}
                </AppText>
              ) : null}
            </View>
          )
        })}
      </View>
    </CheckoutSection>
  )
}
