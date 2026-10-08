'use client'

import { useState } from 'react'
import { Eye, EyeOff, Lock, Rocket } from 'lucide-react'
import { MAX_OWNER_PASSWORD, MIN_OWNER_PASSWORD, type OnboardingOrderType } from '@/lib/onboarding/answers'
import { ACCENT, ACCENT_SOFT, ChoiceChip, ChoiceTile, Field, INPUT_CLASS, ONBOARDING_COLORS, SectionLabel } from './onboarding-ui'
import type { StepProps } from './wizard-steps'
import type { WizardDraft } from './wizard-draft'

const ORDER_TYPES: Record<OnboardingOrderType, { icon: string; title: string; description: string }> = {
  pickup: { icon: '🛍️', title: 'Pickup', description: 'They order ahead and collect.' },
  delivery: { icon: '🛵', title: 'Delivery', description: 'You or a rider brings it.' },
  dine_in: { icon: '🍽️', title: 'Dine-in', description: 'They scan and order at the table.' },
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const HOUR_PRESETS: ReadonlyArray<{ label: string; open: string; close: string; closedDays: number[] }> = [
  { label: 'Every day, 9am–9pm', open: '09:00', close: '21:00', closedDays: [] },
  { label: 'Every day, 7am–7pm', open: '07:00', close: '19:00', closedDays: [] },
  { label: 'Mon–Sat, 10am–10pm', open: '10:00', close: '22:00', closedDays: [0] },
  { label: 'Every day, 11am–11pm', open: '11:00', close: '23:00', closedDays: [] },
]

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

type WalletKey = 'gcash' | 'maya'

const WALLETS: Record<WalletKey, { name: string; number: keyof WizardDraft; accountName: keyof WizardDraft; color: string }> = {
  gcash: { name: 'GCash', number: 'gcashNumber', accountName: 'gcashName', color: '#0070E0' },
  maya: { name: 'Maya', number: 'mayaNumber', accountName: 'mayaName', color: '#0BB26B' },
}

function WalletCard({ wallet, draft, update }: StepProps & { wallet: WalletKey }) {
  const config = WALLETS[wallet]
  const number = draft[config.number] as string
  const accountName = draft[config.accountName] as string
  const [isOpen, setIsOpen] = useState(!!number)

  function setOpen(next: boolean) {
    setIsOpen(next)
    // Turning a wallet off clears it, so a half-typed number is never submitted.
    if (!next) update({ [config.number]: '', [config.accountName]: '' } as Partial<WizardDraft>)
  }

  return (
    <div className="rounded-3xl border-2 bg-white p-3 transition" style={{ borderColor: isOpen ? ACCENT : 'rgba(0,0,0,0.07)' }}>
      <button type="button" onClick={() => setOpen(!isOpen)} aria-pressed={isOpen} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-extrabold text-white" style={{ backgroundColor: config.color }} aria-hidden>
          {config.name.slice(0, 2)}
        </span>
        <span className="flex-1 text-[15px] font-bold" style={{ color: ONBOARDING_COLORS.ink }}>{config.name}</span>
        <span className="relative h-6 w-11 rounded-full transition" style={{ backgroundColor: isOpen ? ACCENT : 'rgba(0,0,0,0.15)' }} aria-hidden>
          <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: isOpen ? 22 : 2 }} />
        </span>
      </button>
      {isOpen && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={INPUT_CLASS} inputMode="tel" autoComplete="tel" placeholder={`${config.name} number, e.g. 0917 123 4567`} value={number}
            onChange={(e) => update({ [config.number]: e.target.value } as Partial<WizardDraft>)} />
          <input className={INPUT_CLASS} placeholder="Account name" value={accountName}
            onChange={(e) => update({ [config.accountName]: e.target.value } as Partial<WizardDraft>)} />
        </div>
      )}
    </div>
  )
}

export function OrderingStep({ draft, update }: StepProps) {
  return (
    <div className="space-y-7">
      <div>
        <SectionLabel>How do customers get their order?</SectionLabel>
        <p className="mt-0.5 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>Pick all that apply.</p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {(Object.keys(ORDER_TYPES) as OnboardingOrderType[]).map((type) => (
            <ChoiceTile key={type} icon={ORDER_TYPES[type].icon} title={ORDER_TYPES[type].title} description={ORDER_TYPES[type].description}
              isSelected={draft.orderTypes.includes(type)} onClick={() => update({ orderTypes: toggle(draft.orderTypes, type) })} />
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        <SectionLabel>How do they pay you?</SectionLabel>
        <p className="-mt-1.5 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>Money goes straight to you. E-wallet payments ask the customer for a screenshot.</p>
        <WalletCard wallet="gcash" draft={draft} update={update} />
        <WalletCard wallet="maya" draft={draft} update={update} />
        <ChoiceChip isSelected={draft.acceptsCash} onClick={() => update({ acceptsCash: !draft.acceptsCash })}>
          💵 Cash on pickup or delivery
        </ChoiceChip>
      </div>
    </div>
  )
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  const suffix = hours < 12 ? 'am' : 'pm'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return minutes ? `${hour12}:${String(minutes).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`
}

