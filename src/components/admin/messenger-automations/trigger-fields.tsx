'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MESSENGER_LIMITS } from '@/lib/messenger/limits'
import {
  defaultTrigger, onceSlot, TRIGGER_KIND_ORDER, TRIGGER_LABELS, WHEN_KINDS, WHEN_LABELS, withWhen,
} from '@/lib/messenger/rule-labels'
import { triggerWhen, type RuleTrigger, type RuleWhen, type TriggerKind } from '@/lib/messenger/rules'
import { ChoiceChips } from '@/components/admin/messenger-studio/studio-ui'
import { KeywordInput } from './keyword-input'
import { FIELD_CLASS } from './field-styles'

interface TriggerFieldsProps {
  trigger: RuleTrigger
  /** Get Started / fallback slots (`onceSlot`) another rule already uses. */
  takenSlots: ReadonlySet<string>
  onChange: (trigger: RuleTrigger) => void
}

const WHEN_ORDER = ['always', 'open', 'closed'] as const

export function TriggerFields({ trigger, takenSlots, onChange }: TriggerFieldsProps) {
  const when = triggerWhen(trigger)
  const isTaken = (kind: TriggerKind, slot: RuleWhen | null) => takenSlots.has(onceSlot(kind, slot))
  const changeKind = (kind: TriggerKind) => {
    const next = defaultTrigger(kind)
    // Keep "Only when" across kinds that have it, unless that slot is taken there.
    onChange(when && !isTaken(kind, when) ? withWhen(next, when) : next)
  }
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">When</legend>
      <select
        aria-label="When"
        className={FIELD_CLASS}
        value={trigger.kind}
        onChange={(event) => changeKind(event.target.value as TriggerKind)}
      >
        {TRIGGER_KIND_ORDER.map((kind) => (
          <option key={kind} value={kind} disabled={kind !== trigger.kind && WHEN_ORDER.every((slot) => isTaken(kind, slot === 'always' ? null : slot))}>
            {TRIGGER_LABELS[kind].title}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{TRIGGER_LABELS[trigger.kind].help}</p>

      {trigger.kind === 'keyword' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rule-keywords">Words</Label>
            <KeywordInput id="rule-keywords" keywords={trigger.keywords} onChange={(keywords) => onChange({ ...trigger, keywords })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-match">Match</Label>
            <select
              id="rule-match"
              className={FIELD_CLASS}
              value={trigger.match}
              onChange={(event) => onChange({ ...trigger, match: event.target.value === 'exact' ? 'exact' : 'contains' })}
            >
              <option value="contains">The message contains one of the words</option>
              <option value="exact">The message is exactly one of the words</option>
            </select>
          </div>
        </div>
      ) : null}

      {trigger.kind === 'ice_breaker' ? (
        <div className="space-y-1.5">
          <Label htmlFor="rule-question">Question</Label>
          <Input
            id="rule-question"
            value={trigger.question}
            maxLength={MESSENGER_LIMITS.iceBreakerQuestion}
            placeholder="What’s on the menu today?"
            onChange={(event) => onChange({ ...trigger, question: event.target.value })}
          />
        </div>
      ) : null}

      {trigger.kind === 'menu_button' ? (
        <div className="space-y-1.5">
          <Label htmlFor="rule-button-label">Button label</Label>
          <Input
            id="rule-button-label"
            value={trigger.label}
            maxLength={MESSENGER_LIMITS.persistentMenuTitle}
            placeholder="🍽️ See our menu"
            onChange={(event) => onChange({ ...trigger, label: event.target.value })}
          />
        </div>
      ) : null}

      {WHEN_KINDS.includes(trigger.kind) ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Only when</p>
          <ChoiceChips
            label="Only when"
            value={when ?? 'always'}
            options={WHEN_ORDER.map((slot) => ({
              value: slot,
              label: WHEN_LABELS[slot],
              disabled: isTaken(trigger.kind, slot === 'always' ? null : slot),
            }))}
            onChange={(slot) => onChange(withWhen(trigger, slot === 'always' ? null : slot))}
          />
          <p className="text-xs text-muted-foreground">
            Uses your store hours. “Store closed” replies are a good place to say when you open.
          </p>
        </div>
      ) : null}
    </fieldset>
  )
}
