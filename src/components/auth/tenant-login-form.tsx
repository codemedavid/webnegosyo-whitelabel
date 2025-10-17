'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { AlertCircle, Loader2 } from 'lucide-react'

interface TenantLoginFormProps {
  tenantSlug: string
  redirect: string
  unauthorized?: boolean
}

export function TenantLoginForm({ redirect, unauthorized }: TenantLoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const supabase = createClient()
      
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError('Login failed. Please try again.')
        setIsLoading(false)
        return
      }

      // Check if user has access
      const { data: userRoleData, error: roleError } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (roleError || !userRoleData) {
        await supabase.auth.signOut()
        setError('You do not have access to this tenant.')
        setIsLoading(false)
        return
      }

      const userRole: { role: string; tenant_id: string | null } = userRoleData

      // Verify authorization for this tenant
      const isAuthorized = 
        userRole.role === 'superadmin' || 
        (userRole.role === 'admin' && userRole.tenant_id)

      if (!isAuthorized) {
        await supabase.auth.signOut()
        setError('You do not have admin access.')
        setIsLoading(false)
        return
      }

      toast.success('Login successful!')
      router.push(redirect)
      router.refresh()
    } catch (error) {
      console.error('Login error:', error)
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
            You are not authorized to access this tenant&apos;s admin panel.
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
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="current-password"
          />
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

