'use client'

import { useCallback, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ACTIVITY_FILTERS, emptyActivityText, groupByDay, type ActivityItem } from '@/lib/texts/view/activity'
import { RadioChips } from '../radio-chips'
import { DEMO_READONLY, runAction } from '../run-action'
import { useServerNow, useTexts } from '../texts-context'
import { useConfirm } from '../use-confirm'
import { ConfirmDialog } from '../confirm-dialog'
import { callAutomations } from '../automatic/call-automations'
import { recipeTitle } from '../automatic/automation-card'
import { ActivityRow } from './activity-row'
import { useActivity } from './use-activity'
import { useTextsActions } from '../texts-actions'

/** Every text and what became of it, newest first, a day at a time. */
export function ActivityTab() {
  const { tenantId, isDemo, url, setUrl, automations, campaigns, refresh } = useTexts()
  const now = useServerNow()
  const actions = useTextsActions()
  const { ask, dialogProps } = useConfirm()
  // Keyed on content, not the array: a page refresh hands over a new array, and must not drop loaded pages.
  const idsKey = automations.automations.map((a) => `${a.recipe}=${a.id}`).sort().join(',')
  const automationIdFor = useCallback(
    (recipe: string) => new Map(idsKey.split(',').map((pair) => pair.split('=') as [string, string])).get(recipe) ?? null,
    [idsKey]
  )
  const automaticWaiting = automations.automations.reduce((sum, a) => sum + a.stats.waiting, 0)
  const { state, loadMore, reload } = useActivity(tenantId, url.show, url.from, automationIdFor)
  const groups = useMemo(() => groupByDay(state.items, now), [state.items, now])

  const sourceOf = (item: ActivityItem): string => {
    if (item.recipe === 'campaign' || item.source === 'campaign') {
      return item.campaignName ?? campaigns.find((c) => c.id === item.campaignId)?.name ?? 'Campaign'
    }
    const info = automations.recipes.find((r) => r.id === item.recipe)
    return recipeTitle(item.recipe, info?.title ?? 'Automatic text')
  }

  const cancelAll = () => {
    if (isDemo) return void toast.info(DEMO_READONLY)
    ask({
      title: 'Cancel all waiting automatic texts?', body: 'They won’t be sent. Campaign texts are paused from the campaign instead.',
      cancelLabel: 'Keep them', confirmLabel: 'Cancel texts', isDestructive: true,
      onConfirm: async () => {
        const done = await runAction(() => callAutomations<{ cancelled: number }>(actions, tenantId, { action: 'cancel_waiting' }), "Couldn't cancel. Try again.")
        if (done) { toast.success(`${done.cancelled} ${done.cancelled === 1 ? 'text' : 'texts'} cancelled.`); reload(); refresh() }
      },
    })
  }

  const fromOptions = [
    { value: 'all', label: 'Everything' },
    { value: 'automatic', label: 'Automatic texts' },
    ...automations.automations.map((a) => ({ value: `auto:${a.recipe}`, label: recipeTitle(a.recipe, a.name) })),
    ...campaigns.filter((c) => c.delivery === 'server').map((c) => ({ value: `campaign:${c.id}`, label: c.name })),
  ]
  const empty = emptyActivityText(url.show)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RadioChips label="Show texts" size="segmented" options={ACTIVITY_FILTERS} value={url.show} onChange={(show) => setUrl({ show })} />
        <label className="flex items-center gap-2 text-sm text-wn-stone">
          From
          <select value={url.from ?? 'all'} onChange={(event) => setUrl({ from: event.target.value === 'all' ? null : event.target.value })}
            className="h-11 max-w-[220px] rounded-full border border-wn-line bg-white px-3 text-sm text-foreground shadow-sm sm:h-9">
            {fromOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {automaticWaiting > 0 && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" className="min-h-11 rounded-full text-wn-stone hover:text-red-700 sm:min-h-8" onClick={cancelAll}>Cancel all waiting automatic texts</Button>
        </div>
      )}
      {state.status === 'loading' && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading texts…</p>
      )}
      {state.status === 'error' && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
          <span className="flex-1">Couldn&apos;t load your texts.</span>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={reload}>Try again</Button>
        </div>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="font-semibold">{empty.title}</p>
          {empty.body && <p className="mt-1 text-sm text-muted-foreground">{empty.body}</p>}
        </div>
      )}
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="space-y-1">
          <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-wn-stone">{group.label}</h3>
          <ul className="divide-y divide-wn-line rounded-2xl border border-wn-line bg-white px-4 shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
            {group.items.map((item) => <ActivityRow key={item.id} item={item} source={sourceOf(item)} now={now} />)}
          </ul>
        </section>
      ))}
      {state.nextCursor && (
        <Button type="button" variant="outline" className="min-h-11 w-full sm:min-h-9" disabled={state.isLoadingMore} onClick={() => void loadMore()}>
          {state.isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
        </Button>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
