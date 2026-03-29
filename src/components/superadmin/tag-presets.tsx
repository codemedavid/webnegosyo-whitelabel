'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Tag } from 'lucide-react'
import { toast } from 'sonner'
import type { TagDefinition } from '@/types/database'
import { getPresetTagsAction, createPresetTagAction, deletePresetTagAction } from '@/app/actions/tags'

export function TagPresetsManager() {
  const [tags, setTags] = useState<TagDefinition[]>([])
  const [isPending, startTransition] = useTransition()
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Platform Tag Presets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from(grouped.entries()).map(([groupName, groupTags]) => (
          <div key={groupName} className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{groupName}</span>
            <div className="flex flex-wrap gap-1.5">
              {groupTags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="gap-1">
                  {tag.tag_value}
                  <button
                    onClick={() => handleDelete(tag.id)}
                    className="ml-1 hover:text-destructive"
                    disabled={isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ))}

        <div className="flex gap-2 items-end border-t pt-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Group</Label>
            <Input
              className="h-8 text-sm"
              placeholder="e.g. Flavor Profile"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Value</Label>
            <Input
              className="h-8 text-sm"
              placeholder="e.g. bitter"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8" onClick={handleAdd} disabled={isPending || !newGroup.trim() || !newValue.trim()}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
