'use client'

import { useCallback, useMemo } from 'react'
import { GROUP_LABELS } from '@/lib/expenses/categories'
import type { Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'
import { Combobox, type ComboSection } from './combobox'
import { CategoryBadge } from './expense-badges'
import { categorySections, matchScore } from './category-options'

interface CategoryPickerProps {
  inputId?: string
  categories: readonly ExpenseCategory[]
  recentExpenses: readonly Expense[]
  value: string | null
  onChange: (categoryId: string) => void
  error?: string | null
  label?: string
  autoFocus?: boolean
}

export function CategoryPicker({
  inputId,
  categories,
  recentExpenses,
  value,
  onChange,
  error,
  label = 'What was it for?',
  autoFocus,
}: CategoryPickerProps) {
  const selected = categories.find((category) => category.id === value)
  const getSections = useCallback(
    (query: string): ComboSection[] =>
      categorySections(categories, recentExpenses, query, new Date()).map((section) => ({
        id: section.id,
        label: section.label,
        options: section.categories.map((category) => ({
          id: category.id,
          label: category.name,
          leading: <CategoryBadge category={category} size="sm" />,
          hint: section.id === 'matches' || section.id === 'most-used' ? GROUP_LABELS[category.group] : undefined,
        })),
      })),
    [categories, recentExpenses],
  )
  return (
    <Combobox
      inputId={inputId}
      label={label}
      value={value}
      selectedLabel={selected?.name ?? ''}
      getSections={getSections}
      onSelect={onChange}
      placeholder="Type to search, e.g. “kur” for Kuryente"
      error={error}
      isRequired
      autoFocus={autoFocus}
    />
  )
}

interface SupplierPickerProps {
  inputId?: string
  suppliers: readonly Supplier[]
  supplierId: string | null
  paidToName: string
  onPickSupplier: (supplier: Supplier) => void
  onTypeName: (name: string) => void
  onCreateSupplier?: (name: string) => void
}

/** "Paid to": pick a saved supplier, add one, or just type a name. */
export function SupplierPicker({
  inputId,
  suppliers,
  supplierId,
  paidToName,
  onPickSupplier,
  onTypeName,
  onCreateSupplier,
}: SupplierPickerProps) {
  const active = useMemo(() => suppliers.filter((supplier) => supplier.archivedAt === null), [suppliers])
  const selected = active.find((supplier) => supplier.id === supplierId)
  const getSections = useCallback(
    (query: string): ComboSection[] => {
      const matches = active
        .map((supplier) => ({ supplier, score: matchScore(supplier.name, query) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.supplier.name.localeCompare(b.supplier.name))
      return matches.length === 0
        ? []
        : [
            {
              id: 'suppliers',
              label: 'Saved',
              options: matches.map(({ supplier }) => ({ id: supplier.id, label: supplier.name, hint: supplier.tin ? `TIN ${supplier.tin}` : undefined })),
            },
          ]
    },
    [active],
  )
  return (
    <Combobox
      inputId={inputId}
      label="Paid to (optional)"
      value={supplierId}
      selectedLabel={selected?.name ?? paidToName}
      getSections={getSections}
      onSelect={(id) => {
        const supplier = active.find((entry) => entry.id === id)
        if (supplier) onPickSupplier(supplier)
      }}
      onTextChange={onTypeName}
      onCreate={onCreateSupplier}
      createLabel={(query) => `Save “${query}” as a new supplier`}
      placeholder="Supplier, landlord, rider…"
    />
  )
}
