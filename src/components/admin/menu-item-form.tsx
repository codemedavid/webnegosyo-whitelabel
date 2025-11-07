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
import type { MenuItem, Category, VariationType, VariationOption } from '@/types/database'
import { toast } from 'sonner'
import { z } from 'zod'

interface MenuItemFormProps {
  item?: MenuItem
  categories: Category[]
  tenantId: string
  tenantSlug: string
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
  image_url: z.string().url('Must be a valid URL'),
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

export function MenuItemForm({ item, categories, tenantId, tenantSlug }: MenuItemFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: item?.name || '',
    description: item?.description || '',
    price: item?.price.toString() || '',
    discounted_price: item?.discounted_price?.toString() || '',
    image_url: item?.image_url || '',
    category_id: item?.category_id || categories[0]?.id || '',
    is_available: item?.is_available ?? true,
    is_featured: item?.is_featured ?? false,
  })

  const [variations, setVariations] = useState(item?.variations || [])
  const [variationTypes, setVariationTypes] = useState(item?.variation_types || [])
  const [addons, setAddons] = useState(item?.addons || [])
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
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
      
      const input = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        discounted_price: formData.discounted_price ? parseFloat(formData.discounted_price) : null,
        image_url: formData.image_url,
        category_id: formData.category_id,
        // Include both formats for backward compatibility
        variation_types: useNewVariations ? variationTypes : [],
        variations: useNewVariations ? [] : variations,
        addons,
        is_available: formData.is_available,
        is_featured: formData.is_featured,
        order: item?.order || 0,
      }

      const result = item
        ? await updateMenuItemAction(item.id, tenantId, tenantSlug, input)
        : await createMenuItemAction(tenantId, tenantSlug, input)

      if (result.success) {
        toast.success(item ? 'Menu item updated!' : 'Menu item created!')
        router.push(`/${tenantSlug}/admin/menu`)
        router.refresh()
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
              <Label htmlFor="price">Price ($) *</Label>
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
              <Label htmlFor="discounted_price">Discounted Price ($)</Label>
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
                    {category.icon} {category.name}
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

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_available}
                onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Available</span>
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
          </div>
        </CardContent>
      </Card>

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
                      onChange={(e) => updateVariation(index, 'price_modifier', parseFloat(e.target.value))}
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Variation Types</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addVariationType}>
              <Plus className="mr-2 h-4 w-4" />
              Add Variation Type
            </Button>
          </CardHeader>
          <CardContent>
            {variationTypes.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No variation types. Add groups like Size, Spice Level, Protein Type, etc.
              </p>
            ) : (
              <div className="space-y-6">
                {variationTypes.map((variationType, typeIndex) => (
                  <div key={variationType.id} className="border rounded-lg p-4 space-y-4">
                    {/* Variation Type Header */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-3">
                        <Input
                          placeholder="Type Name (e.g., Size, Spice Level)"
                          value={variationType.name}
                          onChange={(e) => updateVariationType(typeIndex, 'name', e.target.value)}
                          className="font-medium"
                        />
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={variationType.is_required}
                            onChange={(e) => updateVariationType(typeIndex, 'is_required', e.target.checked)}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">Required (customer must select)</span>
                        </label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVariationType(typeIndex)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Variation Options */}
                    <div className="ml-4 space-y-3 border-l-2 pl-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-muted-foreground">Options</h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addVariationOption(typeIndex)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add Option
                        </Button>
                      </div>

                      {variationType.options.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No options yet. Add options like Small, Medium, Large.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {variationType.options.map((option, optionIndex) => (
                            <div key={option.id} className="border rounded-md p-3 space-y-3 bg-gray-50">
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Option name (e.g., Small)"
                                  value={option.name}
                                  onChange={(e) =>
                                    updateVariationOption(typeIndex, optionIndex, 'name', e.target.value)
                                  }
                                  className="flex-1"
                                />
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Price modifier"
                                  value={option.price_modifier}
                                  onChange={(e) =>
                                    updateVariationOption(
                                      typeIndex,
                                      optionIndex,
                                      'price_modifier',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-32"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeVariationOption(typeIndex, optionIndex)}
                                  className="text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Image Upload for Option */}
                              <div className="space-y-2">
                                <Label className="text-xs">Option Image (Optional)</Label>
                                <ImageUpload
                                  currentImageUrl={option.image_url || ''}
                                  onImageUploaded={(url) =>
                                    updateVariationOption(typeIndex, optionIndex, 'image_url', url)
                                  }
                                  label=""
                                  description="Upload an image for this option"
                                  folder={`variation-options`}
                                />
                              </div>

                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={option.is_default || false}
                                  onChange={(e) =>
                                    updateVariationOption(typeIndex, optionIndex, 'is_default', e.target.checked)
                                  }
                                  className="h-3 w-3"
                                />
                                <span className="text-xs">Default option</span>
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Add-ons</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addAddon}>
            <Plus className="mr-2 h-4 w-4" />
            Add Add-on
          </Button>
        </CardHeader>
        <CardContent>
          {addons.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No add-ons. Add extras like Extra Cheese, No Onions.
            </p>
          ) : (
            <div className="space-y-3">
              {addons.map((addon, index) => (
                <div key={addon.id} className="flex gap-2">
                  <Input
                    placeholder="Name (e.g., Extra Cheese)"
                    value={addon.name}
                    onChange={(e) => updateAddon(index, 'name', e.target.value)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={addon.price}
                    onChange={(e) => updateAddon(index, 'price', parseFloat(e.target.value))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAddon(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
    </form>
  )
}

