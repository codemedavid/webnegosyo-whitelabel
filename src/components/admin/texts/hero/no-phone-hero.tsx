'use client'

import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_TEXTS_RULES } from '../phones/connect-phone-steps'

const STEPS = [
  { title: 'Get SmartMenu', body: 'On an Android phone with your store’s SIM.' },
  { title: 'Use this phone', body: 'Texts → Rules → Sending phone.' },
  { title: 'Battery saver off', body: 'So it can send in the background.' },
]

/** No phone yet: inviting, and it teaches the three steps right here. */
export function NoPhoneHero({ downloadUrl, onConnect }: { downloadUrl: string; onConnect: () => void }) {
  return (
    <section aria-label="Sending phone" className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-wn-coral-wash via-white to-white p-6 shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 gap-5">
          <Image src="/assistant/owl-96.webp" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-2xl ring-1 ring-wn-line" />
          <div className="min-w-0 space-y-4">
            <div>
              <p className="text-lg font-semibold tracking-tight">Connect your store’s phone</p>
              <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-foreground/75">
                Texts go out from your own Android phone, using its SIM. Until you connect one, you can write and schedule campaigns, but nothing is sent.
              </p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3 rounded-xl border border-wn-line bg-white/70 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wn-ink text-xs font-semibold text-white" aria-hidden="true">{index + 1}</span>
                  <span className="text-sm"><span className="block font-medium">{step.title}</span><span className="text-wn-stone">{step.body}</span></span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-11 rounded-full px-5 sm:min-h-10" onClick={onConnect}>How to connect <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
              <Button asChild variant="outline" className="min-h-11 rounded-full bg-white px-5 sm:min-h-10">
                <a href={downloadUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4" aria-hidden="true" /> Download the app</a>
              </Button>
            </div>
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-center gap-2 rounded-2xl border border-wn-line bg-white p-4 lg:flex">
          <QRCodeSVG value={APP_TEXTS_RULES} size={104} aria-label="QR code that opens Texts, Rules in the SmartMenu app" />
          <p className="max-w-[120px] text-center text-[11px] leading-snug text-wn-stone">Scan with the phone to jump to Texts → Rules</p>
        </div>
      </div>
    </section>
  )
}
