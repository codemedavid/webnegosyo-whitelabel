'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, X, Tag } from 'lucide-react'
import { toast } from 'sonner'
import type { TagDefinition } from '@/types/database'
import {
  getTagDefinitionsAction,
  getItemTagsAction,
  setItemTagsAction,
  createTagDefinitionAction,
} from '@/app/actions/tags'
import { runServerAction } from '@/components/admin/server-action-safety'

interface TagManagerProps {
  itemId: string | null
  tenantId: string
  tenantSlug: string
  onChange?: (tagIds: string[]) => void
}

export function TagManager({ itemId, tenantId, tenantSlug, onChange }: TagManagerProps) {
  const [allTags, setAllTags] = useState<TagDefinition[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [newValue, setNewValue] = useState('')

  const grouped = useMemo(() => {
    const map = new Map<string, TagDefinition[]>()
    for (const tag of allTags) {
      const group = map.get(tag.group_name) || []
      group.push(tag)
      map.set(tag.group_name, group)
    }
    return map
  }, [allTags])

  useEffect(() => {
    startTransition(async () => {
      /*
       * These two Server Action POSTs are the menu editor's only mount-time
       * round trips, and they are the ones a navigation races: leaving the
       * editor moves the router's canonical URL out from under the in-flight
       * action, the answer is no longer an RSC payload, and Next rejects the
       * promise. Unguarded, that rejection escaped this transition and was
       * reported as an unhandled crash with the merchant told nothing.
       */
      const outcome = await runServerAction(() =>
        Promise.all([
          getTagDefinitionsAction(tenantId),
          itemId ? getItemTagsAction(itemId, tenantId) : Promise.resolve({ success: true as const, data: [] }),
        ])
      )

      if (!outcome.ok) {
        // A read cut short by a backgrounded tab or a navigation away costs
        // the merchant nothing, so it is not worth a toast; anything else is.
        if (outcome.kind !== 'aborted') toast.error(outcome.message)
        return
      }

      const [tagsResult, itemTagsResult] = outcome.value
      if (tagsResult.success) setAllTags(tagsResult.data)
      else toast.error(tagsResult.error)
      if (itemTagsResult.success && 'data' in itemTagsResult) {
        setSelectedIds(new Set(itemTagsResult.data.map((t: TagDefinition) => t.id)))
      }
    })
  }, [tenantId, itemId])

  const toggleTag = (tagId: string) => {
    const next = new Set(selectedIds)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    setSelectedIds(next)

    if (onChange) {
      onChange(Array.from(next))
    } else if (itemId) {
      startTransition(async () => {
        const outcome = await runServerAction(() =>
          setItemTagsAction(itemId, tenantId, tenantSlug, Array.from(next))
        )
        // A write that did not land is always worth saying out loud, abort or
        // not: the badge already moved, so silence would misreport it as saved.
        if (!outcome.ok) {
          toast.error(outcome.message)
          setSelectedIds(selectedIds)
          return
        }
        if (!outcome.value.success) {
          toast.error(outcome.value.error)
          setSelectedIds(selectedIds)
        }
      })
    }
  }

  const handleAddCustomTag = () => {
    if (!newGroup.trim() || !newValue.trim()) return

    startTransition(async () => {
      const outcome = await runServerAction(() =>
        createTagDefinitionAction(tenantId, tenantSlug, newGroup.trim(), newValue.trim())
      )
      if (!outcome.ok) {
        toast.error(outcome.message)
        return
      }
      const result = outcome.value
      if (result.success) {
        setAllTags(prev => [...prev, result.data])
        setNewGroup('')
        setNewValue('')
        setShowAdd(false)
        toast.success('Tag created')
      } else {
        toast.error(result.error)
      }
    })
  }

  const existingGroups = useMemo(() => Array.from(grouped.keys()), [grouped])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Tags
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          disabled={isPending}
        >
          <Plus className="h-3 w-3 mr-1" />
          Custom Tag
        </Button>
      </div>

      {Array.from(grouped.entries()).map(([groupName, tags]) => (
        <div key={groupName} className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium">{groupName}</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant={selectedIds.has(tag.id) ? 'default' : 'outline'}
                className="cursor-pointer select-none transition-colors"
                onClick={() => toggleTag(tag.id)}
              >
                {tag.tag_value}
                {selectedIds.has(tag.id) && (
                  <X className="h-3 w-3 ml-1" />
                )}
              </Badge>
            ))}
          </div>
        </div>
      ))}

      {allTags.length === 0 && !isPending && (
        <p className="text-xs text-muted-foreground">No tags available</p>
      )}

      {showAdd && (
        <div className="flex gap-2 items-end border rounded-md p-3 bg-muted/30">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Group</Label>
            <Select value={newGroup} onValueChange={setNewGroup}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select or type..." />
              </SelectTrigger>
              <SelectContent>
                {existingGroups.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
                <SelectItem value="__custom__">+ New Group...</SelectItem>
              </SelectContent>
            </Select>
            {newGroup === '__custom__' && (
              <Input
                className="h-8 text-xs mt-1"
                placeholder="Group name"
                onChange={(e) => setNewGroup(e.target.value === '' ? '__custom__' : e.target.value)}
              />
            )}
          </div>
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Value</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. crispy"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={handleAddCustomTag}
            disabled={isPending || !newGroup.trim() || !newValue.trim() || newGroup === '__custom__'}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
