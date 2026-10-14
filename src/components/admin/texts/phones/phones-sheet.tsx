'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { disconnectPhoneAction } from '@/app/actions/texts'
import type { SendingPhone } from '@/lib/texts/types'
import { ConfirmDialog } from '../confirm-dialog'
import { DEMO_READONLY, runAction } from '../run-action'
import { SheetFrame } from '../sheet-frame'
import { useTexts } from '../texts-context'
import { useConfirm } from '../use-confirm'
import { ConnectPhoneSteps } from './connect-phone-steps'
import { PhoneCard } from './phone-card'
import { useNewPhone } from './use-new-phone'

/** `?phones=1`: every sending phone, how to fix one, and how to add another. */
export function PhonesSheet() {
  const { url, setUrl, live, tenantId, isDemo, refresh } = useTexts()
  const isOpen = url.phones
  const phones = live.sender.phones
  const max = live.sender.maxPhones
  const [isAddOpen, setAddOpen] = useState(false)
  const newPhone = useNewPhone(phones, isOpen)
  const { ask, dialogProps } = useConfirm()

  useEffect(() => {
    if (!isOpen || !url.phone) return
    const frame = requestAnimationFrame(() => document.getElementById(`phone-${url.phone}`)?.scrollIntoView({ block: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [isOpen, url.phone])

  const disconnect = (phone: SendingPhone) => {
    if (isDemo) return void toast.info(DEMO_READONLY)
    const isLast = phones.length <= 1
    ask({
      title: `Disconnect ${phone.name}?`,
      body: isLast
        ? 'This is your only phone. Nothing will go out, including scheduled campaigns and automatic texts, until you connect another.'
        : "It stops sending for your store right away. Texts it hadn't sent go back in line for your other phone.",
      cancelLabel: 'Keep it',
      confirmLabel: 'Disconnect',
      isDestructive: true,
      onConfirm: async () => {
        const done = await runAction(() => disconnectPhoneAction(tenantId, phone.deviceId), "Couldn't disconnect the phone. Try again.")
        if (done !== null) { toast.success(`${phone.name} is disconnected.`); refresh() }
      },
    })
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && setUrl({ phones: false })}>
      <SheetContent side="right" hideCloseButton className="w-full gap-0 p-0 sm:max-w-md">
        <SheetFrame title="Sending phones" description="Texts go out from these phones, using their own SIM." onClose={() => setUrl({ phones: false })}>
          <div className="space-y-4 p-4">
            {newPhone && (
              <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CircleCheck className="h-4 w-4" aria-hidden="true" /> {newPhone} is connected
              </p>
            )}
            {phones.length === 0 ? (
              <ConnectPhoneSteps />
            ) : (
              <>
                <ul className="space-y-3">
                  {phones.map((phone) => <PhoneCard key={phone.deviceId} phone={phone} isHighlighted={url.phone === phone.deviceId} onDisconnect={disconnect} />)}
                </ul>
                {phones.length >= max ? (
                  <p className="text-sm text-muted-foreground">{max} of {max} phones. Disconnect one to add another.</p>
                ) : (
                  <div className="rounded-2xl border">
                    <button type="button" aria-expanded={isAddOpen} onClick={() => setAddOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-medium">
                      Add another phone · {phones.length} of {max}
                      <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${isAddOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {isAddOpen && <div className="border-t p-4"><ConnectPhoneSteps /></div>}
                  </div>
                )}
              </>
            )}
          </div>
        </SheetFrame>
        <ConfirmDialog {...dialogProps} />
      </SheetContent>
    </Sheet>
  )
}
