'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MESSENGER_LIMITS } from '@/lib/messenger/limits'
import { defaultTrigger, TRIGGER_KIND_ORDER, TRIGGER_LABELS } from '@/lib/messenger/rule-labels'
import type { RuleTrigger, TriggerKind } from '@/lib/messenger/rules'
import { KeywordInput } from './keyword-input'
import { FIELD_CLASS } from './field-styles'

interface TriggerFieldsProps {
  trigger: RuleTrigger
  /** Kinds Meta allows only once (Get Started, fallback) that another rule already uses. */
  takenKinds: ReadonlySet<TriggerKind>
  onChange: (trigger: RuleTrigger) => void
}

export function TriggerFields({ trigger, takenKinds, onChange }: TriggerFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">When</legend>
      <select
        aria-label="When"
        className={FIELD_CLASS}
        value={trigger.kind}
        onChange={(event) => onChange(defaultTrigger(event.target.value as TriggerKind))}
      >
        {TRIGGER_KIND_ORDER.map((kind) => (
          <option key={kind} value={kind} disabled={kind !== trigger.kind && takenKinds.has(kind)}>
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
    </fieldset>
  )
}
