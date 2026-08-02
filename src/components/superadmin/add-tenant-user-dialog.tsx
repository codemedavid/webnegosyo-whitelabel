'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createTenantUser, type TenantUser } from '@/actions/users'
import { AlertCircle, Check, Crown, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { findTenantOwner } from '@/lib/tenant-ownership'

interface AddTenantUserDialogProps {
  tenantId: string
  tenantName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The store's current accounts, so a second owner is never offered. */
  existingUsers?: readonly TenantUser[]
  onUserCreated?: (user: { user_id: string; email: string; is_owner: boolean }) => void
}

const fieldClass =
  'h-11 rounded-xl border-white/10 bg-white/[0.03] text-white placeholder:text-white/35 focus-visible:border-white/25 focus-visible:ring-white/10'

const ROLE_OPTIONS = [
  {
    value: 'owner',
    label: 'Store Owner',
    description: 'Full access, manages staff, and does not use up a staff seat.',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full feature access, but cannot manage staff and uses a staff seat.',
  },
] as const

type RoleOption = (typeof ROLE_OPTIONS)[number]['value']

export function AddTenantUserDialog({
  tenantId,
  tenantName,
  open,
  onOpenChange,
  existingUsers = [],
  onUserCreated,
}: AddTenantUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })

  // A store has exactly one owner, so the choice only exists while it has
  // none — and when it has none, that is the gap worth closing by default.
  const hasOwner = findTenantOwner(existingUsers) !== null
  const [role, setRole] = useState<RoleOption>(hasOwner ? 'admin' : 'owner')
  const selectedRole: RoleOption = hasOwner ? 'admin' : role

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

    const isOwner = selectedRole === 'owner'
    const result = await createTenantUser({
      email: formData.email,
      password: formData.password,
      tenant_id: tenantId,
      is_owner: isOwner,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(isOwner ? 'Store owner created' : 'User created successfully')
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
      setRole(hasOwner ? 'admin' : 'owner')
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
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-white/60">Role</legend>
            <div className="grid gap-2">
              {ROLE_OPTIONS.map((option) => {
                const isDisabled = option.value === 'owner' && hasOwner
                const isSelected = selectedRole === option.value
                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                      isSelected
                        ? 'border-amber-400/30 bg-amber-400/[0.07]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                      isDisabled && 'cursor-not-allowed opacity-45 hover:border-white/10',
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={option.value}
                      checked={isSelected}
                      disabled={isDisabled || isSubmitting}
                      onChange={() => setRole(option.value)}
                      className="mt-1 h-4 w-4 shrink-0 accent-amber-400"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                        {option.value === 'owner' && (
                          <Crown className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                        )}
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/45">
                        {isDisabled
                          ? `${tenantName} already has an owner — transfer ownership from the user list instead.`
                          : option.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

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
