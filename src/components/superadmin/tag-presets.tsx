'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Tag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TagDefinition } from '@/types/database'
import { getPresetTagsAction, createPresetTagAction, deletePresetTagAction } from '@/app/actions/tags'
import { Panel, SectionHeader, EmptyState } from '@/components/superadmin/ui/primitives'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-11 rounded-xl border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/35 focus-visible:border-white/25 focus-visible:ring-white/10'

export function TagPresetsManager() {
  const [tags, setTags] = useState<TagDefinition[]>([])
  const [isPending, startTransition] = useTransition()
  const [isLoaded, setIsLoaded] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [newValue, setNewValue] = useState('')

  const grouped = useMemo(() => {
    const map = new Map<string, TagDefinition[]>()
    for (const tag of tags) {
      const group = map.get(tag.group_name) || []
      group.push(tag)
      map.set(tag.group_name, group)
    }
    return map
  }, [tags])

  useEffect(() => {
    startTransition(async () => {
      const result = await getPresetTagsAction()
      if (result.success) setTags(result.data)
      setIsLoaded(true)
    })
  }, [])

  const handleAdd = () => {
    if (!newGroup.trim() || !newValue.trim()) return
    startTransition(async () => {
      const result = await createPresetTagAction(newGroup.trim(), newValue.trim())
      if (result.success) {
        setTags((prev) => [...prev, result.data])
        setNewValue('')
        toast.success('Preset tag added')
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deletePresetTagAction(id)
      if (result.success) {
        setTags((prev) => prev.filter((t) => t.id !== id))
        toast.success('Tag deleted')
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  const canAdd = !!newGroup.trim() && !!newValue.trim()
  const isLoadingInitial = !isLoaded && isPending

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-white/[0.06] p-6">
        <SectionHeader
          icon={Tag}
          title="Platform Tag Presets"
          subtitle="Reusable tag values offered to merchants across the platform"
          action={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/55">
                {grouped.size} group{grouped.size === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/55">
                {tags.length} value{tags.length === 1 ? '' : 's'}
              </span>
            </div>
          }
        />
      </div>

      <div className="space-y-5 p-6">
        {isLoadingInitial && (
          <div className="space-y-5">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded-full bg-white/[0.06]" />
                <div className="flex flex-wrap gap-2">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="h-7 w-20 animate-pulse rounded-full bg-white/[0.06]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoadingInitial && grouped.size === 0 && (
          <EmptyState
            icon={Tag}
            title="No preset tags yet"
            description="Add your first group and value below to make it available to merchants."
          />
        )}

        {Array.from(grouped.entries()).map(([groupName, groupTags]) => (
          <div
            key={groupName}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/55">
                {groupName}
              </span>
              <span className="text-[10px] font-medium text-white/30">
                {groupTags.length} value{groupTags.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {groupTags.map((tag) => (
                <span
                  key={tag.id}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] py-1 pl-3 pr-1.5 text-xs font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                >
                  {tag.tag_value}
                  <button
                    onClick={() => handleDelete(tag.id)}
                    aria-label={`Delete tag ${tag.tag_value}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                    disabled={isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/45">
            Add a preset tag
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="preset-group" className="text-xs text-white/60">
                Group
              </Label>
              <Input
                id="preset-group"
                className={fieldClass}
                placeholder="e.g. Flavor Profile"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isPending}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="preset-value" className="text-xs text-white/60">
                Value
              </Label>
              <Input
                id="preset-value"
                className={fieldClass}
                placeholder="e.g. bitter"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isPending}
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={isPending || !canAdd}
              className={cn('h-11 rounded-xl bg-white text-black hover:bg-white/90')}
            >
              {isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              Add
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}
