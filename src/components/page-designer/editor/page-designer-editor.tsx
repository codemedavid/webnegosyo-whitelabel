'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { savePageLookAction } from '@/app/actions/page-designer'
import { generateBrandingCSS, getTenantBranding } from '@/lib/branding-utils'
import { EMPTY_LINK_CATALOG } from '@/lib/hero-builder/link-catalog'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { lookValues, previewLookRow, remainingLookChanges, type LookChanges, type PageLookInput } from '@/lib/page-designer/look'
import type { ConfirmationRedirectSetting } from '@/lib/page-designer/page-mode'
import type { PageId } from '@/lib/page-designer/types'
import { readStorefrontLabels } from '@/lib/storefront-labels'
import { HeroBuilderEditor } from '@/components/hero-builder/editor/hero-builder-editor'
import type { PageRuntime } from '@/components/hero-builder/renderer/page-runtime'

import { SAMPLE_BLOCKS, sampleTokens } from '../samples'
import { LookPanel } from './look-panel'
import { PageStylePanel } from './page-style-panel'
import { pageThemeStyle } from './page-theme'
import { buildPageSurface, type PendingLook } from './page-surfaces'
import { CheckoutFormProvider } from './form-editor/form-context'
import { withFormPublish } from './form-editor/form-publish'
import type { CheckoutFormSource } from './form-editor/use-checkout-form'
import { CHECKOUT_BLOCK_PANELS, useCheckoutFormSession } from './form-editor/use-checkout-form-session'
import { PageTabs } from './page-tabs'
import { RedirectSetting } from './redirect-setting'

export interface PageDesignerEditorProps {
  tenantId: string
  tenantSlug: string
  page: PageId
  storeName: string
  /**
   * The store row the page paints from (brand, checkout colours, order page
   * look, wording). The Look tab edits it; the canvas previews the edits.
   */
  storeRow: Readonly<Record<string, unknown>>
  initialDesign: HeroDesignV5 | null
  initialIsLive: boolean
  redirect: ConfirmationRedirectSetting
  /** Checkout only: the store's order types and their questions (the customer block's form editor). */
  checkoutForm?: CheckoutFormSource | null
}

const LIVE_PATH: Record<PageId, string> = { tracking: 'menu', confirmation: 'menu', checkout: 'checkout' }

/** An unsent Look survives a reload, like the design's own draft. */
function readLookDraft(key: string): LookChanges {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string' || typeof v === 'boolean')) as LookChanges
  } catch {
    return {}
  }
}

function writeLookDraft(key: string, changes: LookChanges): void {
  try {
    if (Object.keys(changes).length) window.localStorage.setItem(key, JSON.stringify(changes))
    else window.localStorage.removeItem(key)
  } catch {
    // Storage full or blocked — the draft is a convenience, saving still works.
  }
}

const sameValue = (a: unknown, b: unknown) => (a ?? '') === (b ?? '')

/** The page's Look: saved row, unsaved changes, and the row as the canvas should show it. */
function usePageLook(tenantId: string, page: PageId, storeRow: Readonly<Record<string, unknown>>) {
  const draftKey = `pd-look-${page}:${tenantId}`
  const [saved, setSaved] = useState(storeRow)
  const [changes, setChanges] = useState<LookChanges>({})
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const draft = readLookDraft(draftKey)
    if (Object.keys(draft).length) setChanges(draft)
  }, [draftKey])

  useEffect(() => {
    if (restored.current) writeLookDraft(draftKey, changes)
  }, [changes, draftKey])

  const savedValues = useMemo(() => lookValues(saved), [saved])
  const set = useCallback(
    (fieldId: string, value: string | boolean) =>
      setChanges((current) => {
        // Back to what is saved = no change.
        const rest = Object.fromEntries(Object.entries(current).filter(([id]) => id !== fieldId))
        return sameValue(value, savedValues[fieldId]) ? rest : { ...rest, [fieldId]: value }
      }),
    [savedValues],
  )
  const clear = useCallback((fieldId: string) => set(fieldId, ''), [set])
  const preview = useMemo(() => previewLookRow(saved, changes), [saved, changes])
  const input = useMemo<PageLookInput | undefined>(() => {
    const ids = Object.keys(changes)
    if (!ids.length) return undefined
    const base = Object.fromEntries(ids.map((id) => [id, (savedValues[id] ?? null) as string | boolean | null]))
    return { changes, base }
  }, [changes, savedValues])
  // Only what was sent is now saved; a colour changed during the round trip stays unsaved.
  const markSaved = useCallback((sent: LookChanges) => {
    setSaved((current) => previewLookRow(current, sent))
    setChanges((current) => remainingLookChanges(current, sent))
  }, [])

  return { saved, changes, preview, input, set, clear, discard: () => setChanges({}), markSaved }
}

