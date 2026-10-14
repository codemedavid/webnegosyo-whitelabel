'use client'

import { Archive, ArchiveRestore, Copy, Eye, MoreHorizontal, Pause, Pencil, Play, Send, Trash2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { CampaignListItem } from '@/lib/texts/types'
import { actionLabel, campaignActions, type CampaignAction } from '@/lib/texts/view/campaigns'
import { useCampaignActions } from './campaign-actions'

const ICONS: Record<CampaignAction, LucideIcon> = {
  view: Eye, edit: Pencil, pause: Pause, resume: Play, duplicate: Copy, delete: Trash2,
  archive: Archive, unarchive: ArchiveRestore, switch_to_automatic: Send,
}

export function CampaignRowMenu({ item }: { item: CampaignListItem }) {
  const run = useCampaignActions()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 sm:size-9"
          aria-label={`Actions for ${item.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {campaignActions(item).map((action) => {
          const Icon = ICONS[action]
          return (
            <DropdownMenuItem key={action} variant={action === 'delete' ? 'destructive' : 'default'} onSelect={() => run(action, item)}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {actionLabel(action, item)}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
