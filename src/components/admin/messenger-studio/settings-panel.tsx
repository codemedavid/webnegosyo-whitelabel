'use client'

/**
 * Settings & test tab: bot on/off, what happens when staff reply, the Page
 * connection, and linking the owner's own Messenger for test sends. The test
 * chat itself sits under the phone.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createMessengerTesterCodeAction, readMessengerTesterAction } from '@/app/actions/messenger-automations'
import { TAKEOVER_OPTIONS } from '@/lib/messenger/rule-labels'
import { ChoiceChips, Notice, PanelHeader, SectionLabel, StudioSwitch } from './studio-ui'

interface SettingsPanelProps {
  tenantId: string
  messengerSettingsHref: string
  botEnabled: boolean
  takeoverMinutes: number
  isPageConnected: boolean
  isTesterLinked: boolean
  profileError: string | null
  onBotEnabledChange: (isOn: boolean) => void
  onTakeoverChange: (minutes: number) => void
  onTesterLinkedChange: (isLinked: boolean) => void
}

function TesterLink({ tenantId, isLinked, onLinkedChange }: { tenantId: string; isLinked: boolean; onLinkedChange: (isLinked: boolean) => void }) {
  const [code, setCode] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const getCode = () => startTransition(async () => {
    const result = await createMessengerTesterCodeAction(tenantId)
    if (result.ok) setCode(result.code)
    else toast.error(result.error)
  })
  const check = () => startTransition(async () => {
    const result = await readMessengerTesterAction(tenantId)
    if (!result.ok) { toast.error(result.error); return }
    onLinkedChange(result.isLinked)
    if (result.isLinked) { setCode(null); toast.success('Your Messenger is linked') }
    else toast.message('Not linked yet. Send the code to your Page, then check again.')
  })

  return (
    <div className="space-y-2.5 rounded-[10px] border border-[#E5E0D6] bg-white p-3">
      <p className="text-[12.5px] font-semibold">Test on your phone</p>
      {isLinked ? (
        <p className="flex items-center gap-1.5 text-[12px] text-[#065F46]"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Linked. Use “Send test” in any automation.</p>
      ) : (
        <p className="text-[12px] leading-snug text-[#6B655B]">Link your own Messenger to send yourself any automation before customers see it.</p>
      )}
      {code ? (
        <div className="space-y-2 rounded-lg bg-[#F7F5F0] p-3">
          <p className="text-[12px]">From your own Facebook account, message your Page:</p>
          <p className="font-mono text-[22px] font-bold tracking-wider" aria-live="polite">{code}</p>
          <p className="text-[11px] text-[#8B857B]">Works once, for 10 minutes.</p>
          <button type="button" disabled={isPending} onClick={check} className="min-h-9 rounded-full bg-[#1D1815] px-4 text-[12px] font-extrabold text-white disabled:opacity-40">I sent it</button>
        </div>
      ) : (
        <button type="button" disabled={isPending} onClick={getCode} className="min-h-9 rounded-full border border-[#E5E0D6] px-4 text-[12px] font-bold hover:border-[#1D1815] disabled:opacity-40">
          {isLinked ? 'Link a different Messenger' : 'Get a test code'}
        </button>
      )}
    </div>
  )
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <>
      <PanelHeader title="Settings & test" description="Turn the bot on or off, choose what happens when you reply yourself, and test on your phone." />
      <div className="space-y-5 px-[18px] py-4">
        {!props.isPageConnected ? (
          <Notice>Connect your Facebook Page first (<Link href={props.messengerSettingsHref} className="underline">Messenger settings</Link>). You can set everything up now; the bot starts once the Page is connected.</Notice>
        ) : null}
        {props.profileError ? <Notice tone="red">{props.profileError}</Notice> : null}

        <div className="flex items-center gap-2.5 rounded-[10px] border border-[#E5E0D6] bg-white px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold">Bot answers by itself</span>
            <span className="block text-[11px] leading-snug text-[#8B857B]">Off = the bot never answers. Order summaries from checkout still send.</span>
          </span>
          <StudioSwitch isOn={props.botEnabled} onChange={props.onBotEnabledChange} label="Bot answers by itself" />
        </div>

        <section className="space-y-1.5">
          <SectionLabel>When you reply yourself</SectionLabel>
          <p className="text-[12px] leading-snug text-[#6B655B]">A reply from you or your staff in Page Inbox pauses the bot for that customer, so you don’t talk over each other.</p>
          <ChoiceChips
            label="Pause the bot for"
            options={TAKEOVER_OPTIONS.map((option) => ({ value: option.minutes, label: option.label }))}
            value={props.takeoverMinutes}
            onChange={props.onTakeoverChange}
          />
          <p className="text-[11px] text-[#8B857B]">Type /menu, /categories or /hours in Page Inbox to send that card without pausing.</p>
        </section>

        <section className="space-y-1.5">
          <SectionLabel>Test</SectionLabel>
          <p className="text-[12px] leading-snug text-[#6B655B]">Use <span className="font-bold">Test chat</span> above the phone to try any message here. Nothing is sent.</p>
          <TesterLink tenantId={props.tenantId} isLinked={props.isTesterLinked} onLinkedChange={props.onTesterLinkedChange} />
        </section>
      </div>
    </>
  )
}
