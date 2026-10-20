'use client'

import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { phoneNote, type FooterPhoneState } from '@/lib/texts/view/review'
import { heroView } from '@/lib/texts/view/hero'
import { StatusDot } from '../status-chip'
import { useTexts } from '../texts-context'

interface ComposerFooterProps {
  isReview: boolean
  phone: FooterPhoneState
  primary: string
  /** "Save draft", or "Save changes" for a campaign that is already live. */
  secondary: string
  busy: 'save' | 'start' | null
  onSaveDraft: () => void
  onReview: () => void
  onPrimary: () => void
}

/** Secondary saves; the primary is Review (always tappable — it shows what to fix), then the send itself. */
export function ComposerFooter({ isReview, phone, primary, secondary, busy, onSaveDraft, onReview, onPrimary }: ComposerFooterProps) {
  const { live, isDemo } = useTexts()
  const hero = heroView(live.sender, isDemo)
  const note = phoneNote(phone)
  return (
    <div className="space-y-2">
      {isReview && note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="flex items-center gap-3">
        <span className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground sm:flex">
          <StatusDot tone={hero.tone} isPulsing={phone === 'ready'} /> Phone: {phone === 'ready' ? 'Ready' : hero.word}
        </span>
        <span className="flex-1 sm:hidden" />
        <Button type="button" variant="outline" className="min-h-11 rounded-full px-5 sm:min-h-10" onClick={onSaveDraft} disabled={busy !== null}>
          {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {secondary}
        </Button>
        {isReview ? (
          <Button type="button" className="min-h-11 rounded-full px-5 sm:min-h-10" onClick={onPrimary} disabled={busy !== null}>
            {busy === 'start' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {primary}
          </Button>
        ) : (
          <Button type="button" className="min-h-11 rounded-full px-5 sm:min-h-10" onClick={onReview} disabled={busy !== null}>
            Review <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}
