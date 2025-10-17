'use client'

import { Suspense, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const unauthorized = params.get('unauthorized') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPending, startTransition] = useTransition()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        toast.error(error.message)
        return
      }

      // Check role
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      interface AppUserRoleRow { role: 'superadmin' | 'admin' }
      const { data: roleRow, error: roleErr } = await supabase
        .from('app_users')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle<AppUserRoleRow>()

      if (roleErr || !roleRow || roleRow.role !== 'superadmin') {
        toast.error('You are not authorized as superadmin')
        await supabase.auth.signOut()
        return
      }

      toast.success('Welcome, Super Admin!')
      router.replace('/superadmin')
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Super Admin Login</CardTitle>
          <CardDescription>
            Sign in with your superadmin credentials to access the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unauthorized && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              You are not authorized to access that page.
            </div>
          )}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}


