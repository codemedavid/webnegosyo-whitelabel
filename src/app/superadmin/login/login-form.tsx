'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Shield, Loader2, AlertCircle } from 'lucide-react'

export default function LoginForm() {
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

      toast.success('Welcome back!')
      router.replace('/superadmin')
    })
  }

  return (
    <div className="superadmin-shell relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4">
      {/* Faint top glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(255,255,255,0.08),transparent_70%)]"
      />

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-[0_0_30px_-8px_rgba(255,255,255,0.5)]">
            <Shield className="h-6 w-6 text-black" />
          </div>
          <div className="flex flex-col items-center space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-white">WebNegosyo</h1>
            <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
              Platform Administration
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="space-y-1 pb-5">
            <h2 className="text-lg font-semibold text-white">Sign in</h2>
            <p className="text-sm text-white/55">
              Enter your credentials to access the admin panel
            </p>
          </div>

          {unauthorized && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>You are not authorized to access that page.</span>
            </div>
          )}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/60">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@webnegosyo.com"
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/60">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-white/35">
          Protected area. Authorized personnel only.
        </p>
      </div>
    </div>
  )
}
