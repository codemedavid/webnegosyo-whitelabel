'use client'

import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SendingPhone } from '@/lib/texts/types'
import { DEMO_READONLY, runAction } from '../run-action'
import { useTexts } from '../texts-context'
import { useTextsActions } from '../texts-actions'

const MAX_NAME = 40

/** The phone's name with an inline rename: Enter saves, Esc cancels. */
export function PhoneName({ phone, isEditing, onEditingChange }: { phone: SendingPhone; isEditing: boolean; onEditingChange: (isEditing: boolean) => void }) {
  const { tenantId, isDemo, refresh } = useTexts()
  const [value, setValue] = useState(phone.name)
  const [isSaving, setSaving] = useState(false)
  const actions = useTextsActions()
  const trimmed = value.trim()
  const isValid = trimmed.length >= 1 && trimmed.length <= MAX_NAME

  const save = async () => {
    if (!isValid) return
    if (isDemo) return void toast.info(DEMO_READONLY)
    setSaving(true)
    const done = await runAction(() => actions.renamePhoneAction(tenantId, phone.deviceId, trimmed))
    setSaving(false)
    if (done === null) return
    onEditingChange(false)
    refresh()
  }

  if (!isEditing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <h3 className="truncate font-semibold">{phone.name}</h3>
        <Button type="button" variant="ghost" size="icon" className="-my-2 size-11 rounded-full text-wn-stone hover:text-foreground sm:size-8" aria-label={`Rename ${phone.name}`} onClick={() => { setValue(phone.name); onEditingChange(true) }}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }
  return (
    <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <Input
        autoFocus
        value={value}
        maxLength={MAX_NAME}
        aria-label="Phone name"
        aria-invalid={!isValid}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onEditingChange(false) } }}
        className="h-11 sm:h-8"
      />
      <Button type="submit" size="icon" variant="ghost" className="size-11 sm:size-8" disabled={!isValid || isSaving} aria-label="Save name"><Check className="h-4 w-4" /></Button>
      <Button type="button" size="icon" variant="ghost" className="size-11 sm:size-8" onClick={() => onEditingChange(false)} aria-label="Cancel rename"><X className="h-4 w-4" /></Button>
    </form>
  )
}
