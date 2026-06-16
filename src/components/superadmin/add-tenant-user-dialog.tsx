'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createTenantUser } from '@/actions/users'
import { AlertCircle, Check, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddTenantUserDialogProps {
  tenantId: string
  tenantName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated?: (user: { user_id: string; email: string }) => void
}

const fieldClass =
  'h-11 rounded-xl border-white/10 bg-white/[0.03] text-white placeholder:text-white/35 focus-visible:border-white/25 focus-visible:ring-white/10'

export function AddTenantUserDialog({
  tenantId,
  tenantName,
  open,
  onOpenChange,
  onUserCreated,
}: AddTenantUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })

  const passwordTooShort = formData.password.length > 0 && formData.password.length < 8
  const passwordsMismatch =
    formData.confirmPassword.length > 0 && formData.password !== formData.confirmPassword
  const passwordsMatch =
    formData.confirmPassword.length > 0 && formData.password === formData.confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
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

    setIsSubmitting(true)

    const result = await createTenantUser({
      email: formData.email,
      password: formData.password,
      tenant_id: tenantId,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('User created successfully')
      // Notify parent to update the list optimistically
      if (result.user && onUserCreated) {
        onUserCreated(result.user)
      }
      setFormData({ email: '', password: '', confirmPassword: '' })
      onOpenChange(false)
    }

    setIsSubmitting(false)
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({ email: '', password: '', confirmPassword: '' })
      setShowPassword(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-2xl border-white/10 bg-[#0a0a0a] sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
            <UserPlus className="h-5 w-5 text-white" />
          </div>
          <DialogTitle className="text-lg font-semibold tracking-tight text-white">
            Add Admin User
          </DialogTitle>
          <DialogDescription className="text-sm text-white/55">
            Create a new administrator account for{' '}
            <span className="font-medium text-white/80">{tenantName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-medium text-white/60">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              className={fieldClass}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={isSubmitting}
            />
            <p className="text-xs text-white/45">Used to log in to the admin panel.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-medium text-white/60">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 8 characters"
                className={cn(fieldClass, 'pr-10', passwordTooShort && 'border-red-400/40')}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                disabled={isSubmitting}
                minLength={8}
                aria-invalid={passwordTooShort}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordTooShort && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                Password must be at least 8 characters
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-xs font-medium text-white/60">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="Re-enter password"
              className={cn(
                fieldClass,
                passwordsMismatch && 'border-red-400/40',
                passwordsMatch && 'border-emerald-400/30',
              )}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              disabled={isSubmitting}
              minLength={8}
              aria-invalid={passwordsMismatch}
            />
            {passwordsMismatch && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                Passwords do not match
              </p>
            )}
            {passwordsMatch && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Passwords match
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-xl border-white/15 bg-transparent text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-white text-black hover:bg-white/90"
            >
              {isSubmitting ? (
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
