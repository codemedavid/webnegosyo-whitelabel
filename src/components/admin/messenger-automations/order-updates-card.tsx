'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  defaultUpdateText, MAX_ORDER_UPDATE_TEXT, statusLabel, UPDATE_STATUSES,
  type OrderUpdatesConfig, type UpdateStatus,
} from '@/lib/messenger/order-view'

interface OrderUpdatesCardProps {
  config: OrderUpdatesConfig
  /** Convex / per-store-database stores: their orders aren't readable here. */
  isPlatformOrders: boolean
  onChange: (config: OrderUpdatesConfig) => void
}

const STATUS_HELP: Record<UpdateStatus, string> = {
  confirmed: 'You accepted the order.',
  preparing: 'The kitchen started on it.',
  ready: 'Ready for pickup, or ready for the rider.',
  delivered: 'Delivered or picked up.',
  cancelled: 'The order was cancelled.',
}

/** Status messages: which order changes send the customer a Messenger message. */
export function OrderUpdatesCard({ config, isPlatformOrders, onChange }: OrderUpdatesCardProps) {
  const toggleStatus = (status: UpdateStatus, isOn: boolean) => {
    const statuses = isOn ? [...config.statuses, status] : config.statuses.filter((entry) => entry !== status)
    onChange({ ...config, statuses: UPDATE_STATUSES.filter((entry) => statuses.includes(entry)) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order status messages</CardTitle>
        <CardDescription>
          When an order that came from your Page’s chat moves along, the customer gets a message there with their tracking link.
          Messenger only allows this within 24 hours of the customer’s last message, so a customer who went quiet longer gets nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isPlatformOrders ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Your store’s orders are kept on a separate order system, so status messages and “Where is my order” lists can’t be sent yet. Customers are pointed to their tracking link instead.
          </p>
        ) : null}
        <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <span>
            <span className="block font-medium">Send status messages</span>
            <span className="block text-sm text-muted-foreground">Off = customers check the tracking link themselves.</span>
          </span>
          <Switch checked={config.enabled} onCheckedChange={(enabled) => onChange({ ...config, enabled })} />
        </label>

        {config.enabled ? (
          <ul className="space-y-3">
            {UPDATE_STATUSES.map((status) => {
              const isOn = config.statuses.includes(status)
              const text = config.texts[status] ?? ''
              const id = `order-update-${status}`
              return (
                <li key={status} className="space-y-2 rounded-lg border p-3">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block font-medium">{statusLabel(status, null)}</span>
                      <span className="block text-xs text-muted-foreground">{STATUS_HELP[status]}</span>
                    </span>
                    <Switch aria-label={`Message when ${statusLabel(status, null).toLowerCase()}`} checked={isOn} onCheckedChange={(checked) => toggleStatus(status, checked)} />
                  </label>
                  {isOn ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={id} className="text-xs">Message (optional)</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">{Array.from(text).length}/{MAX_ORDER_UPDATE_TEXT}</span>
                      </div>
                      <Textarea
                        id={id}
                        rows={2}
                        maxLength={MAX_ORDER_UPDATE_TEXT}
                        value={text}
                        placeholder={defaultUpdateText(status, status === 'ready' || status === 'delivered' ? 'pickup' : null)}
                        onChange={(event) => onChange({ ...config, texts: { ...config.texts, [status]: event.target.value } })}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Blank uses the wording shown (it changes for pickup and delivery). You can use {'{store}'} and {'{order}'} (the order number). A “Track order” button is always added.
        </p>
      </CardContent>
    </Card>
  )
}