/** The Hero Builder editor running as the Page Designer for one page. */
export function PageDesignerEditor({ tenantId, tenantSlug, page, storeName, storeRow, redirect, checkoutForm = null, ...editor }: PageDesignerEditorProps) {
  const look = usePageLook(tenantId, page, storeRow)
  const formSession = useCheckoutFormSession(tenantId, page === 'checkout' ? checkoutForm : null)
  const [isSavingLook, startSavingLook] = useTransition()
  const labels = useMemo(() => readStorefrontLabels(look.preview as Record<string, unknown>) as Record<string, string>, [look.preview])
  const brandStyle = useMemo(
    () => ({ ...generateBrandingCSS(getTenantBranding(look.preview as Record<string, unknown>)), ...pageThemeStyle(page, look.preview) }),
    [look.preview, page],
  )
  const runtime = useCallback(
    (state: string | null): PageRuntime => ({
      page,
      state,
      tokens: sampleTokens(page, storeName),
      labels,
      blocks: SAMPLE_BLOCKS[page],
      store: look.preview,
      blockPanels: page === 'checkout' && formSession.isEnabled ? CHECKOUT_BLOCK_PANELS : undefined,
    }),
    [page, storeName, labels, look.preview, formSession.isEnabled],
  )

  // Publish reads the Look at the moment it runs, so the surface stays stable.
  const pending = useRef<PendingLook | null>(null)
  pending.current = { input: look.input, onSaved: look.markSaved }
  const pendingForm = formSession.pending
  const surface = useMemo(
    () => withFormPublish(buildPageSurface(page, runtime, () => pending.current), page, () => pending.current, () => pendingForm.current),
    [page, runtime, pendingForm],
  )

  const saveLook = () =>
    startSavingLook(async () => {
      const sent = look.input
      if (!sent) return
      const result = await savePageLookAction(tenantId, page, sent)
      if (!result.success) {
        toast.error(result.error ?? 'Could not save the look')
        return
      }
      look.markSaved(sent.changes)
      toast.success('Look saved — it shows on your store now')
    })

  return (
    <CheckoutFormProvider value={formSession.context}>
    <HeroBuilderEditor
      // Each page keeps its own undo history and draft.
      key={page}
      {...editor}
      brandStyle={brandStyle}
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      linkCatalog={EMPTY_LINK_CATALOG}
      surface={surface}
      liveHref={`/${tenantSlug}/${LIVE_PATH[page]}`}
      look={{
        // Unsaved checkout questions publish with the page too.
        hasChanges: look.input !== undefined || formSession.form.hasChanges,
        panel: (api) => (
          <>
          <PageStylePanel api={api} />
          <LookPanel
            page={page}
            saved={look.saved}
            changes={look.changes}
            onChange={look.set}
            onClear={look.clear}
            onDiscard={look.discard}
            onSave={saveLook}
            isSaving={isSavingLook}
          />
          </>
        ),
      }}
      toolbarSlot={
        <>
          <PageTabs tenantSlug={tenantSlug} current={page} />
          {page === 'confirmation' && <RedirectSetting tenantId={tenantId} initial={redirect} />}
        </>
      }
    />
    </CheckoutFormProvider>
  )
}
