'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getMenuItemsAction } from '@/app/actions/menu-items'
import { getCategoriesAction } from '@/app/actions/categories'
import {
  filterTargetOptions,
  summarizeTargetSelection,
  toCategoryOptions,
  toProductOptions,
  toggleTargetId,
  type TargetOption,
} from '@/lib/vouchers/target-picker'

interface VoucherTargetPickerProps {
  tenantId: string
  mode: 'products' | 'categories'
  selectedIds: readonly string[]
  onChange: (ids: readonly string[]) => void
}

/** Long menus need a scroll box, not a page that grows without end. */
const LIST_MAX_HEIGHT = 'max-h-64'

export function VoucherTargetPicker({
  tenantId,
  mode,
  selectedIds,
  onChange,
}: VoucherTargetPickerProps) {
  const [options, setOptions] = useState<readonly TargetOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let isCurrent = true

    const load = async () => {
      setIsLoading(true)
      setLoadError(null)

      const [itemsResult, categoriesResult] =
        mode === 'products'
          ? await Promise.all([getMenuItemsAction(tenantId), getCategoriesAction(tenantId)])
          : [null, await getCategoriesAction(tenantId)]

      if (!isCurrent) return

      if (!categoriesResult?.success || (mode === 'products' && !itemsResult?.success)) {
        setLoadError(
          mode === 'products'
            ? 'Could not load your products. Try again in a moment.'
            : 'Could not load your categories. Try again in a moment.'
        )
        setOptions([])
        setIsLoading(false)
        return
      }

      const categories = categoriesResult.data ?? []
      setOptions(
        mode === 'products'
          ? toProductOptions(itemsResult?.data ?? [], categories)
          : toCategoryOptions(categories)
      )
      setIsLoading(false)
    }

    void load()
    return () => {
      isCurrent = false
    }
  }, [tenantId, mode])

  const visible = useMemo(() => filterTargetOptions(options, query), [options, query])
  const summary = useMemo(
    () => summarizeTargetSelection(selectedIds, options),
    [selectedIds, options]
  )

  const noun = mode === 'products' ? 'product' : 'category'
  const plural = mode === 'products' ? 'products' : 'categories'

  if (isLoading) {
    return <p className="mt-2 text-sm text-gray-600">Loading your {plural}…</p>
  }

  if (loadError) {
    return <p className="mt-2 text-sm text-red-600">{loadError}</p>
  }

  if (options.length === 0) {
    return (
      <p className="mt-2 text-sm text-gray-600">
        You have no {plural} yet — add some before scoping a voucher to them.
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${plural}`}
          aria-label={`Search ${plural}`}
          className="pl-9"
        />
      </div>

      <div className={`${LIST_MAX_HEIGHT} overflow-y-auto rounded-md border border-gray-200`}>
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-600">
            No {plural} match “{query.trim()}”.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((option) => (
              <li key={option.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(option.id)}
                    onChange={() => onChange(toggleTargetId(selectedIds, option.id))}
                  />
                  <span>
                    <span className="text-gray-900">{option.label}</span>
                    {option.group && (
                      <span className="block text-xs text-gray-500">{option.group}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-sm text-gray-600">
        {summary.selectedCount === 0
          ? `No ${plural} chosen yet.`
          : `${summary.selectedCount} ${summary.selectedCount === 1 ? noun : plural} chosen.`}
      </p>

      {summary.missingIds.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {summary.missingIds.length} saved {summary.missingIds.length === 1 ? noun : plural} no
          longer {summary.missingIds.length === 1 ? 'exists' : 'exist'} on your menu, so{' '}
          {summary.missingIds.length === 1 ? 'it discounts' : 'they discount'} nothing. Pick a
          replacement if this code should still apply somewhere.
        </p>
      )}
    </div>
  )
}
