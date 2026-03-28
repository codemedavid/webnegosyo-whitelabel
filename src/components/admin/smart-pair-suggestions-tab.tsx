'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  Sparkles,
  Loader2,
  Check,
  X,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  ShoppingBag,
  Lightbulb,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import {
  generateSmartPairSuggestionsAction,
  acceptPairSuggestionAction,
  bulkAcceptPairSuggestionsAction,
} from '@/app/actions/menu-engineering'
import { STRATEGY_MERCHANT_LABELS } from '@/lib/bcg-labels'
import type { MenuItem } from '@/types/database'

interface PairSuggestion {
  sourceItem: MenuItem
  targetItem: MenuItem
  strategy: string
  reason: string
}

interface SmartPairSuggestionsTabProps {
  tenantId: string
  tenantSlug: string
}

// Build strategyConfig dynamically from bcg-labels
const strategyConfig: Record<string, { label: string; description: string; color: string }> = Object.fromEntries(
  Object.entries(STRATEGY_MERCHANT_LABELS).map(([key, val]) => [key, { label: val.label, description: val.description, color: val.color }])
)

export function SmartPairSuggestionsTab({
  tenantId,
  tenantSlug,
}: SmartPairSuggestionsTabProps) {
  const [suggestions, setSuggestions] = useState<PairSuggestion[]>([])
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [isPending, startTransition] = useTransition()

  const getSuggestionKey = (s: PairSuggestion) =>
    `${s.sourceItem.id}:${s.targetItem.id}`

  const handleGenerate = async () => {
    setIsGenerating(true)
    setAcceptedIds(new Set())
    setRejectedIds(new Set())

    try {
      const result = await generateSmartPairSuggestionsAction(tenantId)
      setSuggestions(result)
      setHasGenerated(true)
      if (result.length === 0) {
        toast.info('No suggestions found. Classify items with BCG first.')
      }
    } catch {
      toast.error('Failed to generate suggestions')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleAccept = (suggestion: PairSuggestion) => {
    const key = getSuggestionKey(suggestion)
    startTransition(async () => {
      try {
        await acceptPairSuggestionAction(
          tenantId,
          tenantSlug,
          suggestion.sourceItem.id,
          suggestion.targetItem.id,
          suggestion.strategy
        )
        setAcceptedIds((prev) => new Set(prev).add(key))
        toast.success('Pair accepted and created')
      } catch {
        toast.error('Failed to accept suggestion')
      }
    })
  }

  const handleReject = (suggestion: PairSuggestion) => {
    const key = getSuggestionKey(suggestion)
    setRejectedIds((prev) => new Set(prev).add(key))
  }

  const visibleSuggestions = useMemo(
    () => suggestions.filter((s) => !rejectedIds.has(getSuggestionKey(s))),
    [suggestions, rejectedIds]
  )

  const pendingSuggestions = useMemo(
    () => visibleSuggestions.filter((s) => !acceptedIds.has(getSuggestionKey(s))),
    [visibleSuggestions, acceptedIds]
  )

  // Group by strategy
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, PairSuggestion[]> = {}
    for (const s of visibleSuggestions) {
      if (!groups[s.strategy]) {
        groups[s.strategy] = []
      }
      groups[s.strategy].push(s)
    }
    return groups
  }, [visibleSuggestions])

  // Estimated extra revenue per order
  const estimatedAovLift = useMemo(() => {
    return pendingSuggestions.reduce((sum, s) => {
      const diff = Math.abs(s.targetItem.price - s.sourceItem.price)
      return sum + diff
    }, 0)
  }, [pendingSuggestions])

  const handleBulkAccept = () => {
    startTransition(async () => {
      try {
        await bulkAcceptPairSuggestionsAction(
          tenantId,
          tenantSlug,
          pendingSuggestions.map((s) => ({
            sourceItemId: s.sourceItem.id,
            targetItemId: s.targetItem.id,
            strategy: s.strategy,
          }))
        )
        const newAccepted = new Set(acceptedIds)
        for (const s of pendingSuggestions) {
          newAccepted.add(getSuggestionKey(s))
        }
        setAcceptedIds(newAccepted)
        toast.success(`${pendingSuggestions.length} pairs accepted`)
      } catch {
        toast.error('Failed to bulk accept suggestions')
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                Smart Pair Suggestions
              </CardTitle>
              <CardDescription>
                AI-powered upsell pair recommendations based on BCG classification
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {pendingSuggestions.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkAccept}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  Accept All ({pendingSuggestions.length})
                </Button>
              )}
              <Button onClick={handleGenerate} disabled={isGenerating} size={hasGenerated ? 'sm' : 'default'}>
                {isGenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {hasGenerated ? 'Regenerate' : 'Find new pairings'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading state */}
          {isGenerating && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
              <p className="text-sm font-medium">Analyzing your menu...</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Matching items by BCG classification and pricing patterns
              </p>
            </div>
          )}

          {/* Empty state - not generated yet */}
          {!isGenerating && !hasGenerated && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-50">
                <Lightbulb className="h-8 w-8 text-amber-500" />
              </div>
              <p className="text-sm font-medium">
                Discover high-impact upsell pairs
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                We analyze your BCG matrix classifications to suggest pairs that
                maximize revenue. Items must be classified first.
              </p>
              <Button onClick={handleGenerate} className="mt-4" disabled={isGenerating}>
                <Sparkles className="mr-2 h-4 w-4" />
                Find new pairings
              </Button>
            </div>
          )}

          {/* Empty state - generated but no results */}
          {!isGenerating && hasGenerated && suggestions.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Sparkles className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium">No suggestions found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Classify your menu items with the BCG matrix first, then try again.
              </p>
            </div>
          )}

          {/* Summary bar */}
          {!isGenerating && visibleSuggestions.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 dark:from-green-950/30 dark:to-emerald-950/30">
              <TrendingUp className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-400">
                <strong>{pendingSuggestions.length}</strong> pending pair{pendingSuggestions.length !== 1 ? 's' : ''}
                {estimatedAovLift > 0 && (
                  <> — up to <strong>{formatPrice(estimatedAovLift)}</strong> extra revenue per order</>
                )}
              </span>
              {acceptedIds.size > 0 && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                  {acceptedIds.size} accepted
                </Badge>
              )}
              {rejectedIds.size > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {rejectedIds.size} dismissed
                </Badge>
              )}
            </div>
          )}

          {/* Grouped suggestions list */}
          {!isGenerating && visibleSuggestions.length > 0 && (
            <div className="space-y-6">
              {Object.entries(groupedSuggestions).map(([strategy, strategySuggestions]) => {
                const config = strategyConfig[strategy] ?? {
                  label: strategy,
                  description: '',
                  color: 'bg-gray-100 text-gray-800 border-gray-200',
                }

                return (
                  <div key={strategy}>
                    {/* Strategy group header */}
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline" className={`${config.color}`}>
                        {config.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {config.description}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({strategySuggestions.length})
                      </span>
                    </div>

                    <div className="space-y-2">
                      {strategySuggestions.map((suggestion) => {
                        const key = getSuggestionKey(suggestion)
                        const isAccepted = acceptedIds.has(key)
                        const priceDiff = suggestion.targetItem.price - suggestion.sourceItem.price

                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                              isAccepted
                                ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20'
                                : 'hover:bg-muted/30'
                            }`}
                          >
                            {/* Source Item */}
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {suggestion.sourceItem.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={suggestion.sourceItem.image_url}
                                    alt={suggestion.sourceItem.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {suggestion.sourceItem.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatPrice(suggestion.sourceItem.price)}
                                </p>
                              </div>
                            </div>

                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                            {/* Target Item */}
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {suggestion.targetItem.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={suggestion.targetItem.image_url}
                                    alt={suggestion.targetItem.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {suggestion.targetItem.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatPrice(suggestion.targetItem.price)}
                                  {priceDiff > 0 && (
                                    <span className="ml-1 font-semibold text-green-600">
                                      (+{formatPrice(priceDiff)})
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            {/* Reason tooltip */}
                            {suggestion.reason && (
                              <span
                                className="hidden sm:block max-w-[140px] text-[10px] text-muted-foreground leading-tight truncate shrink-0"
                                title={suggestion.reason}
                              >
                                {suggestion.reason}
                              </span>
                            )}

                            {/* Actions */}
                            {isAccepted ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="text-xs font-medium text-green-600">Added</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleAccept(suggestion)}
                                  disabled={isPending}
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Accept
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleReject(suggestion)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
