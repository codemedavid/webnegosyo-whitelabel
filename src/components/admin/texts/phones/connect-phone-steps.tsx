'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useTexts } from '../texts-context'
/** Navigation only, never a credential: opens the app's Texts → Rules screen. */
const APP_TEXTS_RULES = 'webnegosyo-admin://texts?tab=rules'

/** How to connect a sending phone; also the body of the "No phone yet" state. */
export function ConnectPhoneSteps() {
  // The sending build is a sideloaded APK, never the Play Store: install from the platform's download page.
  const { downloadUrl } = useTexts()
  return (
    <div className="space-y-4">
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <Step n={1} />
          <span>Use an Android phone with your store&apos;s SIM. A separate SIM for the store is safest: carriers can block a number that sends a lot.</span>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <span>
            Install SmartMenu and sign in as the owner.{' '}
            <a href={downloadUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-medium underline underline-offset-2 sm:min-h-0">Download the Android app</a>
          </span>
        </li>
        <li className="flex gap-3">
          <Step n={3} />
          <span>On the phone open <strong>Texts → Rules → Sending phone</strong> and tap <strong>Use this phone</strong>.</span>
        </li>
        <li className="flex gap-3">
          <Step n={4} />
          <span>Turn battery saver off for SmartMenu, so it can send in the background.</span>
        </li>
      </ol>
      <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-3">
        <QRCodeSVG value={APP_TEXTS_RULES} size={88} aria-label="QR code that opens Texts, Rules in the SmartMenu app" />
        <p className="text-xs text-muted-foreground">Scan with the phone to jump straight to Texts → Rules in SmartMenu.</p>
      </div>
      <p className="text-xs text-muted-foreground">This page updates by itself once the phone connects.</p>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold" aria-hidden="true">{n}</span>
  )
}
