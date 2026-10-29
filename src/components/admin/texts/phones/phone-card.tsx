'use client'

import { useState } from 'react'
import { BatteryMedium, ChevronDown, MoreHorizontal, ShieldAlert, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { SendingPhone } from '@/lib/texts/types'
import { phoneChip } from '@/lib/texts/view/chips'
import { monthDayOf, sinceText, timeAgoText, toMs } from '@/lib/texts/view/time'
import { cn } from '@/lib/utils'
import { IconTile, StatusChip } from '../status-chip'
import { useServerNow, useTexts } from '../texts-context'
import { KeepAwakeSteps } from './keep-awake-steps'
import { PhoneName } from './phone-name'

const OFFLINE_STEPS = [
  'Open SmartMenu on the phone and check "Use this phone" is on.',
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
  /** Only the first offline phone opens its fix steps; the rest stay folded. */
  isFixOpenAtFirst?: boolean
  onDisconnect: (phone: SendingPhone) => void
}

export function PhoneCard({ phone, isHighlighted, isFixOpenAtFirst = true, onDisconnect }: PhoneCardProps) {
  const { isOwner, downloadUrl } = useTexts()
  const now = useServerNow()
  const [isEditing, setEditing] = useState(false)
  const [isFixOpen, setFixOpen] = useState(isFixOpenAtFirst || isHighlighted)
  const [isAwakeOpen, setAwakeOpen] = useState(false)
  const isTroubled = phone.state === 'offline' || phone.state === 'late'
  const connected = toMs(phone.connectedAt)

  const chip = phoneChip(phone.state, phone.isInactive)
  const meta: { label: string; value: string }[] = [
    { label: 'Checked in', value: checkedIn(phone, now).replace(/^(Checked in|Last checked in) /, '') },
    { label: 'Sent today', value: `${phone.sentToday}${phone.sendingNow > 0 ? ` · ${phone.sendingNow} sending` : ''}` },
    ...(connected !== null ? [{ label: 'Connected', value: `${monthDayOf(connected)}${phone.connectedBy ? ` by ${phone.connectedBy}` : ''}` }] : []),
    ...(phone.appVersion ? [{ label: 'App', value: phone.appVersion }] : []),
  ]

  return (
    <li id={`phone-${phone.deviceId}`} className={cn('space-y-4 rounded-2xl border border-wn-line bg-white p-4 shadow-[0_1px_2px_rgba(29,24,21,0.04)]', isHighlighted && 'ring-2 ring-wn-ink/60')}>
      <div className="flex items-center gap-3">
        <IconTile tone={chip.tone}><Smartphone /></IconTile>
        <div className="min-w-0 flex-1">
          <PhoneName phone={phone} isEditing={isEditing} onEditingChange={setEditing} />
          {!isEditing && <StatusChip chip={chip} className="mt-0.5" />}
        </div>
        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-11 rounded-full sm:size-9" aria-label={`Actions for ${phone.name}`}>
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
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-wn-sand/70 p-3">
        {meta.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-wn-stone">{row.label}</dt>
            <dd className="truncate text-sm tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      {phone.isBatteryUnrestricted === false && (
        <p className="flex items-center gap-2 text-sm text-amber-800"><BatteryMedium className="h-4 w-4" aria-hidden="true" /> Battery saver is on for SmartMenu</p>
      )}
      {phone.isAppOld && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">Update the app.</span>{' '}
          <a href={downloadUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Download the latest SmartMenu</a>
        </p>
      )}
      {phone.smsPermission === false && (
        <p className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span><span className="font-semibold">SMS permission off.</span> On the phone: Settings → Apps → SmartMenu → Permissions → SMS → Allow.</span>
        </p>
      )}
      {isTroubled && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <button type="button" aria-expanded={isFixOpen} onClick={() => setFixOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between px-3.5 text-left text-sm font-semibold text-amber-900">
            Get it back online
            <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', isFixOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          {isFixOpen && (
            <ol className="space-y-2 px-3.5 pb-3.5 text-sm text-amber-900">
              {OFFLINE_STEPS.map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold text-white" aria-hidden="true">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold text-white" aria-hidden="true">{OFFLINE_STEPS.length + 1}</span>
                <div className="min-w-0 space-y-1.5">
                  <span>Stop the phone from putting SmartMenu to sleep:</span>
                  <KeepAwakeSteps manufacturer={phone.manufacturer} model={phone.model} />
                </div>
              </li>
            </ol>
          )}
        </div>
      )}
      {!isTroubled && (
        <div className="rounded-xl border border-wn-line">
          <button type="button" aria-expanded={isAwakeOpen} onClick={() => setAwakeOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between px-3.5 text-left text-sm font-medium">
            Keep it sending in the background
            <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', isAwakeOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          {isAwakeOpen && <div className="px-3.5 pb-3.5"><KeepAwakeSteps manufacturer={phone.manufacturer} model={phone.model} /></div>}
        </div>
      )}
    </li>
  )
}
