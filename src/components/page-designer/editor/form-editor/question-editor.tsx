'use client'

import { Plus, X } from 'lucide-react'

import { FIELD_PATTERNS, readFieldRules, withFieldRules, type FieldPatternId, type FieldRules } from '@/lib/checkout-field-rules'
import { FIELD_TYPE_LABELS, TYPES_WITH_CHOICES, type CheckoutFieldType } from '@/lib/checkout-field-types'
import { isDeliveryAddressField, isTableNumberField } from '@/lib/checkout-field-presets'
import { FORM_FIELD_LIMITS } from '@/lib/order-types/customer-form-field-schema'
import type { FormQuestion } from '@/lib/page-designer/form-changes'
import { Segmented, SelectField, TextInput, Toggle } from '@/components/hero-builder/editor/controls'

const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABELS) as CheckoutFieldType[]).map((value) => ({ value, label: FIELD_TYPE_LABELS[value] }))
const WIDTHS = [
  { value: 'auto', label: 'Standard' },
  { value: 'full', label: 'Full' },
  { value: 'half', label: 'Half' },
] as const
const PATTERN_OPTIONS = [
  { value: '', label: 'Anything' },
  ...(Object.keys(FIELD_PATTERNS) as FieldPatternId[]).map((id) => ({ value: id, label: `${FIELD_PATTERNS[id].label} (${FIELD_PATTERNS[id].example})` })),
]
const TEXT_TYPES: readonly CheckoutFieldType[] = ['text', 'textarea']
const NO_PLACEHOLDER: readonly CheckoutFieldType[] = ['checkbox', 'choice', 'date']

function Labelled({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-neutral-600">{label}</span>
      {children}
      {hint && <p className="text-[11px] leading-snug text-neutral-500">{hint}</p>}
    </div>
  )
}

/** A whole number box: blank = no limit. */
function CountInput({ label, value, onChange }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void }) {
  return (
    <TextInput
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={label}
      placeholder="—"
      value={value ?? ''}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(e.target.value.trim() === '' || !Number.isFinite(n) ? undefined : n)
      }}
    />
  )
}

function ChoicesEditor({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  const set = (index: number, value: string) => onChange(options.map((o, i) => (i === index ? value : o)))
  return (
    <Labelled label="Choices" hint="Customers pick one.">
      <div className="space-y-1.5">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-1">
            <TextInput aria-label={`Choice ${index + 1}`} value={option} maxLength={FORM_FIELD_LIMITS.optionLength} onChange={(e) => set(index, e.target.value)} />
            <button
              type="button"
              aria-label={`Remove choice ${index + 1}`}
              onClick={() => onChange(options.filter((_, i) => i !== index))}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {options.length < FORM_FIELD_LIMITS.options && (
          <button type="button" onClick={() => onChange([...options, ''])} className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline">
            <Plus className="h-3 w-3" /> Add a choice
          </button>
        )}
      </div>
    </Labelled>
  )
}

function ChecksEditor({ type, rules, onRules }: { type: CheckoutFieldType; rules: FieldRules; onRules: (patch: Partial<FieldRules>) => void }) {
  if (type === 'number') {
    return (
      <Labelled label="Checks">
        <div className="grid grid-cols-2 gap-2">
          <CountInput label="Smallest number" value={rules.min} onChange={(min) => onRules({ min })} />
          <CountInput label="Largest number" value={rules.max} onChange={(max) => onRules({ max })} />
        </div>
      </Labelled>
    )
  }
  if (!TEXT_TYPES.includes(type)) return null
  return (
    <Labelled label="Checks" hint="Customers see what to fix beside the box.">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <CountInput label="Fewest characters" value={rules.minLength} onChange={(minLength) => onRules({ minLength })} />
          <CountInput label="Most characters" value={rules.maxLength} onChange={(maxLength) => onRules({ maxLength })} />
        </div>
        <Toggle label="Numbers only" checked={!!rules.digitsOnly} onChange={(digitsOnly) => onRules({ digitsOnly })} />
        <Labelled label="Must look like">
          <SelectField value={rules.pattern ?? ''} onChange={(pattern) => onRules({ pattern: (pattern || undefined) as FieldPatternId | undefined })} options={PATTERN_OPTIONS} />
        </Labelled>
      </div>
    </Labelled>
  )
}

/** Everything about one question: words, kind, choices, width and checks. */
export function QuestionEditor({ question, onChange }: { question: FormQuestion; onChange: (next: FormQuestion) => void }) {
  const rules = readFieldRules(question.validation_rules)
  const isAddress = isDeliveryAddressField(question)
  // The checkout keys these on their stored name: their kind stays.
  const isTypeLocked = isAddress || isTableNumberField(question)
  const set = (patch: Partial<FormQuestion>) => onChange({ ...question, ...patch })
  const setRules = (patch: Partial<FieldRules>) => set({ validation_rules: withFieldRules(question.validation_rules, patch) })
  const changeType = (type: CheckoutFieldType) =>
    set({ field_type: type, options: TYPES_WITH_CHOICES.includes(type) && !question.options.length ? ['Option 1', 'Option 2'] : question.options })

  return (
    <div className="space-y-3">
      <Labelled label="Question">
        <TextInput aria-label="Question" value={question.field_label} maxLength={FORM_FIELD_LIMITS.label} onChange={(e) => set({ field_label: e.target.value })} />
      </Labelled>
      <Labelled label="Kind of answer" hint={isTypeLocked ? (isAddress ? 'The address search with a map pin. Its kind can’t change.' : 'Prints on the kitchen ticket. Its kind can’t change.') : undefined}>
        {isTypeLocked ? (
          <p className="rounded-md bg-neutral-100 px-2 py-1.5 text-xs text-neutral-700">{isAddress ? 'Delivery address' : 'Table number'}</p>
        ) : (
          <SelectField value={question.field_type} onChange={changeType} options={TYPE_OPTIONS} />
        )}
      </Labelled>
      {!NO_PLACEHOLDER.includes(question.field_type) && (
        <Labelled label="Hint inside the box">
          <TextInput aria-label="Hint inside the box" value={question.placeholder} maxLength={FORM_FIELD_LIMITS.placeholder} onChange={(e) => set({ placeholder: e.target.value })} />
        </Labelled>
      )}
      <Labelled label="Help under the box">
        <TextInput aria-label="Help under the box" value={rules.help ?? ''} placeholder="e.g. We’ll text you when it’s ready" maxLength={200} onChange={(e) => setRules({ help: e.target.value })} />
      </Labelled>
      {TYPES_WITH_CHOICES.includes(question.field_type) && <ChoicesEditor options={question.options} onChange={(options) => set({ options })} />}
      <Toggle
        label={question.field_type === 'checkbox' ? 'Must tick to order' : 'Required'}
        checked={question.is_required}
        onChange={(is_required) => set({ is_required })}
      />
      {!isAddress && (
        <Labelled label="Width" hint="Half-width questions sit side by side on wider screens; phones show one per line.">
          <Segmented value={rules.width ?? 'auto'} onChange={(width) => setRules({ width: width === 'auto' ? undefined : width })} options={WIDTHS} />
        </Labelled>
      )}
      {!isAddress && <ChecksEditor type={question.field_type} rules={rules} onRules={setRules} />}
    </div>
  )
}
