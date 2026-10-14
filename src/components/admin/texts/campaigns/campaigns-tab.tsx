'use client'

import { Button } from '@/components/ui/button'
import { EMPTY_FILTER_TEXT, filterCampaigns, filterCounts } from '@/lib/texts/view/campaigns'
import type { CampaignFilter } from '@/lib/texts/view/url'
import { RadioChips } from '../radio-chips'
import { useTexts } from '../texts-context'
import { CampaignEmpty } from './campaign-empty'
import { CampaignList } from './campaign-list'
import { SendingNowCard } from './sending-now-card'

const FILTERS: readonly { value: Exclude<CampaignFilter, 'archived'>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'done', label: 'Done' },
]

export function CampaignsTab() {
  const { campaigns, url, setUrl } = useTexts()
  const counts = filterCounts(campaigns)
  // Only archived campaigns left reads like a new store: offer the presets, keep the way to the archive.
  if (campaigns.length === counts.archived && url.filter !== 'archived') {
    return (
      <div className="space-y-6">
        <SendingNowCard />
        <CampaignEmpty />
        {counts.archived > 0 && (
          <Button type="button" variant="link" size="sm" className="min-h-11 px-0 sm:min-h-8" onClick={() => setUrl({ filter: 'archived' })}>
            Archived ({counts.archived})
          </Button>
        )}
      </div>
    )
  }
  const items = filterCampaigns(campaigns, url.filter)
  const isArchived = url.filter === 'archived'

  return (
    <div className="space-y-6">
      <SendingNowCard />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isArchived ? (
          <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onClick={() => setUrl({ filter: 'all' })}>
            ← All campaigns
          </Button>
        ) : (
          <RadioChips label="Show campaigns" options={FILTERS} value={url.filter} onChange={(filter) => setUrl({ filter })} />
        )}
        {!isArchived && counts.archived > 0 && (
          <Button type="button" variant="link" size="sm" className="min-h-11 px-0 sm:min-h-8" onClick={() => setUrl({ filter: 'archived' })}>
            Archived ({counts.archived})
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{EMPTY_FILTER_TEXT[url.filter]}</p>
      ) : (
        <CampaignList items={items} />
      )}
    </div>
  )
}
