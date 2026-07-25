'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { updateOwnCredentialsAction } from '@/app/actions/staff'

interface AccountSettingsCardProps {
  currentEmail: string
}

export function AccountSettingsCard({ currentEmail }: AccountSettingsCardProps) {
  const [email, setEmail] = useState(currentEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (password && password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setIsSaving(true)
    const result = await updateOwnCredentialsAction({
      email: email !== currentEmail ? email : undefined,
      password: password || undefined,
    })
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setPassword('')
    setConfirmPassword('')
    if (result.emailChangeRequested) {
      toast.success('Check your new email inbox to confirm the address change')
    } else {
      toast.success('Account updated')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your login email and password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-md">
          <Label htmlFor="account-email">Email</Label>
          <Input
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Changing your email sends a confirmation link to the new address.
          </p>
        </div>

        <Separator />

        <div className="grid gap-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="account-password">New password</Label>
            <Input
              id="account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep your current password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-password-confirm">Confirm new password</Label>
            <Input
              id="account-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save Account'}
        </Button>
      </CardContent>
    </Card>
  )
}
