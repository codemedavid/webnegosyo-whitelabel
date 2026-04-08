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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Plus, MoreVertical, Pencil, Trash2, ChevronRight, X, GitBranch, Tag, FolderOpen } from 'lucide-react'
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
      <div className="space-y-6">
        <div className="h-9 w-44 bg-muted animate-pulse rounded-md" />
        <Card>
          <CardHeader>
            <div className="h-5 w-28 bg-muted animate-pulse rounded" />
            <div className="h-4 w-48 bg-muted animate-pulse rounded mt-1" />
          </CardHeader>
          <CardContent className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-10 bg-muted animate-pulse rounded-full" />
                </div>
                <div className="border-t border-border/50 px-4 py-3 flex items-center gap-3">
                  <div className="h-8 w-28 bg-muted animate-pulse rounded-md" />
                  <div className="h-3 w-3 bg-muted animate-pulse rounded" />
                  <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
                  <div className="h-8 w-20 bg-muted animate-pulse rounded-md" />
                </div>
                <div className="border-t border-border/50 px-4 py-2.5 flex justify-between">
                  <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Create Button */}
      <Button onClick={openAddDialog} disabled={isPending} className="w-full sm:w-auto">
        <Plus className="mr-2 h-4 w-4" />
        Create Pairing Rule
      </Button>

      {/* Rules List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Pairing Rules</CardTitle>
              <CardDescription className="mt-1">
                {rules.length} rule{rules.length !== 1 ? 's' : ''} &middot; Auto-suggest items when customers add to cart
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 && hasLoaded ? (
            <div className="py-12 text-center">
              <GitBranch className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No pairing rules configured yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create your first rule to automatically suggest items when customers shop.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Platform defaults */}
              {platformRules.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Platform Defaults</span>
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
                  {platformRules.length > 0 && (
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Your Rules</span>
                  )}
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
            </div>
          )}
        </CardContent>
      </Card>

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
  const SourceIcon = rule.source_type === 'category' ? FolderOpen : Tag

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      rule.is_active
        ? 'border-primary/20 bg-primary/[0.02]'
        : 'border-border bg-muted/20 opacity-60'
    )}>
      {/* Header: name + controls */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-medium truncate">{rule.name}</span>
          {isPlatform && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              Platform
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={rule.is_active}
            onCheckedChange={onToggle}
          />
          {!isPlatform && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
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

      {/* Flow: Source → Targets */}
      <div className="border-t border-border/50 px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Source */}
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 shrink-0">
            <SourceIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{sourceLabel}</span>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />

          {/* Targets */}
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {rule.targets.map((target) => {
              const targetLabel = target.target_type === 'category'
                ? target.target_category?.name || 'Unknown'
                : target.target_tag?.tag_value || 'Unknown'
              const itemCount = target.selection_mode === 'handpick' && target.items.length > 0
                ? target.items.length
                : null

              return (
                <div
                  key={target.id}
                  className="flex items-center gap-1.5 rounded-md bg-muted/50 px-3 py-2"
                >
                  <span className="text-xs font-medium">{targetLabel}</span>
                  {itemCount !== null ? (
                    <span className="text-[10px] text-muted-foreground">{itemCount}</span>
                  ) : target.selection_mode === 'any' ? (
                    <span className="text-[10px] text-muted-foreground">all</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer: item preview + metadata */}
      {(totalItems > 0 || rule.max_suggestions) && (
        <div className="border-t border-border/50 px-4 py-2.5 flex items-center justify-between gap-3">
          {totalItems > 0 ? (
            <p className="text-xs text-muted-foreground truncate">
              {rule.targets.flatMap((t) => t.items).slice(0, 4).map((i) => i.name).join(', ')}
              {totalItems > 4 ? ` +${totalItems - 4} more` : ''}
            </p>
          ) : (
            <span />
          )}
          <span className="text-[11px] text-muted-foreground shrink-0">
            Max {rule.max_suggestions} suggestion{rule.max_suggestions !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
