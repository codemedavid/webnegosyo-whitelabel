'use client'

/**
 * The dotted canvas with the phone. "Preview" shows a sample conversation for
 * the moment (or message) being edited, with the draft wording; "Test chat"
 * runs the real decision + builders in the browser (plan A4): type like a
 * customer or tap the bot's buttons. Nothing is sent to Meta.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { RotateCcw } from 'lucide-react'
import type { ChatCartLine } from '@/lib/messenger/chat-cart'
import { simulate, type SimEnv, type SimInput } from '@/lib/messenger/chat-simulator'
import { PREVIEW_MOMENTS, PREVIEW_MOMENT_LABELS, type PreviewMoment, type Turn } from '@/lib/messenger/studio-scenarios'
import type { MessengerRule } from '@/lib/messenger/rules'
import { encodePayload } from '@/lib/messenger/payload'
import { ChatThread, PhoneFrame, type TapTarget } from './chat-thread'

export type CanvasMode = 'preview' | 'test'

interface StudioCanvasProps {
  mode: CanvasMode
  onModeChange: (mode: CanvasMode) => void
  moment: PreviewMoment | null
  onMomentChange: (moment: PreviewMoment) => void
  previewTurns: Turn[]
  caption: string
  env: SimEnv
  insetClass: string
  /** Tells the Auto-replies tab which rule answered. */
  onAnswered: (ruleId: string | null) => void
  /** Shown when an automation uses "Only when": pretend the store is open or closed. */
  storeOpen?: { isOpen: boolean; onChange: (isOpen: boolean) => void }
}

const SUGGESTIONS = ['magkano po?', 'open po kayo?', 'nasaan na order ko?', 'tao po']

function ruleLabel(rules: readonly MessengerRule[], ruleId: string | null): string | null {
  if (!ruleId) return null
  const index = rules.findIndex((rule) => rule.id === ruleId)
  return index >= 0 ? `Answered by #${index + 1} ${rules[index].name}` : null
}

function TestChat({ env, onAnswered }: { env: SimEnv; onAnswered: (ruleId: string | null) => void }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [cart, setCart] = useState<ChatCartLine[]>([])
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [turns])

  const run = (input: SimInput, shown: string) => {
    const result = simulate(input, cart, env)
    setCart(result.cart)
    onAnswered(result.ruleId)
    const label = ruleLabel(env.rules, result.ruleId)
    const silence = result.silence === 'bot_off'
      ? 'The bot is off, so nothing is answered.'
      : result.silence === 'no_match'
        ? 'No automation fits, so the bot stays quiet. Add a “didn’t understand” reply in Journey.'
        : null
    setTurns((previous) => [
      ...previous,
      { from: 'customer', text: shown },
      ...(label ? [{ from: 'note' as const, text: label }] : []),
      ...(silence ? [{ from: 'note' as const, text: silence }] : [{ from: 'bot' as const, messages: result.reply }]),
    ])
  }

  const onTap = (target: TapTarget) => {
    if (target.kind === 'quick') {
      run({ kind: 'tap', title: target.reply.title, payload: target.reply.payload, isQuickReply: true }, target.reply.title)
      return
    }
    if (target.button.type === 'web_url') {
      setNotice(`“${target.button.title}” opens your store’s web page for the customer.`)
      return
    }
    run({ kind: 'tap', title: target.button.title, payload: target.button.payload, isQuickReply: false }, target.button.title)
  }

  const send = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setNotice(null)
    run({ kind: 'text', text }, text)
  }

  const reset = () => { setTurns([]); setCart([]); setNotice(null); onAnswered(null) }

  return (
    <PhoneFrame
      storeName={env.store.name}
      logoUrl={env.store.logoUrl}
      footer={(
        <form onSubmit={send} className="flex items-center gap-2 px-3 py-2.5">
          <label htmlFor="test-chat-input" className="sr-only">Type like a customer</label>
          <input id="test-chat-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type like a customer" maxLength={300}
            className="min-h-10 min-w-0 flex-1 rounded-full bg-[#F0F0F0] px-4 text-[13px] text-[#111] outline-none focus:ring-2 focus:ring-[#0866FF]/40" />
          <button type="submit" disabled={!draft.trim()} className="min-h-10 rounded-full px-3 text-[13px] font-bold text-[#0866FF] disabled:text-[#B0B3B8]">Send</button>
        </form>
      )}
    >
      {turns.length === 0 ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-[12px] text-[#65676B]">Type a message, or try one:</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {SUGGESTIONS.map((text) => (
              <button key={text} type="button" onClick={() => run({ kind: 'text', text }, text)}
                className="min-h-8 rounded-full border border-[#0866FF] px-3 text-[12px] font-medium text-[#0866FF] hover:bg-[#F5F8FF]">{text}</button>
            ))}
            <button type="button" onClick={() => run({ kind: 'tap', title: 'Get Started', payload: encodePayload({ verb: 'start' }), isQuickReply: false }, 'Get Started')}
              className="min-h-8 rounded-full border border-[#0866FF] px-3 text-[12px] font-medium text-[#0866FF] hover:bg-[#F5F8FF]">Get Started</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={reset} className="inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-[#65676B] hover:bg-[#F0F0F0]">
              <RotateCcw className="h-3 w-3" aria-hidden /> Start over
            </button>
          </div>
          <ChatThread turns={turns} onTap={onTap} />
        </>
      )}
      {notice ? <p role="status" className="mt-2 text-center text-[11px] text-[#65676B]">{notice}</p> : null}
      <div ref={endRef} />
    </PhoneFrame>
  )
}

