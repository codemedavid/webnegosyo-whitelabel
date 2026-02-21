'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SimpleImageUpload } from '@/components/shared/simple-image-upload'
import { updateTenantFlashScreenForAdminAction } from '@/actions/tenants'
import { toast } from 'sonner'

interface FlashScreenCardProps {
  tenantId: string
  initialSettings: {
    isActive: boolean
    title: string
    subtitle: string
    imageUrl: string
    backgroundColor: string
    textColor: string
    durationMs: number
  }
}

export function FlashScreenCard({ tenantId, initialSettings }: FlashScreenCardProps) {
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState(initialSettings)

  const normalizeDuration = (value: number) => {
    if (Number.isNaN(value)) return 2000
    return Math.min(15000, Math.max(500, value))
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateTenantFlashScreenForAdminAction(tenantId, {
        flash_screen_is_active: formData.isActive,
        flash_screen_title: formData.title,
        flash_screen_subtitle: formData.subtitle,
        flash_screen_image_url: formData.imageUrl,
        flash_screen_background_color: formData.backgroundColor,
        flash_screen_text_color: formData.textColor,
        flash_screen_duration_ms: normalizeDuration(formData.durationMs),
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Flash screen settings updated!')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flash Screen</CardTitle>
        <CardDescription>
          Configure what customers see when they first open your app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="flash-screen-active">Enable Flash Screen</Label>
            <p className="text-sm text-muted-foreground">
              Show this screen briefly before the menu loads.
            </p>
          </div>
          <Switch
            id="flash-screen-active"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
            disabled={isPending}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="flash-screen-title">Title</Label>
          <Input
            id="flash-screen-title"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Loading menu..."
            maxLength={120}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="flash-screen-subtitle">Subtitle</Label>
          <Textarea
            id="flash-screen-subtitle"
            value={formData.subtitle}
            onChange={(e) => setFormData((prev) => ({ ...prev, subtitle: e.target.value }))}
            placeholder="Please wait while we prepare your experience."
            maxLength={240}
            disabled={isPending}
          />
        </div>

        <SimpleImageUpload
          currentImageUrl={formData.imageUrl}
          onImageUploaded={(url) => setFormData((prev) => ({ ...prev, imageUrl: url }))}
          folder="tenants/flash-screens"
          label="Flash Screen Image"
          description="Optional logo or brand image."
          disabled={isPending}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="flash-screen-bg-color">Background Color</Label>
            <div className="flex gap-2">
              <Input
                id="flash-screen-bg-color"
                type="color"
                value={formData.backgroundColor}
                onChange={(e) => setFormData((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                className="h-10 w-20"
                disabled={isPending}
              />
              <Input
                value={formData.backgroundColor}
                onChange={(e) => setFormData((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                placeholder="#111111"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="flash-screen-text-color">Text Color</Label>
            <div className="flex gap-2">
              <Input
                id="flash-screen-text-color"
                type="color"
                value={formData.textColor}
                onChange={(e) => setFormData((prev) => ({ ...prev, textColor: e.target.value }))}
                className="h-10 w-20"
                disabled={isPending}
              />
              <Input
                value={formData.textColor}
                onChange={(e) => setFormData((prev) => ({ ...prev, textColor: e.target.value }))}
                placeholder="#ffffff"
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="flash-screen-duration">Display Duration (ms)</Label>
          <Input
            id="flash-screen-duration"
            type="number"
            min={500}
            max={15000}
            step={100}
            value={formData.durationMs}
            onChange={(e) => setFormData((prev) => ({
              ...prev,
              durationMs: normalizeDuration(Number.parseInt(e.target.value, 10)),
            }))}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">Allowed range: 500 - 15000 ms.</p>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Flash Screen'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
