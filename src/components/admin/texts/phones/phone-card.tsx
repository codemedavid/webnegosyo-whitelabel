'use client'

import { useState } from 'react'
import { BatteryMedium, MoreHorizontal, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { SendingPhone } from '@/lib/texts/types'
import { phoneChip } from '@/lib/texts/view/chips'
import { monthDayOf, sinceText, timeAgoText, toMs } from '@/lib/texts/view/time'
import { cn } from '@/lib/utils'
import { StatusChip } from '../status-chip'
import { useServerNow, useTexts } from '../texts-context'
import { PhoneName } from './phone-name'

const OFFLINE_STEPS = [
  'Open SmartMenu on the phone.',
  'Turn battery saver off, or set SmartMenu to "Unrestricted".',
  'Keep mobile data or Wi-Fi on.',
  'Check the SIM has load.',
]

function checkedIn(phone: SendingPhone, now: number): string {
  const seen = toMs(phone.lastSeenAt)
  if (seen === null) return 'Hasn’t checked in yet'
  if (phone.state === 'offline') return `Last checked in ${sinceText(seen, now)}`
  return `Checked in ${timeAgoText(phone.lastSeenAt, now)}`
}

interface PhoneCardProps {
  phone: SendingPhone
  isHighlighted: boolean
  onDisconnect: (phone: SendingPhone) => void
}

export function PhoneCard({ phone, isHighlighted, onDisconnect }: PhoneCardProps) {
  const { isOwner, downloadUrl } = useTexts()
  const now = useServerNow()
  const [isEditing, setEditing] = useState(false)
  const [isFixOpen, setFixOpen] = useState(true)
  const connected = toMs(phone.connectedAt)
  const details = [
    connected !== null ? `Connected ${monthDayOf(connected)}${phone.connectedBy ? ` by ${phone.connectedBy}` : ''}` : null,
    phone.appVersion ? `App ${phone.appVersion}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <li id={`phone-${phone.deviceId}`} className={cn('space-y-3 rounded-2xl border bg-card p-4', isHighlighted && 'ring-2 ring-ring')}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><PhoneName phone={phone} isEditing={isEditing} onEditingChange={setEditing} /></div>
        {!isEditing && <StatusChip chip={phoneChip(phone.state, phone.isInactive)} />}
        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" aria-label={`Actions for ${phone.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>Rename</DropdownMenuItem>
              {isOwner && <DropdownMenuItem variant="destructive" onSelect={() => onDisconnect(phone)}>Disconnect</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{checkedIn(phone, now)}</p>
        {details && <p>{details}</p>}
        <p className="tabular-nums">Sent today {phone.sentToday} · Sending {phone.sendingNow}</p>
        {phone.isBatteryUnrestricted === false && (
          <p className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300"><BatteryMedium className="h-4 w-4" aria-hidden="true" /> Battery saver is on for SmartMenu</p>
        )}
      </div>
      {phone.isAppOld && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <span className="font-semibold">Update the app.</span>{' '}
          <a href={downloadUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Download the latest SmartMenu</a>
        </p>
      )}
      {phone.smsPermission === false && (
        <p className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span><span className="font-semibold">SMS permission off.</span> On the phone: Settings → Apps → SmartMenu → Permissions → SMS → Allow.</span>
        </p>
      )}
      {phone.state === 'offline' && (
        <div className="rounded-xl border">
          <button type="button" aria-expanded={isFixOpen} onClick={() => setFixOpen((open) => !open)} className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium">
            Get it back online
          </button>
          {isFixOpen && (
            <ol className="list-decimal space-y-1 px-3 pb-3 pl-8 text-sm text-muted-foreground">
              {OFFLINE_STEPS.map((step) => <li key={step}>{step}</li>)}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}