export function StudioCanvas({ mode, onModeChange, moment, onMomentChange, previewTurns, caption, env, insetClass, onAnswered, storeOpen }: StudioCanvasProps) {
  return (
    <main
      aria-label="Preview"
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col items-center overflow-auto p-6 max-md:p-0 ${insetClass} [background-image:radial-gradient(circle,rgba(0,0,0,0.07)_1px,transparent_1px)] [background-size:18px_18px]`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2 max-md:mt-2">
        <div className="flex gap-0.5 rounded-full bg-white p-[3px] shadow-sm" role="tablist" aria-label="Phone">
          {([['preview', 'Preview'], ['test', 'Test chat']] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => onModeChange(value)}
              className={`min-h-8 rounded-full px-3.5 text-[12px] font-bold transition-colors ${mode === value ? 'bg-[#1D1815] text-white' : 'text-[#8B857B] hover:text-[#1D1815]'}`}>
              {label}
            </button>
          ))}
        </div>
        {storeOpen ? (
          <div className="flex gap-0.5 rounded-full bg-white p-[3px] shadow-sm" role="radiogroup" aria-label="Pretend the store is">
            {([[true, 'Store open'], [false, 'Store closed']] as const).map(([value, label]) => (
              <button key={label} type="button" role="radio" aria-checked={storeOpen.isOpen === value} onClick={() => storeOpen.onChange(value)}
                className={`min-h-8 rounded-full px-3 text-[12px] font-bold transition-colors ${storeOpen.isOpen === value ? (value ? 'bg-emerald-700 text-white' : 'bg-[#5E574C] text-white') : 'text-[#8B857B] hover:text-[#1D1815]'}`}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {mode === 'preview' ? (
        <nav aria-label="Customer journey" className="mx-auto mb-3 flex max-w-full flex-wrap items-center justify-center gap-1 max-md:hidden">
          {PREVIEW_MOMENTS.map((step, index) => {
            const isCurrent = step === moment
            return (
              <span key={step} className="flex items-center gap-1">
                {index > 0 ? <span aria-hidden="true" className="text-[12px] text-[#B5AEA2]">›</span> : null}
                <button type="button" onClick={() => onMomentChange(step)} aria-current={isCurrent ? 'step' : undefined}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${isCurrent ? 'bg-[#1D1815] text-white' : 'text-[#5E574C] hover:bg-white'}`}>
                  {PREVIEW_MOMENT_LABELS[step]}
                </button>
              </span>
            )
          })}
        </nav>
      ) : null}
      <div className="flex min-h-0 w-full flex-1 justify-center max-md:px-0">
        {mode === 'preview' ? (
          <PhoneFrame storeName={env.store.name} logoUrl={env.store.logoUrl}>
            <ChatThread turns={previewTurns} lastOnlyQuickReplies={false} />
          </PhoneFrame>
        ) : (
          <TestChat env={env} onAnswered={onAnswered} />
        )}
      </div>
      <p className="mt-3 max-w-[360px] text-center text-[11.5px] leading-snug text-[#8B857B] max-md:px-4">
        {mode === 'preview' ? caption : 'Runs your automations right here, with a sample cart. Nothing is sent to Messenger.'}
      </p>
    </main>
  )
}
