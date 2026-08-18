'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ImageUpload } from '@/components/shared/image-upload'
import { CategoryIcon } from '@/components/shared/category-icon'
import type { MenuItem, Category, VariationType, VariationOption, BcgClassification, ModifierGroup } from '@/types/database'
import { VariationGroupsEditor } from '@/components/admin/variation-groups-editor'
import { AddonEditor } from '@/components/admin/addon-editor'
import { AddonLibraryPicker } from '@/components/admin/addon-library-picker'
import { ModifierGroupsEditor, type LinkableMenuItem } from '@/components/admin/modifier-groups-editor'
import { ModifierLibraryPicker } from '@/components/admin/modifier-library-picker'
import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { serializeGroups, splitGroupsToLegacyColumns } from '@/lib/modifier-groups-form'
import { attachEntriesToAddons } from '@/lib/addon-library-utils'
import { attachEntriesToGroups, buildLibraryDraftFromGroup } from '@/lib/modifier-library-utils'
import { createModifierGroupLibraryEntryAction } from '@/app/actions/modifier-library'
import { TagManager } from '@/components/admin/tag-manager'
import { toast } from 'sonner'
import { z } from 'zod'
import { SafeConvexProvider } from '@/components/shared/safe-convex-provider'
import { ProductCostField } from '@/components/admin/product-cost-field'
import { ProductCostFieldConvex } from '@/components/admin/product-cost-field-convex'
import { ProductMiniPerformance } from '@/components/admin/product-mini-performance'
import { useMenuItemCosts } from '@/hooks/use-menu-item-costs'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { resolvePostSaveStep } from '@/lib/menu-item-save-flow'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MenuItemFormProps {
  item?: MenuItem
  categories: Category[]
  tenantId: string
  tenantSlug: string
  menuEngineeringEnabled?: boolean
  modifierGroupsEnabled?: boolean
  /** Menu items an add-on option may link to (live reference). */
  linkableItems?: LinkableMenuItem[]
  inventoryEnabled?: boolean
  convexUrl?: string
}

// Client-side validation schema (matches server-side schema)
const menuItemFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.string().refine((val) => {
    const num = parseFloat(val)
    return !isNaN(num) && num > 0
  }, 'Price must be a positive number'),
  discounted_price: z.string().optional().refine((val) => {
    if (!val) return true
    const num = parseFloat(val)
    return !isNaN(num) && num >= 0
  }, 'Discounted price must be a positive number'),
  // Image is optional — accept a valid URL or an empty string (no image).
  image_url: z.string().url('Must be a valid URL').or(z.literal('')),
  category_id: z.string().uuid('Must select a category'),
})

type FormErrors = {
  name?: string
  description?: string
  price?: string
  discounted_price?: string
  image_url?: string
  category_id?: string
}

