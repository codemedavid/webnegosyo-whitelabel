'use client'

import { useId } from 'react'
import { Image as ImageIcon, LayoutTemplate, QrCode } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { QrDesign } from '@/lib/qr-print/qr-artwork'
import { CODES_PER_PAGE_OPTIONS, type CodesPerPage } from '@/lib/qr-print/print-sheet'
import type { StoreAddress } from '@/lib/qr-print/qr-links'
import { QrOptionCards, type QrOption } from './qr-option-cards'

export const MAX_CAPTION_LENGTH = 44

interface QrSettingsBarProps {
  addresses: StoreAddress[]
  addressKey: string
  onAddressChange: (key: string) => void
  design: QrDesign
  onDesignChange: (design: QrDesign) => void
  caption: string
  captionPlaceholder: string
  onCaptionChange: (caption: string) => void
  perPage: CodesPerPage
  onPerPageChange: (perPage: CodesPerPage) => void
  logoState: 'loading' | 'ready' | 'missing'
}

const DESIGNS: readonly QrOption<QrDesign>[] = [
  {
    value: 'card',
    title: 'Table card',
    hint: 'Store name, label and message',
    icon: <LayoutTemplate className="h-4 w-4" aria-hidden />,
  },
  {
    value: 'plain',
    title: 'Code only',
    hint: 'For your own poster or flyer',
    icon: <QrCode className="h-4 w-4" aria-hidden />,
  },
]

/** One word per size, so three cards fit side by side in the panel. */
const PRINT_SIZE_NAMES: Record<CodesPerPage, string> = { 1: 'Poster', 4: 'Table tent', 9: 'Sticker' }

const PER_PAGE_OPTIONS: readonly QrOption<string>[] = CODES_PER_PAGE_OPTIONS.map((option) => ({
  value: String(option.value),
  title: `${option.value} per page`,
  hint: PRINT_SIZE_NAMES[option.value],
}))

const LOGO_NOTES: Record<QrSettingsBarProps['logoState'], string> = {
  loading: 'Loading your logo…',
  ready: 'Your logo sits in the middle of every code.',
  missing: 'No logo yet, so your initials sit in the middle. Add one in Branding Studio.',
}

function SettingSection({ title, titleId, children }: { title: string; titleId: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 id={titleId} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** The choices every code shares: look, message, print size and address. */
export function QrSettingsBar(props: QrSettingsBarProps) {
  const ids = { address: useId(), design: useId(), caption: useId(), perPage: useId() }
  const hasChoiceOfAddress = props.addresses.length > 1
  const isCaptionUsed = props.design === 'card'
  const perPageHint = CODES_PER_PAGE_OPTIONS.find((option) => option.value === props.perPage)?.hint

  return (
    <div className="space-y-6 rounded-xl border bg-card p-5 shadow-xs">
      <div>
        <h2 className="font-semibold">Customize</h2>
        <p className="text-sm text-muted-foreground">Changes apply to every code on this page.</p>
      </div>

      <SettingSection title="Design" titleId={ids.design}>
        <QrOptionCards
          name="qr-design"
          labelledBy={ids.design}
          options={DESIGNS}
          value={props.design}
          onChange={props.onDesignChange}
        />
      </SettingSection>

      {isCaptionUsed && (
        <SettingSection title="Message" titleId={`${ids.caption}-title`}>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={ids.caption} className="font-normal">
                Shown under the code
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {props.caption.length}/{MAX_CAPTION_LENGTH}
              </span>
            </div>
            <Input
              id={ids.caption}
              value={props.caption}
              maxLength={MAX_CAPTION_LENGTH}
              placeholder={props.captionPlaceholder}
              onChange={(event) => props.onCaptionChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave it blank to use our wording for menus and tables.</p>
          </div>
        </SettingSection>
      )}

      <SettingSection title="Codes per printed page" titleId={ids.perPage}>
        <QrOptionCards
          name="qr-per-page"
          labelledBy={ids.perPage}
          options={PER_PAGE_OPTIONS}
          value={String(props.perPage)}
          onChange={(value) => props.onPerPageChange(Number(value) as CodesPerPage)}
          columns={3}
        />
        {perPageHint && <p className="text-xs text-muted-foreground">{perPageHint}.</p>}
      </SettingSection>

      <SettingSection title="Codes open" titleId={`${ids.address}-title`}>
        {hasChoiceOfAddress ? (
          <>
            <Select value={props.addressKey} onValueChange={props.onAddressChange}>
              <SelectTrigger id={ids.address} aria-labelledby={`${ids.address}-title`} className="w-full min-w-0 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.addresses.map((address) => (
                  <SelectItem key={address.key} value={address.key} className="font-mono">
                    {address.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Printed codes keep pointing at the address you pick — the WebNegosyo address keeps working even if your
              domain changes.
            </p>
          </>
        ) : (
          <p
            className="truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm"
            title={props.addresses[0]?.label}
          >
            {props.addresses[0]?.label ?? '—'}
          </p>
        )}
      </SettingSection>

      <p className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground" aria-live="polite">
        <ImageIcon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        {LOGO_NOTES[props.logoState]}
      </p>
    </div>
  )
}
