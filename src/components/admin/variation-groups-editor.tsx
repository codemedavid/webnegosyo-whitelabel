'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageUpload } from '@/components/shared/image-upload'
import type { VariationType, VariationOption } from '@/types/database'

interface VariationGroupsEditorProps {
  variationTypes: VariationType[]
  onAddVariationType: () => void
  onRemoveVariationType: (index: number) => void
  onUpdateVariationType: (index: number, field: keyof VariationType, value: string | boolean | number) => void
  onAddVariationOption: (typeIndex: number) => void
  onRemoveVariationOption: (typeIndex: number, optionIndex: number) => void
  onUpdateVariationOption: (
    typeIndex: number,
    optionIndex: number,
    field: keyof VariationOption,
    value: string | number | boolean | undefined
  ) => void
}

export function VariationGroupsEditor({
  variationTypes,
  onAddVariationType,
  onRemoveVariationType,
  onUpdateVariationType,
  onAddVariationOption,
  onRemoveVariationOption,
  onUpdateVariationOption,
}: VariationGroupsEditorProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Variation Types</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={onAddVariationType}>
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
                      onChange={(e) => onUpdateVariationType(typeIndex, 'name', e.target.value)}
                      className="font-medium"
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={variationType.is_required}
                        onChange={(e) => onUpdateVariationType(typeIndex, 'is_required', e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">Required (customer must select)</span>
                    </label>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveVariationType(typeIndex)}
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
                      onClick={() => onAddVariationOption(typeIndex)}
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
                                onUpdateVariationOption(typeIndex, optionIndex, 'name', e.target.value)
                              }
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Price modifier"
                              value={option.price_modifier}
                              onChange={(e) =>
                                onUpdateVariationOption(
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
                              onClick={() => onRemoveVariationOption(typeIndex, optionIndex)}
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
                                onUpdateVariationOption(typeIndex, optionIndex, 'image_url', url)
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
                                onUpdateVariationOption(typeIndex, optionIndex, 'is_default', e.target.checked)
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
  )
}
