'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit, Trash2, GripVertical, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createCategoryAction, updateCategoryAction, deleteCategoryAction, reorderCategoriesAction } from '@/app/actions/categories'
import type { Category, Addon } from '@/types/database'
import { CategoryIcon } from '@/components/shared/category-icon'
import { IconPicker } from '@/components/admin/icon-picker'

interface CategoryFormData {
  name: string
  icon: string
  icon_color: string
  description: string
  is_active: boolean
  display_layout: 'grid' | 'horizontal_scroll' | 'horizontal_mobile_only' | 'horizontal_desktop_only'
  default_addons: Addon[]
}

interface CategoriesListProps {
  categories: Category[]
  tenantSlug: string
  tenantId: string
}

function SortableCategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: Category
  onEdit: (category: Category) => void
  onDelete: (categoryId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <Card ref={setNodeRef} style={style}>
      <CardContent className="flex items-center gap-4 p-4">
        <Button
          variant="ghost"
          size="icon"
          className="cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </Button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CategoryIcon icon={category.icon} color={category.icon_color} size="md" />
            <h3 className="font-semibold">{category.name}</h3>
            {!category.is_active && <Badge variant="secondary">Inactive</Badge>}
            {category.display_layout && category.display_layout !== 'grid' && (
              <Badge variant="outline" className="text-xs">
                {category.display_layout === 'horizontal_scroll' ? 'Horizontal' :
                 category.display_layout === 'horizontal_mobile_only' ? 'Horizontal (Mobile)' :
                 'Horizontal (Desktop)'}
              </Badge>
            )}
          </div>
          {category.description && (
            <p className="text-sm text-muted-foreground">{category.description}</p>
          )}
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(category)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => onDelete(category.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function CategoriesList({ categories: initialCategories, tenantSlug, tenantId }: CategoriesListProps) {
  const router = useRouter()
  const dndId = useId()
  const [categories, setCategories] = useState(initialCategories)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    icon: '',
    icon_color: '',
    description: '',
    is_active: true,
    display_layout: 'grid',
    default_addons: [],
  })
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)

    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)

    const result = await reorderCategoriesAction(
      tenantId,
      tenantSlug,
      reordered.map((c) => c.id)
    )

    if (!result.success) {
      setCategories(categories)
      toast.error(result.error || 'Failed to reorder categories')
    } else {
      toast.success('Categories reordered')
    }
  }

  const handleAdd = () => {
    setEditingCategory(null)
    setFormData({
      name: '',
      icon: '',
      icon_color: '',
      description: '',
      is_active: true,
      display_layout: 'grid',
      default_addons: [],
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      icon: category.icon || '',
      icon_color: category.icon_color || '',
      description: category.description || '',
      is_active: category.is_active,
      display_layout: category.display_layout || 'grid',
      default_addons: category.default_addons || [],
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Category name is required')
      return
    }

    setIsSubmitting(true)

    const input = {
      name: formData.name,
      icon: formData.icon,
      icon_color: formData.icon_color || undefined,
      description: formData.description,
      is_active: formData.is_active,
      display_layout: formData.display_layout,
      order: editingCategory?.order || categories.length,
      default_addons: formData.default_addons,
    }

    const result = editingCategory
      ? await updateCategoryAction(editingCategory.id, tenantId, tenantSlug, input)
      : await createCategoryAction(tenantId, tenantSlug, input)

    if (result.success) {
      toast.success(editingCategory ? 'Category updated!' : 'Category created!')
      setIsDialogOpen(false)
      setEditingCategory(null)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to save category')
    }

    setIsSubmitting(false)
  }

  const handleDelete = async () => {
    if (!categoryToDelete) return

    setIsDeleting(true)
    const result = await deleteCategoryAction(categoryToDelete, tenantId, tenantSlug)

    if (result.success) {
      toast.success('Category deleted successfully')
      setDeleteDialogOpen(false)
      setCategoryToDelete(null)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to delete category')
    }
    setIsDeleting(false)
  }

  return (
    <>
      {categories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plus className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No categories found</h3>
            <p className="text-muted-foreground mb-4">
              Create categories to organize your menu items
            </p>
            <Button onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-end mb-4">
            <Button onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </div>
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={categories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {categories.map((category) => (
                <SortableCategoryCard
                  key={category.id}
                  category={category}
                  onEdit={handleEdit}
                  onDelete={(id) => {
                    setCategoryToDelete(id)
                    setDeleteDialogOpen(true)
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Category Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Appetizers"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2 h-10"
                onClick={() => setIconPickerOpen(true)}
              >
                {formData.icon ? (
                  <CategoryIcon
                    icon={formData.icon}
                    color={formData.icon_color}
                    size="sm"
                  />
                ) : (
                  <span className="text-muted-foreground">No icon</span>
                )}
                <span className="text-muted-foreground text-sm">
                  {formData.icon ? 'Change icon' : 'Choose an icon'}
                </span>
              </Button>
              <IconPicker
                open={iconPickerOpen}
                onOpenChange={setIconPickerOpen}
                value={formData.icon}
                color={formData.icon_color}
                fallbackColor="#ea580c"
                onSelect={(icon, color) =>
                  setFormData({ ...formData, icon, icon_color: color })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_layout">Display Layout</Label>
              <Select
                value={formData.display_layout}
                onValueChange={(value: CategoryFormData['display_layout']) =>
                  setFormData({ ...formData, display_layout: value })
                }
              >
                <SelectTrigger id="display_layout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid (All Devices)</SelectItem>
                  <SelectItem value="horizontal_scroll">Horizontal Scroll (All Devices)</SelectItem>
                  <SelectItem value="horizontal_mobile_only">Horizontal Scroll (Mobile Only)</SelectItem>
                  <SelectItem value="horizontal_desktop_only">Horizontal Scroll (Desktop Only)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Horizontal scroll displays items in a swipeable row on the customer menu.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>

            {/* Default Add-ons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Default Add-ons</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      default_addons: [
                        ...formData.default_addons,
                        { id: crypto.randomUUID(), name: '', price: 0 },
                      ],
                    })
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                These add-ons will appear on all items in this category.
              </p>
              {formData.default_addons.map((addon, index) => (
                <div key={addon.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Add-on name"
                    value={addon.name}
                    onChange={(e) => {
                      const updated = [...formData.default_addons]
                      updated[index] = { ...updated[index], name: e.target.value }
                      setFormData({ ...formData, default_addons: updated })
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    value={addon.price || ''}
                    onChange={(e) => {
                      const updated = [...formData.default_addons]
                      updated[index] = { ...updated[index], price: parseFloat(e.target.value) || 0 }
                      setFormData({ ...formData, default_addons: updated })
                    }}
                    className="w-24"
                    min={0}
                    step={0.01}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      const updated = formData.default_addons.filter((_, i) => i !== index)
                      setFormData({ ...formData, default_addons: updated })
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the category.
              Menu items in this category will not be deleted, but will be uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
