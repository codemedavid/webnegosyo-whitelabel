'use client'

import { useState, type FormEvent } from 'react'
import { CircleCheck, CircleX, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TEST_TEXT_DAILY_LIMIT, type TestTextView } from '@/lib/texts/test-text'
import { cn } from '@/lib/utils'
import { DEMO_READONLY, runAction } from '../run-action'
import { useTexts } from '../texts-context'
import { useTextsActions } from '../texts-actions'
import { useTestText } from './use-test-text'

const TONE_CLASS: Record<TestTextView['tone'], string> = {
  waiting: 'border-wn-line bg-white text-wn-ink',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  bad: 'border-red-200 bg-red-50 text-red-900',
}

function ResultIcon({ tone }: { tone: TestTextView['tone'] }) {
  if (tone === 'ok') return <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
  if (tone === 'bad') return <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
  return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
}

/** One real text through the store's phone, so the owner can see the whole path work. */
export function TestTextCard() {
  const { tenantId, isDemo } = useTexts()
  const actions = useTextsActions()
  const test = useTestText(tenantId)
  const [phone, setPhone] = useState('')
  const [isSending, setSending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (isDemo) return void toast.info(DEMO_READONLY)
    setSending(true)
    const queued = await runAction(() => actions.sendTestTextAction(tenantId, phone), "Couldn't send the test. Try again.")
    setSending(false)
    if (queued) test.watch(queued.id)
  }

  const view = test.view
  const isWatching = view?.isOpen === true && !test.isTimedOut

  return (
    <section aria-labelledby="test-text-title" className="space-y-3 rounded-2xl border border-wn-line bg-white p-4">
      <div>
        <h3 id="test-text-title" className="text-sm font-semibold">Send a test text</h3>
        <p className="text-xs text-wn-stone">The phone sends it from its own SIM, exactly like a real text. Up to {TEST_TEXT_DAILY_LIMIT} a day.</p>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="test-text-phone" className="sr-only">Mobile number to text</label>
        <Input id="test-text-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0917 123 4567"
          value={phone} onChange={(event) => setPhone(event.target.value)} className="h-11 flex-1" disabled={isSending || isWatching} />
        <Button type="submit" className="h-11" disabled={isSending || isWatching || phone.trim() === ''}>
          {isSending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          Send test
        </Button>
      </form>
      {view && (
        <div role="status" className={cn('flex gap-2 rounded-xl border px-3.5 py-2.5 text-sm', TONE_CLASS[test.isTimedOut ? 'bad' : view.tone])}>
          <ResultIcon tone={test.isTimedOut ? 'bad' : view.tone} />
          <div className="min-w-0">
            <p className="font-semibold">{view.title}</p>
            {view.body && <p>{view.body}</p>}
            {test.isTimedOut && <p>Still not picked up after 3 minutes. Check the steps on the phone card, then try again.</p>}
          </div>
        </div>
      )}
    </section>
  )
}
