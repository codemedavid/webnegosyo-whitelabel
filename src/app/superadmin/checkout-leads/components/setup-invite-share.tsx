'use client'

import { useState } from 'react'
import { Check, Copy, Mail, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { buildSetupInvite } from '@/lib/onboarding/invite'

export interface SetupInviteContact {
  name: string
  businessName: string
  phone: string | null
  email: string | null
}

const BUTTON = 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.06]'

async function copyText(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
    return true
  } catch {
    toast.warning(`Could not copy the ${what.toLowerCase()} — select it and copy by hand.`)
    return false
  }
}

/**
 * A freshly issued set-up link, ready to send: the link, a Taglish message
 * that explains it, and one-tap SMS / email drafts addressed to the buyer.
 * Nothing is sent from the server — staff send it from their own phone/mail.
 */
export function SetupInviteShare({ url, contact }: { url: string; contact: SetupInviteContact }) {
  const invite = buildSetupInvite({ ownerName: contact.name, businessName: contact.businessName, url, phone: contact.phone, email: contact.email })
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)

  async function copy(kind: 'link' | 'message') {
    const ok = await copyText(kind === 'link' ? url : invite.message, kind === 'link' ? 'Link' : 'Message')
    setCopied(ok ? kind : null)
  }

  return (
    <div className="space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
        <Send className="h-3.5 w-3.5" /> Set-up link ready — send it to {contact.name || 'the buyer'}
      </p>
      <input
        readOnly
        value={url}
        aria-label="Set-up link"
        onFocus={(event) => event.currentTarget.select()}
        className="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white"
      />
      <textarea
        readOnly
        value={invite.message}
        aria-label="Message to send"
        rows={6}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-xs leading-relaxed text-white/85"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => copy('message')} className={BUTTON}>
          {copied === 'message' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy message (Messenger)
        </button>
        <button type="button" onClick={() => copy('link')} className={BUTTON}>
          {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy link
        </button>
        {invite.smsHref && (
          <a href={invite.smsHref} className={BUTTON}><MessageSquare className="h-3.5 w-3.5" /> Text {contact.phone}</a>
        )}
        {invite.emailHref && (
          <a href={invite.emailHref} className={BUTTON}><Mail className="h-3.5 w-3.5" /> Email</a>
        )}
      </div>
      <p className="text-[11px] text-white/45">Only the newest link works. Sending a new one turns this one off.</p>
    </div>
  )
}
