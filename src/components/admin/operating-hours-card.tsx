'use client'

import { useState } from 'react'
import { Clock, Save, Copy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { updateOperatingHoursAction } from '@/actions/tenants'
import { buildDefaultOperatingHours, normalizeOperatingHours, type OperatingHours } from '@/lib/operating-hours'

// Monday-first display order (Sunday last) — the keys still map to Date.getDay().
const DAY_LABELS: { key: string; label: string }[] = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
]

interface OperatingHoursCardProps {
  tenantId: string
  initialHours: OperatingHours | null
  initialTimezone: string | null
}

export function OperatingHoursCard({ tenantId, initialHours, initialTimezone }: OperatingHoursCardProps) {
  const [hours, setHours] = useState<OperatingHours>(
    () => normalizeOperatingHours(initialHours) ?? buildDefaultOperatingHours()
  )
  const [isSaving, setIsSaving] = useState(false)
  const timezone = initialTimezone || 'Asia/Manila'

  // Immutable update — never mutate the existing hours object.
  const updateDay = (key: string, patch: Partial<{ closed: boolean; open: string; close: string }>) => {
    setHours((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { closed: false, open: '09:00', close: '21:00' }), ...patch },
    }))
  }

  const copyMondayToAll = () => {
    const monday = hours['1']
    if (!monday) return
    setHours((prev) => {
      const next: OperatingHours = { ...prev }
      for (const { key } of DAY_LABELS) next[key] = { ...monday }
      return next
    })
    toast.success("Applied Monday's hours to every day")
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await updateOperatingHoursAction(tenantId, hours, timezone)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('Operating hours saved')
      }
    } catch {
      toast.error('Failed to save operating hours')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" /> Operating Hours
        </CardTitle>
        <CardDescription>
          Used for advance / scheduled orders — customers can only pick a pickup or delivery time while
          you&apos;re open. Switch a day off to mark it closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {DAY_LABELS.map(({ key, label }) => {
          const day = hours[key] ?? { closed: false, open: '09:00', close: '21:00' }
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-b-0 last:pb-0">
              <div className="w-28 font-medium">{label}</div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!day.closed}
                  onCheckedChange={(open) => updateDay(key, { closed: !open })}
                  aria-label={`${label} open`}
                />
                <span className="text-sm text-muted-foreground w-14">{day.closed ? 'Closed' : 'Open'}</span>
              </div>
              {!day.closed && (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={day.open}
                    onChange={(e) => updateDay(key, { open: e.target.value })}
                    className="w-32"
                    aria-label={`${label} opening time`}
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={day.close}
                    onChange={(e) => updateDay(key, { close: e.target.value })}
                    className="w-32"
                    aria-label={`${label} closing time`}
                  />
                </div>
              )}
            </div>
          )
        })}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={copyMondayToAll}>
            <Copy className="mr-2 h-4 w-4" /> Copy Monday to all
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving…' : 'Save Hours'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