function hoursSummary(draft: WizardDraft): string {
  const openDays = DAY_LABELS.filter((_, day) => !draft.closedDays.includes(day))
  const days = openDays.length === 7 ? 'Every day' : openDays.length === 0 ? 'No days' : openDays.join(', ')
  return `${days} · ${formatTime(draft.open)} – ${formatTime(draft.close)}`
}

export function HoursStep({ draft, update }: StepProps) {
  const isPreset = (preset: (typeof HOUR_PRESETS)[number]) =>
    preset.open === draft.open && preset.close === draft.close && preset.closedDays.join() === [...draft.closedDays].sort().join()
  return (
    <div className="space-y-7">
      <div className="rounded-3xl p-4 text-center" style={{ backgroundColor: ACCENT_SOFT }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>Open</p>
        <p className="mt-1 text-lg font-extrabold" style={{ color: ONBOARDING_COLORS.ink }}>{hoursSummary(draft)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {HOUR_PRESETS.map((preset) => (
          <ChoiceChip key={preset.label} isSelected={isPreset(preset)} onClick={() => update({ open: preset.open, close: preset.close, closedDays: preset.closedDays })}>
            {preset.label}
          </ChoiceChip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opens">
          <input type="time" className={INPUT_CLASS} value={draft.open} onChange={(e) => update({ open: e.target.value })} />
        </Field>
        <Field label="Closes">
          <input type="time" className={INPUT_CLASS} value={draft.close} onChange={(e) => update({ close: e.target.value })} />
        </Field>
      </div>
      <div>
        <SectionLabel>Closed on</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAY_LABELS.map((label, day) => (
            <ChoiceChip key={label} isSelected={draft.closedDays.includes(day)} onClick={() => update({ closedDays: toggle(draft.closedDays, day) })}>
              {label}
            </ChoiceChip>
          ))}
        </div>
      </div>
      <ChoiceChip isSelected={draft.stopOrdersWhenClosed} onClick={() => update({ stopOrdersWhenClosed: !draft.stopOrdersWhenClosed })}>
        ⏸️ Pause online orders while we&apos;re closed
      </ChoiceChip>
    </div>
  )
}

function passwordStrength(password: string): { label: string; share: number } {
  if (password.length === 0) return { label: '', share: 0 }
  if (password.length < MIN_OWNER_PASSWORD) return { label: `${MIN_OWNER_PASSWORD - password.length} more characters`, share: 0.25 }
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  if (password.length >= 12 && variety >= 3) return { label: 'Strong', share: 1 }
  return variety >= 2 ? { label: 'Good', share: 0.7 } : { label: 'Okay — add a number or symbol', share: 0.5 }
}

interface AccountStepProps {
  email: string
  password: string
  setPassword: (value: string) => void
}

export function AccountStep({ email, password, setPassword }: AccountStepProps) {
  const [isVisible, setIsVisible] = useState(false)
  const strength = passwordStrength(password)
  return (
    <div className="space-y-6">
      <Field label="Login email" hint="This is the email you ordered with.">
        <input className={`${INPUT_CLASS} bg-black/[0.03] text-black/60`} value={email} readOnly />
      </Field>
      <Field label="Choose a password" hint="For your dashboard and the SmartMenu app on your phone.">
        <div className="relative">
          <input
            type={isVisible ? 'text' : 'password'}
            autoComplete="new-password"
            className={`${INPUT_CLASS} pr-12`}
            value={password}
            maxLength={MAX_OWNER_PASSWORD}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" onClick={() => setIsVisible(!isVisible)} aria-label={isVisible ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-black/50 hover:bg-black/5">
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      {strength.label && (
        <div aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${strength.share * 100}%`, backgroundColor: strength.share >= 0.7 ? '#1F9D55' : ACCENT }} />
          </div>
          <p className="mt-1.5 text-xs font-medium" style={{ color: ONBOARDING_COLORS.cocoa }}>{strength.label}</p>
        </div>
      )}
      <div className="space-y-2 rounded-3xl p-4 text-sm" style={{ backgroundColor: ONBOARDING_COLORS.creamDeep, color: ONBOARDING_COLORS.cocoa }}>
        <p className="flex items-start gap-2"><Rocket className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>Next we build your store — about a minute. Then you look it over and tap <b>Go live</b>.</span></p>
        <p className="flex items-start gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>Nothing is public until you do.</span></p>
      </div>
    </div>
  )
}
