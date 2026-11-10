'use client'

import type { ReactNode } from 'react'

import { LIMITS } from '@/lib/hero-builder/constants'
import type { CopyTextContent, WidgetContent } from '@/lib/hero-builder/types'

import { Field, Segmented, TextArea, TextInput } from '../controls'

const LABEL_MAX = 40

const DESIGNS: { value: CopyTextContent['design']; label: string }[] = [
  { value: 'icon', label: 'Copy icon' },
  { value: 'button', label: 'Button' },
  { value: 'only', label: 'Just a button' },
]

interface CopyTextFieldsProps {
  content: CopyTextContent
  edit: (patch: Partial<WidgetContent>, key?: string) => void
  tokenNote: string
}

/** The Copy text element's Content tab. */
export function CopyTextFields({ content, edit, tokenNote }: CopyTextFieldsProps): ReactNode {
  return (
    <>
      <Field label="Text to copy" hint={`What the customer gets, for example your address for booking their own rider.${tokenNote}`}>
        <TextArea value={content.text} rows={3} maxLength={LIMITS.shortText} onChange={(e) => edit({ text: e.target.value }, 'text')} />
      </Field>
      <Field label="Title above it" hint="Optional. Tells them what it is.">
        <TextInput value={content.title} maxLength={LIMITS.shortText} placeholder="Our pickup address" onChange={(e) => edit({ title: e.target.value }, 'title')} />
      </Field>
      <Field label="Design">
        <Segmented value={content.design} options={DESIGNS} onChange={(design) => edit({ design })} />
      </Field>
      <Field label="Button wording">
        <TextInput value={content.buttonLabel} maxLength={LABEL_MAX} placeholder="Copy" onChange={(e) => edit({ buttonLabel: e.target.value }, 'label')} />
      </Field>
      <Field label="After copying">
        <TextInput value={content.copiedLabel} maxLength={LABEL_MAX} placeholder="Copied!" onChange={(e) => edit({ copiedLabel: e.target.value }, 'copied')} />
      </Field>
    </>
  )
}
