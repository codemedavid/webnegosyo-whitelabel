'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Addon {
  id: string
  name: string
  price: number
}

interface AddonEditorProps {
  addons: Addon[]
  onAddAddon: () => void
  onRemoveAddon: (index: number) => void
  onUpdateAddon: (index: number, field: string, value: string | number | boolean) => void
}

export function AddonEditor({
  addons,
  onAddAddon,
  onRemoveAddon,
  onUpdateAddon,
}: AddonEditorProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Add-ons</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={onAddAddon}>
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
                  onChange={(e) => onUpdateAddon(index, 'name', e.target.value)}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={addon.price}
                  onChange={(e) => onUpdateAddon(index, 'price', parseFloat(e.target.value))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveAddon(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
