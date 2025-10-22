'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createTenantUser } from '@/actions/users'
import { Loader2 } from 'lucide-react'

interface AddTenantUserDialogProps {
  tenantId: string
  tenantName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddTenantUserDialog({ 
  tenantId, 
  tenantName, 
  open, 
  onOpenChange 
}: AddTenantUserDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    startTransition(async () => {
      const result = await createTenantUser({
        email: formData.email,
        password: formData.password,
        tenant_id: tenantId,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('User created successfully')
        setFormData({ email: '', password: '', confirmPassword: '' })
        onOpenChange(false)
        // Force refresh the page to show the new user
        router.refresh()
      }
    })
  }

  const handleClose = () => {
    if (!isPending) {
      setFormData({ email: '', password: '', confirmPassword: '' })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Admin User</DialogTitle>
          <DialogDescription>
            Create a new administrator account for {tenantName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              This will be used to log in to the admin panel
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={isPending}
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              disabled={isPending}
              minLength={8}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create User'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

