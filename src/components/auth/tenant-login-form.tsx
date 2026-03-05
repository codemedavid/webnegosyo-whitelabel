'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

interface TenantLoginFormProps {
  tenantSlug: string
  tenantId: string
  redirect: string
  unauthorized?: boolean
}

/**
 * Validates that a redirect URL is a safe, relative path on the same origin.
 * Prevents open redirect attacks by rejecting absolute URLs and protocol-relative URLs.
 */
function getSafeRedirect(redirect: string, fallback: string): string {
  // Must start with / and not // (protocol-relative)
  if (!redirect.startsWith('/') || redirect.startsWith('//')) {
    return fallback
  }
  // Block encoded slashes and backslashes that could bypass the check
  if (redirect.includes('%2f') || redirect.includes('%2F') || redirect.includes('\\')) {
    return fallback
  }
  return redirect
}

export function TenantLoginForm({ tenantSlug, tenantId, redirect, unauthorized }: TenantLoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const supabase = createClient()

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        // Sanitize error messages — don't expose internal Supabase details
        if (signInError.message.toLowerCase().includes('invalid login credentials')) {
          setError('Invalid email or password.')
        } else if (signInError.message.toLowerCase().includes('email not confirmed')) {
          setError('Please verify your email address before signing in.')
        } else if (signInError.status === 429) {
          setError('Too many login attempts. Please wait a moment and try again.')
        } else {
          setError('Unable to sign in. Please check your credentials and try again.')
        }
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError('Login failed. Please try again.')
        setIsLoading(false)
        return
      }

      // Check if user has access to this specific tenant
      const { data: userRoleData, error: roleError } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (roleError || !userRoleData) {
        await supabase.auth.signOut()
        setError('You do not have access to this admin panel.')
        setIsLoading(false)
        return
      }

      const userRole: { role: string; tenant_id: string | null } = userRoleData

      // Verify authorization: must be superadmin OR admin of THIS specific tenant
      const isAuthorized =
        userRole.role === 'superadmin' ||
        (userRole.role === 'admin' && userRole.tenant_id === tenantId)

      if (!isAuthorized) {
        await supabase.auth.signOut()
        setError('You are not authorized to access this admin panel.')
        setIsLoading(false)
        return
      }

      const safeRedirect = getSafeRedirect(redirect, `/${tenantSlug}/admin`)
      toast.success('Login successful!')
      router.push(safeRedirect)
      router.refresh()
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <>
      {unauthorized && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You are not authorized to access this admin panel.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </Button>
      </form>
    </>
  )
}

