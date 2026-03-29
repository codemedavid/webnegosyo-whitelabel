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
      const [tagsResult, itemTagsResult] = await Promise.all([
        getTagDefinitionsAction(tenantId),
        itemId ? getItemTagsAction(itemId, tenantId) : Promise.resolve({ success: true as const, data: [] }),
      ])

      if (tagsResult.success) setAllTags(tagsResult.data)
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
        const result = await setItemTagsAction(itemId, tenantId, tenantSlug, Array.from(next))
        if (!result.success) toast.error(result.error)
      })
    }
  }

  const handleAddCustomTag = () => {
    if (!newGroup.trim() || !newValue.trim()) return

    startTransition(async () => {
      const result = await createTagDefinitionAction(tenantId, tenantSlug, newGroup.trim(), newValue.trim())
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
