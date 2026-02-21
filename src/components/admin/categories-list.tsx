'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit, Trash2, GripVertical, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '@/app/actions/categories'
import type { Category, Addon } from '@/types/database'

interface CategoryFormData {
  name: string
  icon: string
  description: string
  is_active: boolean
  default_addons: Addon[]
}

interface CategoriesListProps {
  categories: Category[]
  tenantSlug: string
  tenantId: string
}

export function CategoriesList({ categories, tenantSlug, tenantId }: CategoriesListProps) {
  const router = useRouter()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    icon: '',
    description: '',
    is_active: true,
    default_addons: [],
  })

  const handleAdd = () => {
    setEditingCategory(null)
    setFormData({
      name: '',
      icon: '',
      description: '',
      is_active: true,
      default_addons: [],
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      icon: category.icon || '',
      description: category.description || '',
      is_active: category.is_active,
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
      description: formData.description,
      is_active: formData.is_active,
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
          {categories.map((category) => (
            <Card key={category.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <Button variant="ghost" size="icon" className="cursor-grab">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                </Button>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{category.icon}</span>
                    <h3 className="font-semibold">{category.name}</h3>
                    {!category.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  {category.description && (
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  )}
                </div>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(category)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => {
                      setCategoryToDelete(category.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
              <Label htmlFor="icon">Icon (Emoji)</Label>
              <Input
                id="icon"
                placeholder="🍕"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
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

