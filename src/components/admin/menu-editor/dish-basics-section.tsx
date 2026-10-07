'use client'

/**
 * The two cards every owner fills in, in the order a dish is thought about:
 * what it is (name, category, description, photo) and what it costs the
 * customer (price, sale price — with the margin beside it when a recipe has
 * costed the dish).
 *
 * On a phone the name is the first thing on screen; the photo follows the
 * words instead of filling the first viewport with an empty tile.
 */

import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoryIcon } from '@/components/shared/category-icon'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import { DISH_DESCRIPTION_CARD_LENGTH, DISH_DESCRIPTION_MAX } from '@/lib/menu-editor/dish-limits'
import type { DishBasics, DishBasicsErrors } from '@/lib/menu-editor/dish-form-schema'
import type { Category } from '@/types/database'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
import { DishPhotoField } from '@/components/admin/menu-editor/dish-photo-field'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'

type OnBasicsChange = <K extends keyof DishBasics>(field: K, value: DishBasics[K]) => void

interface DishDetailsSectionProps {
  values: DishBasics
  errors: DishBasicsErrors
  categories: readonly Category[]
  onChange: OnBasicsChange
}

export function DishDetailsSection({ values, errors, categories, onChange }: DishDetailsSectionProps) {
  const descriptionLength = values.description.length
  const isPastCard = descriptionLength > DISH_DESCRIPTION_CARD_LENGTH

  return (
    <EditorSection id={DISH_SECTION_IDS.details} title="Details">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_184px]">
        <div className="min-w-0 space-y-4">
          <Field id="name" label="Name" error={errors.name}>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="e.g. Brown sugar milk tea"
              autoComplete="off"
              required
              aria-invalid={Boolean(errors.name)}
              className="h-11 text-base"
            />
          </Field>

          <Field id="category" label="Category" error={errors.category_id}>
            <Select value={values.category_id || undefined} onValueChange={(value) => onChange('category_id', value)}>
              <SelectTrigger
                id="category"
                aria-label="Category"
                aria-invalid={Boolean(errors.category_id)}
                className={cn('h-11 w-full', errors.category_id && 'border-destructive')}
              >
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <span className="flex items-center gap-2">
                      <CategoryIcon icon={category.icon} color={category.icon_color} size="sm" />
                      {category.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="description"
            label="Description"
            isOptional
            error={errors.description}
            hint={
              <span className="flex justify-between gap-3">
                <span>{isPastCard ? 'Longer than the menu card shows; the rest is on the dish page.' : 'A line customers read under the name.'}</span>
                {descriptionLength > 0 && (
                  <span className={cn('shrink-0 tabular-nums', isPastCard && 'text-amber-700 dark:text-amber-400')}>
                    {descriptionLength}/{DISH_DESCRIPTION_CARD_LENGTH}
                  </span>
                )}
              </span>
            }
          >
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => onChange('description', e.target.value)}
              placeholder="e.g. Fresh milk, black tea and brown sugar pearls."
              rows={2}
              maxLength={DISH_DESCRIPTION_MAX}
              aria-invalid={Boolean(errors.description)}
              className="min-h-[72px] text-base sm:text-sm"
            />
          </Field>
        </div>

        <div className="max-w-[184px] space-y-1.5">
          <p className="text-sm font-medium">
            Photo <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <DishPhotoField
            imageUrl={values.image_url}
            onChange={(url) => onChange('image_url', url)}
            hasError={Boolean(errors.image_url)}
          />
          {errors.image_url && <p className="text-sm text-destructive">{errors.image_url}</p>}
        </div>
      </div>
    </EditorSection>
  )
}

interface DishPricingSectionProps {
  values: DishBasics
  errors: DishBasicsErrors
  onChange: OnBasicsChange
  /** Recipe-derived cost of one plain order; null when the dish has no costed recipe. */
  recipeCost: number | null
}

const MARGIN_GOOD_PERCENT = 60
const MARGIN_OK_PERCENT = 30

export function DishPricingSection({ values, errors, onChange, recipeCost }: DishPricingSectionProps) {
  const price = parseFloat(values.price)
  const salePrice = parseFloat(values.discounted_price)
  const isOnSale = Number.isFinite(price) && Number.isFinite(salePrice) && salePrice < price
  const sellingPrice = isOnSale ? salePrice : price

  return (
    <EditorSection id={DISH_SECTION_IDS.pricing} title="Pricing">
      <div className="grid grid-cols-2 gap-3">
        <Field id="price" label="Price" error={errors.price}>
          <PesoInput
            id="price"
            value={values.price}
            onChange={(value) => onChange('price', value)}
            placeholder="0.00"
            required
            isInvalid={Boolean(errors.price)}
          />
        </Field>
        <Field
          id="discounted_price"
          label="Sale price"
          isOptional
          error={errors.discounted_price}
          hint={isOnSale ? `Shows ${formatPrice(price)} crossed out` : undefined}
        >
          <PesoInput
            id="discounted_price"
            value={values.discounted_price}
            onChange={(value) => onChange('discounted_price', value)}
            placeholder="—"
            isInvalid={Boolean(errors.discounted_price)}
          />
        </Field>
      </div>

      {recipeCost !== null && Number.isFinite(sellingPrice) && sellingPrice > 0 && (
        <MarginLine sellingPrice={sellingPrice} cost={recipeCost} />
      )}
    </EditorSection>
  )
}

/** Cost, profit and margin from the dish's recipe — the line Shopify puts under price. */
function MarginLine({ sellingPrice, cost }: { sellingPrice: number; cost: number }) {
  const profit = sellingPrice - cost
  const marginPercent = (profit / sellingPrice) * 100
  const tone = marginPercent >= MARGIN_GOOD_PERCENT
    ? 'text-emerald-700 dark:text-emerald-400'
    : marginPercent >= MARGIN_OK_PERCENT
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-destructive'

  return (
    <dl className="mt-4 grid grid-cols-3 divide-x rounded-lg border bg-muted/40 text-sm">
      <div className="px-3 py-2">
        <dt className="text-xs text-muted-foreground">Cost (recipe)</dt>
        <dd className="font-medium tabular-nums">{formatPrice(cost)}</dd>
      </div>
      <div className="px-3 py-2">
        <dt className="text-xs text-muted-foreground">You keep</dt>
        <dd className="font-medium tabular-nums">{formatPrice(profit)}</dd>
      </div>
      <div className="px-3 py-2">
        <dt className="text-xs text-muted-foreground">Margin</dt>
        <dd className={cn('font-semibold tabular-nums', tone)}>{Math.round(marginPercent)}%</dd>
      </div>
    </dl>
  )
}

interface FieldProps {
  id: string
  label: string
  isOptional?: boolean
  error?: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}

function Field({ id, label, isOptional, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline gap-1.5">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        {isOptional && <span className="text-sm text-muted-foreground">(optional)</span>}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        hint && <div className="text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  )
}

interface PesoInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
  isInvalid: boolean
}

function PesoInput({ id, value, onChange, placeholder, required, isInvalid }: PesoInputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
      <Input
        id={id}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        aria-invalid={isInvalid}
        className="h-11 pl-7 text-base tabular-nums"
      />
    </div>
  )
}