export function MenuItemForm({ item, categories, tenantId, tenantSlug, menuEngineeringEnabled, modifierGroupsEnabled, linkableItems, inventoryEnabled, convexUrl }: MenuItemFormProps) {
  const router = useRouter()
  // Recipe-derived costs for the per-option margin display. No-ops when the
  // tenant has no inventory or the item has not been saved yet.
  const { optionRecipeCosts, refresh: refreshCosts } = useMenuItemCosts(
    tenantId,
    item?.id,
    inventoryEnabled ?? false,
  )
  const [formData, setFormData] = useState({
    name: item?.name || '',
    description: item?.description || '',
    price: item?.price.toString() || '',
    discounted_price: item?.discounted_price?.toString() || '',
    image_url: item?.image_url || '',
    category_id: item?.category_id || categories[0]?.id || '',
    is_available: item?.is_available ?? true,
    is_featured: item?.is_featured ?? false,
    show_in_checkout_upsell: item?.show_in_checkout_upsell ?? false,
    bcg_classification: (item?.bcg_classification || 'unclassified') as BcgClassification,
    badge_text: item?.badge_text || '',
  })

  const [variations, setVariations] = useState(item?.variations || [])
  const [variationTypes, setVariationTypes] = useState(item?.variation_types || [])
  const [addons, setAddons] = useState(item?.addons || [])
  // Unified editor state. Seeded from the item's existing modifiers (explicit
  // modifier_groups OR derived from legacy variation_types/variations/addons) so
  // enabling the flag on a legacy item shows its current options.
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(() =>
    modifierGroupsEnabled ? normalizeModifierGroups(item ?? {}) : []
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  /**
   * The freshly created item whose recipe step is open. Creating used to end by
   * silently closing to the menu list — on an inventory tenant that was the
   * moment the recipe was lost, and a dish with no recipe deducts nothing when
   * it sells. See `resolvePostSaveStep`.
   */
  const [recipeStepItemId, setRecipeStepItemId] = useState<string | null>(null)
  const [useNewVariations, setUseNewVariations] = useState(
    (item?.variation_types && item.variation_types.length > 0) || false
  )

  const validateForm = (): boolean => {
    try {
      menuItemFormSchema.parse({
        name: formData.name,
        description: formData.description,
        price: formData.price,
        discounted_price: formData.discounted_price,
        image_url: formData.image_url,
        category_id: formData.category_id,
      })
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: FormErrors = {}
        error.issues.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as keyof FormErrors] = err.message
          }
        })
        setErrors(newErrors)
        
        // Show first error in toast
        const firstError = error.issues[0]
        if (firstError) {
          toast.error(`${firstError.path.join('.')}: ${firstError.message}`)
        }
      }
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Client-side validation
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    
    try {
      // Import actions
      const { createMenuItemAction, updateMenuItemAction } = await import('@/app/actions/menu-items')
      
      // With the unified editor on, `modifier_groups` is canonical and the
      // legacy columns are derived from it so surfaces that don't yet read the
      // new model (storefront, POS, mobile) keep rendering.
      const cleanGroups = modifierGroupsEnabled ? serializeGroups(modifierGroups) : []
      const legacy = modifierGroupsEnabled ? splitGroupsToLegacyColumns(cleanGroups) : null

      const input = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        discounted_price: formData.discounted_price ? parseFloat(formData.discounted_price) : null,
        image_url: formData.image_url,
        category_id: formData.category_id,
        modifier_groups: cleanGroups,
        // Include legacy formats for backward compatibility
        variation_types: legacy ? legacy.variation_types : useNewVariations ? variationTypes : [],
        variations: legacy ? legacy.variations : useNewVariations ? [] : variations,
        addons: legacy ? legacy.addons : addons,
        is_available: formData.is_available,
        is_featured: formData.is_featured,
        show_in_checkout_upsell: formData.show_in_checkout_upsell,
        order: item?.order || 0,
        ...(menuEngineeringEnabled ? {
          bcg_classification: formData.bcg_classification,
          badge_text: formData.badge_text || null,
        } : {}),
      }

      const result = item
        ? await updateMenuItemAction(item.id, tenantId, tenantSlug, input)
        : await createMenuItemAction(tenantId, tenantSlug, input)

      if (result.success) {
        toast.success(item ? 'Menu item updated!' : 'Menu item created!')
        const step = resolvePostSaveStep({
          isNewItem: !item,
          inventoryEnabled: inventoryEnabled ?? false,
          savedItemId: (result.data as { id?: string } | undefined)?.id,
        })
        if (step.kind === 'link-ingredients') {
          // Hold the merchant here for the recipe instead of closing: until a
          // dish has one, selling it deducts no stock.
          setRecipeStepItemId(step.itemId)
        } else {
          router.push(`/${tenantSlug}/admin/menu`)
          router.refresh()
        }
      } else {
        // Handle server-side validation errors
        if (result.error) {
          try {
            const errorData = JSON.parse(result.error)
            if (Array.isArray(errorData)) {
              // Zod validation errors from server
              const newErrors: FormErrors = {}
              errorData.forEach((err: { path: string[]; message: string }) => {
                if (err.path[0]) {
                  newErrors[err.path[0] as keyof FormErrors] = err.message
                }
              })
              setErrors(newErrors)
              toast.error('Please fix the validation errors')
            } else {
              toast.error(result.error)
            }
          } catch {
            toast.error(result.error || 'Failed to save menu item')
          }
        } else {
          toast.error('Failed to save menu item')
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Leaving the recipe step always lands on the menu list, recipe or not. */
  const finishRecipeStep = () => {
    router.push(`/${tenantSlug}/admin/menu`)
    router.refresh()
  }

  const addVariation = () => {
    setVariations([
      ...variations,
      { id: `temp-${Date.now()}`, name: '', price_modifier: 0, is_default: variations.length === 0 },
    ])
  }

  const removeVariation = (index: number) => {
    setVariations(variations.filter((_, i) => i !== index))
  }

  const updateVariation = (index: number, field: string, value: string | number | boolean) => {
    const updated = [...variations]
    updated[index] = { ...updated[index], [field]: value }
    setVariations(updated)
  }

  const addAddon = () => {
    setAddons([
      ...addons,
      { id: `temp-${Date.now()}`, name: '', price: 0 },
    ])
  }

  const removeAddon = (index: number) => {
    setAddons(addons.filter((_, i) => i !== index))
  }

  const updateAddon = (index: number, field: string, value: string | number | boolean) => {
    const updated = [...addons]
    updated[index] = { ...updated[index], [field]: value }
    setAddons(updated)
  }

  const attachFromLibrary = (entries: Parameters<typeof attachEntriesToAddons>[1]) => {
    setAddons((prev) => {
      const merged = attachEntriesToAddons(prev, entries)
      if (merged.length === prev.length) {
        toast.info('Those add-ons are already on this item')
      }
      return merged
    })
  }

  const attachGroupsFromLibrary = (entries: Parameters<typeof attachEntriesToGroups>[1]) => {
    setModifierGroups((prev) => {
      const merged = attachEntriesToGroups(prev, entries)
      if (merged.length === prev.length) {
        toast.info('Those groups are already on this item')
      } else {
        toast.success('Added from library')
      }
      return merged
    })
  }

  const saveGroupToLibrary = async (group: ModifierGroup) => {
    const draft = buildLibraryDraftFromGroup(group)
    if (!draft.name.trim()) {
      toast.error('Give the group a name before saving it to the library')
      return
    }
    if (draft.options.length === 0) {
      toast.error('Add at least one option before saving to the library')
      return
    }
    const result = await createModifierGroupLibraryEntryAction(tenantId, tenantSlug, draft)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to save group to library')
      return
    }
    toast.success(`"${draft.name}" saved to your modifier library`)
  }

  // New Variation Types handlers
  const addVariationType = () => {
    const newType: VariationType = {
      id: `type-temp-${Date.now()}`,
      name: '',
      is_required: false,
      display_order: variationTypes.length,
      options: []
    }
    setVariationTypes([...variationTypes, newType])
  }

  const removeVariationType = (index: number) => {
    setVariationTypes(variationTypes.filter((_, i) => i !== index))
  }

  const updateVariationType = (index: number, field: keyof VariationType, value: string | boolean | number) => {
    const updated = [...variationTypes]
    updated[index] = { ...updated[index], [field]: value }
    setVariationTypes(updated)
  }

  const addVariationOption = (typeIndex: number) => {
    const updated = [...variationTypes]
    const newOption: VariationOption = {
      id: `opt-temp-${Date.now()}`,
      name: '',
      price_modifier: 0,
      image_url: undefined,
      is_default: updated[typeIndex].options.length === 0,
      display_order: updated[typeIndex].options.length
    }
    updated[typeIndex].options.push(newOption)
    setVariationTypes(updated)
  }

  const removeVariationOption = (typeIndex: number, optionIndex: number) => {
    const updated = [...variationTypes]
    updated[typeIndex].options = updated[typeIndex].options.filter((_, i) => i !== optionIndex)
    setVariationTypes(updated)
  }

  const updateVariationOption = (
    typeIndex: number,
    optionIndex: number,
    field: keyof VariationOption,
    value: string | number | boolean | undefined
  ) => {
    const updated = [...variationTypes]
    updated[typeIndex].options[optionIndex] = {
      ...updated[typeIndex].options[optionIndex],
      [field]: value
    }
    setVariationTypes(updated)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Item Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value })
                if (errors.name) setErrors({ ...errors, name: undefined })
              }}
              placeholder="e.g., Margherita Pizza"
              required
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value })
                if (errors.description) setErrors({ ...errors, description: undefined })
              }}
              placeholder="Describe your dish... (at least 10 characters)"
              rows={3}
              required
              className={errors.description ? 'border-destructive' : ''}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
            {!errors.description && formData.description.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {formData.description.length}/10 characters
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">Price (₱) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => {
                  setFormData({ ...formData, price: e.target.value })
                  if (errors.price) setErrors({ ...errors, price: undefined })
                }}
                placeholder="14.99"
                required
                className={errors.price ? 'border-destructive' : ''}
              />
              {errors.price && (
                <p className="text-sm text-destructive">{errors.price}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="discounted_price">Discounted Price (₱)</Label>
              <Input
                id="discounted_price"
                type="number"
                step="0.01"
                value={formData.discounted_price}
                onChange={(e) => {
                  setFormData({ ...formData, discounted_price: e.target.value })
                  if (errors.discounted_price) setErrors({ ...errors, discounted_price: undefined })
                }}
                placeholder="Optional"
                className={errors.discounted_price ? 'border-destructive' : ''}
              />
              {errors.discounted_price && (
                <p className="text-sm text-destructive">{errors.discounted_price}</p>
              )}
            </div>
          </div>

          {convexUrl && item?.id ? (
            <SafeConvexProvider url={convexUrl}>
              {/* Convex-connected: actually persists the cost price so BCG
                  classification can work (the bare field never saved). */}
              <ProductCostFieldConvex
                menuItemId={item.id}
                currentPrice={parseFloat(formData.price) || 0}
                discountedPrice={parseFloat(formData.discounted_price) || undefined}
              />
              <ProductMiniPerformance menuItemId={item.id} />
            </SafeConvexProvider>
          ) : (
            // New (unsaved) item or no Convex: show the calculator only. Costs
            // can be saved once the item has an id and Convex is configured.
            <ProductCostField
              menuItemId={item?.id}
              currentPrice={parseFloat(formData.price) || 0}
              discountedPrice={parseFloat(formData.discounted_price) || undefined}
            />
          )}

          {inventoryEnabled &&
            (item?.id ? (
              <RecipeEditor
                tenantId={tenantId}
                tenantSlug={tenantSlug}
                target={{ type: 'menu_item', menuItemId: item.id }}
                label="Base recipe (ingredients used per item)"
                onSaved={refreshCosts}
              />
            ) : (
              // A recipe needs an item id to attach to, so a brand-new dish
              // cannot have one yet. Rendering nothing made that look like the
              // feature was missing rather than merely not-yet — say so instead.
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  Base recipe (ingredients used per item)
                </p>
                <p className="mt-1">
                  You will be asked to link the ingredients this dish uses right after it is
                  created. Until a dish has a recipe, selling it will not deduct any stock.
                </p>
              </div>
            ))}

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => {
                setFormData({ ...formData, category_id: value })
                if (errors.category_id) setErrors({ ...errors, category_id: undefined })
              }}
            >
              <SelectTrigger className={errors.category_id ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select category" />
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
            {errors.category_id && (
              <p className="text-sm text-destructive">{errors.category_id}</p>
            )}
          </div>

          <div className="space-y-2">
            <ImageUpload
              currentImageUrl={formData.image_url}
              onImageUploaded={(url) => {
                setFormData({ ...formData, image_url: url })
                if (errors.image_url) setErrors({ ...errors, image_url: undefined })
              }}
              label="Dish Image *"
              description="Upload a photo of your dish (horizontal/landscape recommended)"
              folder="menu-items"
            />
            {errors.image_url && (
              <p className="text-sm text-destructive">{errors.image_url}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <label
              className="flex items-center gap-2"
              title="Unchecked, this dish stays on your menu marked unavailable — it is not removed"
            >
              <input
                type="checkbox"
                checked={formData.is_available}
                onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">In stock</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_featured}
                onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Featured</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer" title="Show this item in the checkout upsell interstitial">
              <input
                type="checkbox"
                checked={formData.show_in_checkout_upsell}
                onChange={(e) => setFormData({ ...formData, show_in_checkout_upsell: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Show in Checkout Upsell</span>
            </label>
          </div>

          {menuEngineeringEnabled && (
            <>
            <div className="grid gap-4 sm:grid-cols-2 border-t pt-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="bcg_classification">BCG Classification</Label>
                <Select
                  value={formData.bcg_classification}
                  onValueChange={(value) =>
                    setFormData({ ...formData, bcg_classification: value as BcgClassification })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select classification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unclassified">Unclassified</SelectItem>
                    <SelectItem value="star">Star</SelectItem>
                    <SelectItem value="plowhorse">Plowhorse</SelectItem>
                    <SelectItem value="puzzle">Puzzle</SelectItem>
                    <SelectItem value="dog">Dog</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Classify this item based on popularity and profitability
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="badge_text">Badge Text</Label>
                <Input
                  id="badge_text"
                  value={formData.badge_text}
                  onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                  placeholder="e.g., Best Seller, New"
                />
                <p className="text-xs text-muted-foreground">
                  Optional badge shown on the customer menu card
                </p>
              </div>
            </div>
            <TagManager
              itemId={item?.id ?? null}
              tenantId={tenantId}
              tenantSlug={tenantSlug}
            />
            </>
          )}
        </CardContent>
      </Card>

      {modifierGroupsEnabled ? (
        <ModifierGroupsEditor
          groups={modifierGroups}
          onChange={setModifierGroups}
          basePrice={parseFloat(formData.price) || 0}
          recipeContext={{
            tenantId,
            tenantSlug,
            menuItemId: item?.id,
            inventoryEnabled: inventoryEnabled ?? false,
            onRecipeSaved: refreshCosts,
          }}
          optionRecipeCosts={optionRecipeCosts}
          headerAction={<ModifierLibraryPicker tenantId={tenantId} onAttach={attachGroupsFromLibrary} />}
          onSaveGroupToLibrary={saveGroupToLibrary}
          linkableItems={linkableItems?.filter((candidate) => candidate.id !== item?.id)}
        />
      ) : (
      <>
      {/* Variation System Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Variation System</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!useNewVariations}
                onChange={() => setUseNewVariations(false)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Simple Variations (Legacy)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={useNewVariations}
                onChange={() => setUseNewVariations(true)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Grouped Variations with Images (New)</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {useNewVariations 
              ? 'Create organized variation groups (Size, Spice Level, etc.) with optional images for each option.'
              : 'Simple flat list of variations for basic size options.'}
          </p>
        </CardContent>
      </Card>

      {/* Legacy Variations System */}
      {!useNewVariations && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Variations</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addVariation}>
              <Plus className="mr-2 h-4 w-4" />
              Add Variation
            </Button>
          </CardHeader>
          <CardContent>
            {variations.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                No variations. Add sizes like Small, Medium, Large.
              </p>
            ) : (
              <div className="space-y-3">
                {variations.map((variation, index) => (
                  <div key={variation.id} className="flex gap-2">
                    <Input
                      placeholder="Name (e.g., Small)"
                      value={variation.name}
                      onChange={(e) => updateVariation(index, 'name', e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Price modifier"
                      value={variation.price_modifier}
                      onChange={(e) => updateVariation(index, 'price_modifier', parseFloat(e.target.value) || 0)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeVariation(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* New Grouped Variation Types System */}
      {useNewVariations && (
        <VariationGroupsEditor
          variationTypes={variationTypes}
          onAddVariationType={addVariationType}
          onRemoveVariationType={removeVariationType}
          onUpdateVariationType={updateVariationType}
          onAddVariationOption={addVariationOption}
          onRemoveVariationOption={removeVariationOption}
          onUpdateVariationOption={updateVariationOption}
        />
      )}

      <AddonEditor
        addons={addons}
        onAddAddon={addAddon}
        onRemoveAddon={removeAddon}
        onUpdateAddon={updateAddon}
        headerAction={<AddonLibraryPicker tenantId={tenantId} onAttach={attachFromLibrary} />}
        recipeContext={{
          tenantId,
          tenantSlug,
          menuItemId: item?.id,
          inventoryEnabled: inventoryEnabled ?? false,
          onRecipeSaved: refreshCosts,
        }}
      />
      </>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/${tenantSlug}/admin/menu`)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : item ? 'Update Item' : 'Create Item'}
        </Button>
      </div>

      {/*
        The recipe step for a freshly created dish. Dismissing it in any way —
        Done, Skip, the close button — lands on the menu list either way; the
        dialog only decides whether the dish leaves linked to inventory.
      */}
      <Dialog open={recipeStepItemId !== null} onOpenChange={(open) => !open && finishRecipeStep()}>
        <DialogContent className="max-h-[85dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link ingredients now?</DialogTitle>
            <DialogDescription>
              {formData.name || 'This dish'} is saved. Until it has a recipe, selling it will not
              deduct any stock from your inventory.
            </DialogDescription>
          </DialogHeader>
          {recipeStepItemId && (
            <RecipeEditor
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              target={{ type: 'menu_item', menuItemId: recipeStepItemId }}
              label="Base recipe (ingredients used per item)"
            />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="max-sm:h-11"
              onClick={finishRecipeStep}
            >
              Skip for now
            </Button>
            <Button type="button" className="max-sm:h-11" onClick={finishRecipeStep}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

