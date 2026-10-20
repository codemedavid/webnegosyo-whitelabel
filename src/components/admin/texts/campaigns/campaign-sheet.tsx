'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { opensInEditor } from '@/lib/texts/view/campaigns'
import { blankDraft, draftFromItem, draftFromPreset } from '@/lib/texts/view/composer-draft'
import { findPreset } from '@/lib/texts/view/presets'
import { CampaignComposer } from '../composer/campaign-composer'
import { ComposerChooser } from '../composer/composer-chooser'
import { CampaignDetail } from '../detail/campaign-detail'
import { useDirtyCloseGuard } from '../sheet-frame'
import { useTexts } from '../texts-context'

const LOCKED = 'This campaign has started sending, so its message is locked. Duplicate it to change it.'

/**
 * `?campaign=new|<id>`: the chooser, the composer, or the report. Outside
 * clicks and Esc never throw away unsaved edits — the close button asks.
 */
export function CampaignSheet() {
  const { url, setUrl, campaigns } = useTexts()
  const { isDirty, setDirty, armRequest, guard } = useDirtyCloseGuard()
  const target = url.campaign
  const item = target && target !== 'new' ? campaigns.find((c) => c.id === target) ?? null : null
  const wantsEditor = target === 'new' || (item !== null && !url.isReport && (url.edit || opensInEditor(item)))
  const isLocked = item !== null && url.edit && !item.isEditable
  const lockedToast = useRef<string | null>(null)

  useEffect(() => {
    if (!isLocked || !item || lockedToast.current === item.id) return
    lockedToast.current = item.id
    toast.info(LOCKED)
    setUrl({ edit: false })
  }, [isLocked, item, setUrl])

  const close = useCallback(() => {
    setDirty(false)
    setUrl({ campaign: null })
  }, [setUrl, setDirty])

  const isChooser = target === 'new' && !url.preset
  const isEditor = wantsEditor && !isLocked && !isChooser
  const width = isChooser ? 'sm:max-w-md' : isEditor ? 'sm:max-w-[640px] lg:max-w-[1020px]' : 'sm:max-w-xl lg:max-w-2xl'
  // Never keyed on the saved row: a revalidation mid-submit must not remount the editor.
  const editorKey = `${target}|${url.preset ?? ''}`

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && !isDirty && close()}>
      <SheetContent
        side="right"
        hideCloseButton
        className={`w-full gap-0 p-0 ${width}`}
        onEscapeKeyDown={guard}
        onPointerDownOutside={guard}
        onInteractOutside={guard}
      >
        {target && isChooser && (
          <ComposerChooser
            onClose={close}
            onPick={(preset) => setUrl(preset ? { preset: preset.id } : { preset: 'blank' })}
          />
        )}
        {target && isEditor && (target === 'new' || item) && (
          <CampaignComposer
            key={editorKey}
            initial={item ? draftFromItem(item, Date.now()) : presetDraft(url.preset)}
            displayState={item?.displayState ?? null}
            armRequest={armRequest}
            onClose={close}
            onDirtyChange={setDirty}
          />
        )}
        {target && target !== 'new' && !isEditor && <CampaignDetail campaignId={target} item={item} onClose={close} />}
      </SheetContent>
    </Sheet>
  )
}

function presetDraft(presetId: string | null) {
  const now = Date.now()
  const preset = findPreset(presetId)
  return preset ? draftFromPreset(preset, now) : blankDraft(now)
}
