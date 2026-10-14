'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { withoutHeroDuplicates } from '@/lib/texts/attention'
import type { TextsPageData, TextsTab } from '@/lib/texts/types'
import { TextsProvider, type TextsContextValue } from './texts-context'
import { useTextsLive, liveKey } from './use-texts-live'
import { useTextsUrl } from './use-texts-url'
import { TextsHeader } from './texts-header'
import { PhoneStatusHero } from './phone-status-hero'
import { NeedsAttentionStrip } from './needs-attention-strip'
import { CampaignsTab } from './campaigns/campaigns-tab'
import { CampaignActionsProvider } from './campaigns/campaign-actions'
import { AutomaticTab } from './automatic/automatic-tab'
import { ActivityTab } from './activity/activity-tab'
import { RulesTab } from './rules/rules-tab'
import { PhonesSheet } from './phones/phones-sheet'
import { CampaignSheet } from './campaigns/campaign-sheet'
import { AutomationEditorSheet } from './automatic/automation-editor-sheet'

const TABS: readonly { value: TextsTab; label: string }[] = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'activity', label: 'Activity' },
  { value: 'rules', label: 'Rules' },
]

/** The page re-reads itself when a run opens or closes, so the list's states follow the live strip. */
function useRefreshOnRunChange(progress: Record<string, unknown>, refresh: () => void) {
  const runIds = Object.keys(progress).sort().join(',')
  const last = useRef(runIds)
  useEffect(() => {
    if (last.current === runIds) return
    last.current = runIds
    refresh()
  }, [runIds, refresh])
}

/**
 * The Texts page: header with the 30-day result line, the phone hero and
 * what needs attention on every tab, then Campaigns · Automatic · Activity ·
 * Rules. Every create/edit/report opens in a right-hand sheet; all of it is
 * in the URL.
 */
export function TextsWorkspace({ data, downloadUrl }: { data: TextsPageData; downloadUrl: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { url, setUrl, go } = useTextsUrl()
  const liveQuery = useTextsLive(data.tenantId, data.live, url.phones)

  const refresh = useCallback(() => {
    router.refresh()
    void queryClient.invalidateQueries({ queryKey: liveKey(data.tenantId) })
  }, [router, queryClient, data.tenantId])
  const rerender = useCallback(() => router.refresh(), [router])
  useRefreshOnRunChange(liveQuery.data.progress, rerender)

  const value = useMemo<TextsContextValue>(() => ({
    tenantId: data.tenantId,
    tenantSlug: data.tenantSlug,
    storeName: data.storeName,
    isOwner: data.isOwner,
    isDemo: data.isDemo,
    optOutLine: data.automations.settings.optOutLine ?? data.optOutLine,
    downloadUrl,
    live: liveQuery.data,
    isLiveStale: liveQuery.isError,
    campaigns: data.campaigns,
    automations: data.automations,
    rules: data.automations.settings,
    url,
    setUrl,
    go,
    refresh,
  }), [data, downloadUrl, liveQuery.data, liveQuery.isError, url, setUrl, go, refresh])

  const heroState = liveQuery.isError ? 'unknown' : liveQuery.data.sender.heroState
  const attention = withoutHeroDuplicates(liveQuery.data.attention, heroState)
  const isCompactHero = url.tab === 'activity' || url.tab === 'rules'

  return (
    <TextsProvider value={value}>
      <CampaignActionsProvider>
        <div className="mx-auto max-w-5xl space-y-8 pb-16">
          <TextsHeader thirtyDays={data.thirtyDays} />
          <div className="space-y-3">
            <PhoneStatusHero isCompact={isCompactHero} onRetry={() => void liveQuery.refetch()} />
            <NeedsAttentionStrip items={attention} />
          </div>
          <Tabs value={url.tab} onValueChange={(tab) => setUrl({ tab: tab as TextsTab, automatic: null })} className="gap-6">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TabsList className="h-11 sm:h-9">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="px-4">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
            <TabsContent value="automatic"><AutomaticTab /></TabsContent>
            <TabsContent value="activity"><ActivityTab /></TabsContent>
            {/* Mounted always (hidden when inactive) so unsaved rule edits survive a tab switch. */}
            <TabsContent value="rules" forceMount className="data-[state=inactive]:hidden"><RulesTab /></TabsContent>
          </Tabs>
        </div>
        <CampaignSheet />
        <PhonesSheet />
        <AutomationEditorSheet />
      </CampaignActionsProvider>
    </TextsProvider>
  )
}
