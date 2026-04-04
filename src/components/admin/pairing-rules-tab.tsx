'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Pencil, Trash2, ArrowRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type {
  Category,
  MenuItem,
  TagDefinition,
  PairingRuleWithDetails,
} from '@/types/database'
import {
  getPairingRulesAction,
  createPairingRuleAction,
  updatePairingRuleAction,
  togglePairingRuleAction,
  deletePairingRuleAction,
} from '@/app/actions/pairing-rules'
import { getTagDefinitionsAction } from '@/app/actions/tags'
import { RuleItemPicker } from '@/components/admin/rule-item-picker'

interface TargetDraft {
  targetType: 'category' | 'tag'
  targetCategoryId?: string
  targetTagId?: string
  selectionMode: 'handpick' | 'any'
  selectedItemIds: Set<string>
}

interface PairingRulesTabProps {
  tenantId: string
  tenantSlug: string
  categories: Category[]
  menuItems: MenuItem[]
  initialRules?: PairingRuleWithDetails[]
  initialTags?: TagDefinition[]
}

export function PairingRulesTab({
  tenantId,
  tenantSlug,
  categories,
  menuItems,
  initialRules,
  initialTags,
}: PairingRulesTabProps) {
  const [rules, setRules] = useState<PairingRuleWithDetails[]>(initialRules ?? [])
  const [tags, setTags] = useState<TagDefinition[]>(initialTags ?? [])
  const [isPending, startTransition] = useTransition()
  const [hasLoaded, setHasLoaded] = useState(!!initialRules)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<PairingRuleWithDetails | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState<'category' | 'tag'>('category')
  const [sourceCategoryId, setSourceCategoryId] = useState('')
  const [sourceTagId, setSourceTagId] = useState('')
  const [maxSuggestions, setMaxSuggestions] = useState(4)
  const [targets, setTargets] = useState<TargetDraft[]>([])

  // Item picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number>(-1)

  const loadData = useCallback(() => {
    startTransition(async () => {
      const [rulesResult, tagsResult] = await Promise.all([
        getPairingRulesAction(tenantId),
        getTagDefinitionsAction(tenantId),
      ])
      if (rulesResult.success) setRules(rulesResult.data)
      if (tagsResult.success) setTags(tagsResult.data)
      setHasLoaded(true)
    })
  }, [tenantId])

  // Only fetch on mount if no initial data was provided
  useEffect(() => {
    if (!initialRules) loadData()
  }, [loadData, initialRules])

  const resetForm = () => {
    setName('')
    setSourceType('category')
    setSourceCategoryId('')
    setSourceTagId('')
    setMaxSuggestions(4)
    setTargets([])
    setEditingRule(null)
  }

  const openAddDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (rule: PairingRuleWithDetails) => {
    setEditingRule(rule)
    setName(rule.name)
    setSourceType(rule.source_type)
    setSourceCategoryId(rule.source_category_id || '')
    setSourceTagId(rule.source_tag_id || '')
    setMaxSuggestions(rule.max_suggestions)
    setTargets(
      rule.targets.map((t) => ({
        targetType: t.target_type,
        targetCategoryId: t.target_category_id || undefined,
        targetTagId: t.target_tag_id || undefined,
        selectionMode: t.selection_mode,
        selectedItemIds: new Set(t.items.map((i) => i.id)),
      }))
    )
    setDialogOpen(true)
  }

  const addTarget = () => {
    if (targets.length >= 3) return
    setTargets([...targets, { targetType: 'category', selectionMode: 'handpick', selectedItemIds: new Set() }])
  }

  const removeTarget = (index: number) => {
    setTargets(targets.filter((_, i) => i !== index))
  }

  const updateTarget = (index: number, updates: Partial<TargetDraft>) => {
    setTargets(targets.map((t, i) => i === index ? { ...t, ...updates } : t))
  }

  const openPicker = (index: number) => {
    setPickerTargetIndex(index)
    setPickerOpen(true)
  }

  const getItemsForTarget = (target: TargetDraft): MenuItem[] => {
    if (target.targetType === 'category' && target.targetCategoryId) {
      return menuItems.filter((i) => i.category_id === target.targetCategoryId)
    }
    return []
  }

  const getTargetLabel = (target: TargetDraft): string => {
    if (target.targetType === 'category' && target.targetCategoryId) {
      return categories.find((c) => c.id === target.targetCategoryId)?.name || 'Unknown'
    }
    if (target.targetType === 'tag' && target.targetTagId) {
      const tag = tags.find((t) => t.id === target.targetTagId)
      return tag ? `${tag.group_name}: ${tag.tag_value}` : 'Unknown'
    }
    return 'Select...'
  }

  const handleSave = () => {
    if (!name.trim()) { toast.error('Rule name is required'); return }
    if (sourceType === 'category' && !sourceCategoryId) { toast.error('Select a source category'); return }
    if (sourceType === 'tag' && !sourceTagId) { toast.error('Select a source tag'); return }
    if (targets.length === 0) { toast.error('Add at least one target category'); return }

    const input = {
      name,
      sourceType,
      sourceCategoryId: sourceType === 'category' ? sourceCategoryId : undefined,
      sourceTagId: sourceType === 'tag' ? sourceTagId : undefined,
      maxSuggestions,
      targets: targets.map((t) => ({
        targetType: t.targetType,
        targetCategoryId: t.targetType === 'category' ? t.targetCategoryId : undefined,
        targetTagId: t.targetType === 'tag' ? t.targetTagId : undefined,
        selectionMode: t.selectionMode,
        itemIds: t.selectionMode === 'handpick' ? Array.from(t.selectedItemIds) : undefined,
      })),
    }

    startTransition(async () => {
      const result = editingRule
        ? await updatePairingRuleAction(editingRule.id, tenantId, tenantSlug, input)
        : await createPairingRuleAction(tenantId, tenantSlug, input)

      if (result.success) {
        toast.success(editingRule ? 'Rule updated' : 'Rule created')
        setDialogOpen(false)
        resetForm()
        loadData()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleToggle = (ruleId: string, isActive: boolean) => {
    startTransition(async () => {
      const result = await togglePairingRuleAction(ruleId, tenantSlug, isActive)
      if (result.success) loadData()
      else toast.error(result.error)
    })
  }

  const handleDelete = (ruleId: string) => {
    startTransition(async () => {
      const result = await deletePairingRuleAction(ruleId, tenantId, tenantSlug)
      if (result.success) {
        toast.success('Rule deleted')
        loadData()
      } else {
        toast.error(result.error)
      }
    })
  }

  const platformRules = rules.filter((r) => r.tenant_id === null)
  const tenantRules = rules.filter((r) => r.tenant_id !== null)

  // Show skeleton while loading (no initial data and fetch in progress)
  if (!hasLoaded && isPending) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Pairing Rules</h3>
            <p className="text-xs text-muted-foreground">Automatic suggestions based on category and tags</p>
          </div>
          <div className="h-9 w-24 bg-muted animate-pulse rounded-md" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-6 w-16 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-28 bg-muted animate-pulse rounded-full" />
              <div className="h-3 w-3 bg-muted animate-pulse rounded" />
              <div className="h-5 w-24 bg-muted animate-pulse rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Pairing Rules</h3>
          <p className="text-xs text-muted-foreground">Automatic suggestions based on category and tags</p>
        </div>
        <Button size="sm" onClick={openAddDialog} disabled={isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {/* Platform defaults */}
      {platformRules.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Platform Defaults</span>
          {platformRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              isPlatform
              onToggle={(active) => handleToggle(rule.id, active)}
              categories={categories}
              tags={tags}
              menuItems={menuItems}
            />
          ))}
        </div>
      )}

      {/* Tenant rules */}
      {tenantRules.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Your Rules</span>
          {tenantRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              isPlatform={false}
              onToggle={(active) => handleToggle(rule.id, active)}
              onEdit={() => openEditDialog(rule)}
              onDelete={() => handleDelete(rule.id)}
              categories={categories}
              tags={tags}
              menuItems={menuItems}
            />
          ))}
        </div>
      )}

      {rules.length === 0 && hasLoaded && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No pairing rules yet. Add one to automatically suggest items when customers shop.
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Rules are checked in order: Manual Pairs → Category Rules → Tag Rules → Smart BCG
      </p>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rule Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drinks with Chicken" />
            </div>

            {/* Source */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">When customer adds item from...</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={sourceType === 'category' ? 'default' : 'outline'}
                  onClick={() => setSourceType('category')}
                >
                  Category
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sourceType === 'tag' ? 'default' : 'outline'}
                  onClick={() => setSourceType('tag')}
                >
                  Tag
                </Button>
              </div>
              {sourceType === 'category' ? (
                <Select value={sourceCategoryId} onValueChange={setSourceCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={sourceTagId} onValueChange={setSourceTagId}>
                  <SelectTrigger><SelectValue placeholder="Select tag..." /></SelectTrigger>
                  <SelectContent>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.group_name}: {t.tag_value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Arrow */}
            <div className="text-center text-muted-foreground text-sm">↓ suggest items from</div>

            {/* Targets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Target Categories (1-3)</Label>
              {targets.map((target, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeTarget(index)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={target.targetType === 'category' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { targetType: 'category', targetTagId: undefined })}
                    >
                      Category
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={target.targetType === 'tag' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { targetType: 'tag', targetCategoryId: undefined })}
                    >
                      Tag
                    </Button>
                  </div>

                  {target.targetType === 'category' ? (
                    <Select
                      value={target.targetCategoryId || ''}
                      onValueChange={(v) => updateTarget(index, { targetCategoryId: v, selectedItemIds: new Set() })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={target.targetTagId || ''}
                      onValueChange={(v) => updateTarget(index, { targetTagId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select tag..." /></SelectTrigger>
                      <SelectContent>
                        {tags.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.group_name}: {t.tag_value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Selection mode */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={target.selectionMode === 'handpick' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { selectionMode: 'handpick' })}
                      className="flex-1 text-xs"
                    >
                      Handpick Items
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={target.selectionMode === 'any' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { selectionMode: 'any' })}
                      className="flex-1 text-xs"
                    >
                      Any from Category
                    </Button>
                  </div>

                  {/* Handpicked items */}
                  {target.selectionMode === 'handpick' && target.targetType === 'category' && target.targetCategoryId && (
                    <div>
                      {target.selectedItemIds.size > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {Array.from(target.selectedItemIds).map((id) => {
                            const item = menuItems.find((i) => i.id === id)
                            return item ? (
                              <Badge key={id} variant="secondary" className="text-[10px]">
                                {item.name}
                              </Badge>
                            ) : null
                          })}
                        </div>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={() => openPicker(index)} className="w-full text-xs">
                        {target.selectedItemIds.size > 0
                          ? `Change items (${target.selectedItemIds.size} selected)`
                          : 'Pick items...'
                        }
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {targets.length < 3 && (
                <button
                  type="button"
                  onClick={addTarget}
                  className="w-full border border-dashed rounded-lg p-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  + Add Category (optional, max 3)
                </button>
              )}
            </div>

            {/* Max suggestions */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Max suggestions shown</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={maxSuggestions}
                onChange={(e) => setMaxSuggestions(Number(e.target.value))}
                className="w-24"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end border-t pt-4">
              <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false) }}>Cancel</Button>
              <Button onClick={handleSave} disabled={isPending}>
                {editingRule ? 'Save Changes' : 'Save Rule'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Picker */}
      {pickerTargetIndex >= 0 && pickerTargetIndex < targets.length && (
        <RuleItemPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          categoryName={getTargetLabel(targets[pickerTargetIndex])}
          items={getItemsForTarget(targets[pickerTargetIndex])}
          selectedIds={targets[pickerTargetIndex].selectedItemIds}
          onSelectionChange={(ids) => updateTarget(pickerTargetIndex, { selectedItemIds: ids })}
        />
      )}
    </div>
  )
}

// ============================================================
// RuleRow — single rule in the list
// ============================================================

function RuleRow({
  rule,
  isPlatform,
  onToggle,
  onEdit,
  onDelete,
  categories,
  tags,
}: {
  rule: PairingRuleWithDetails
  isPlatform: boolean
  onToggle: (active: boolean) => void
  onEdit?: () => void
  onDelete?: () => void
  categories: Category[]
  tags: TagDefinition[]
  menuItems: MenuItem[]
}) {
  const sourceLabel = rule.source_type === 'category'
    ? categories.find((c) => c.id === rule.source_category_id)?.name || 'Unknown'
    : tags.find((t) => t.id === rule.source_tag_id)
      ? `${tags.find((t) => t.id === rule.source_tag_id)!.tag_value}`
      : 'Unknown'

  const totalItems = rule.targets.reduce((sum, t) => sum + t.items.length, 0)

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            rule.is_active ? 'bg-green-500' : 'bg-amber-500'
          )} />
          <span className="text-sm font-medium">{rule.name}</span>
          {isPlatform && (
            <Badge variant="outline" className="text-[10px] bg-indigo-950/40 text-indigo-400 border-indigo-800">
              PLATFORM
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {totalItems > 0 ? `${totalItems} items · ` : ''}Max {rule.max_suggestions}
          </span>
          {isPlatform ? (
            <Switch
              checked={rule.is_active}
              onCheckedChange={onToggle}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-3 w-3 mr-2" /> Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-3 w-3 mr-2" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Source → Targets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge
          variant="outline"
          className={cn(
            'text-[11px]',
            rule.source_type === 'category'
              ? 'bg-blue-950/40 text-blue-400 border-blue-800'
              : 'bg-red-950/40 text-red-400 border-red-800'
          )}
        >
          {rule.source_type === 'category' ? 'Category' : 'Tag'}: {sourceLabel}
        </Badge>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        {rule.targets.map((target) => {
          const targetLabel = target.target_type === 'category'
            ? target.target_category?.name || 'Unknown'
            : target.target_tag?.tag_value || 'Unknown'

          return (
            <Badge
              key={target.id}
              variant="outline"
              className="text-[11px] bg-green-950/40 text-green-400 border-green-800"
            >
              {targetLabel}
              {target.selection_mode === 'handpick' && target.items.length > 0
                ? ` (${target.items.length} picked)`
                : target.selection_mode === 'any' ? ' (any)' : ''
              }
            </Badge>
          )
        })}
      </div>

      {/* Item names preview */}
      {totalItems > 0 && (
        <div className="flex flex-wrap gap-1">
          {rule.targets.flatMap((t) => t.items).slice(0, 6).map((item) => (
            <span key={item.id} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {item.name}
            </span>
          ))}
          {totalItems > 6 && (
            <span className="text-[10px] text-muted-foreground">+{totalItems - 6} more</span>
          )}
        </div>
      )}
    </div>
  )
}
