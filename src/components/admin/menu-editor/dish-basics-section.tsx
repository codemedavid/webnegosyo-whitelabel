'use client'

/**
 * The part of a dish every owner fills in: photo, name, price, category and a
 * short description. Everything else on the editor is optional.
 */

import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoryIcon } from '@/components/shared/category-icon'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import type { Category } from '@/types/database'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
import { DishPhotoField } from '@/components/admin/menu-editor/dish-photo-field'

export const MIN_DESCRIPTION_LENGTH = 10

export interface DishBasics {
  name: string
  description: string
  price: string
  discounted_price: string
  image_url: string
  category_id: string
}

export type DishBasicsErrors = Partial<Record<keyof DishBasics, string>>

interface DishBasicsSectionProps {
  values: DishBasics
  errors: DishBasicsErrors
  categories: readonly Category[]
  onChange: <K extends keyof DishBasics>(field: K, value: DishBasics[K]) => void
}

export function DishBasicsSection({ values, errors, categories, onChange }: DishBasicsSectionProps) {
  const price = parseFloat(values.price)
  const salePrice = parseFloat(values.discounted_price)
  const isOnSale = Number.isFinite(price) && Number.isFinite(salePrice) && salePrice < price
  const descriptionShortBy = MIN_DESCRIPTION_LENGTH - values.description.trim().length

  return (
    <EditorSection title="Dish details">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div>
          <DishPhotoField
            imageUrl={values.image_url}
            onChange={(url) => onChange('image_url', url)}
            hasError={Boolean(errors.image_url)}
          />
          {errors.image_url && <p className="mt-1.5 text-sm text-destructive">{errors.image_url}</p>}
        </div>

        <div className="space-y-4">
          <Field id="name" label="Name" error={errors.name}>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="e.g. Chicken Adobo"
              required
              aria-invalid={Boolean(errors.name)}
              className="h-11 text-base"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="price" label="Price" error={errors.price} hint="0 for free">
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
              error={errors.discounted_price}
              hint={isOnSale ? `Shows ${formatPrice(price)} crossed out` : 'Optional'}
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

          <Field id="category" label="Category" error={errors.category_id}>
            <Select value={values.category_id} onValueChange={(value) => onChange('category_id', value)}>
              <SelectTrigger id="category" className={cn('h-11 w-full', errors.category_id && 'border-destructive')}>
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
        </div>
      </div>

      <Field
        id="description"
        label="Description"
        error={errors.description}
        hint={descriptionShortBy > 0 && values.description.length > 0
          ? `${descriptionShortBy} more character${descriptionShortBy === 1 ? '' : 's'} needed`
          : 'A line or two customers see under the name'}
        className="mt-5"
      >
        <Textarea
          id="description"
          value={values.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="e.g. Tender chicken braised in soy, vinegar and garlic. Served with rice."
          rows={3}
          required
          aria-invalid={Boolean(errors.description)}
          className="text-base sm:text-sm"
        />
      </Field>
    </EditorSection>
  )
}

interface FieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}

function Field({ id, label, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
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
