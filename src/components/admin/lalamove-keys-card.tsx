'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateLalamoveKeysAction } from '@/app/actions/staff'

interface LalamoveKeysCardProps {
  tenantId: string
  tenantSlug: string
  hasExistingKeys: boolean
}

export function LalamoveKeysCard({ tenantId, tenantSlug, hasExistingKeys }: LalamoveKeysCardProps) {
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    const result = await updateLalamoveKeysAction(tenantId, tenantSlug, { apiKey, secretKey })
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setApiKey('')
    setSecretKey('')
    toast.success('Lalamove keys saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lalamove API Keys</CardTitle>
        <CardDescription>
          {hasExistingKeys
            ? 'Keys are configured. Enter new values to replace them — existing keys are never shown.'
            : 'Connect your Lalamove account to enable delivery bookings.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="lalamove-api-key">API Key</Label>
            <Input
              id="lalamove-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasExistingKeys ? '••••••••••••' : 'pk_...'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lalamove-secret-key">Secret Key</Label>
            <Input
              id="lalamove-secret-key"
              type="password"
              autoComplete="off"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={hasExistingKeys ? '••••••••••••' : 'sk_...'}
            />
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving || !apiKey || !secretKey}>
          {isSaving ? 'Saving…' : 'Save Keys'}
        </Button>
      </CardContent>
    </Card>
  )
}
