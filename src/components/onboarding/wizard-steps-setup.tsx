'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Banknote, Bike, Eye, EyeOff, Mail, PauseCircle, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MAX_OWNER_PASSWORD, MIN_OWNER_PASSWORD, type OnboardingOrderType } from '@/lib/onboarding/answers'
import { ACCENT, Chip, Field, FOCUS_RING, GroupLabel, INPUT_CLASS, OB, OptionTile, QuestionHeading, Switch } from './onboarding-ui'
import type { StepProps } from './wizard-steps'
import type { WizardDraft } from './wizard-draft'
import { Stagger } from './motion/parts'

const ORDER_TYPES: Record<OnboardingOrderType, { icon: LucideIcon; title: string; description: string }> = {
  pickup: { icon: ShoppingBag, title: 'Pickup', description: 'They order ahead and collect.' },
  delivery: { icon: Bike, title: 'Delivery', description: 'You or a rider brings it.' },
  dine_in: { icon: UtensilsCrossed, title: 'Dine-in', description: 'They scan and order at the table.' },
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Day indices (0 = Sunday) in the order a Philippine week is read. */
const WEEK_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0] as const

const HOUR_PRESETS: ReadonlyArray<{ label: string; open: string; close: string; closedDays: number[] }> = [
  { label: '9am – 9pm daily', open: '09:00', close: '21:00', closedDays: [] },
  { label: '7am – 7pm daily', open: '07:00', close: '19:00', closedDays: [] },
  { label: '11am – 11pm daily', open: '11:00', close: '23:00', closedDays: [] },
  { label: 'Mon–Sat, 10am – 10pm', open: '10:00', close: '22:00', closedDays: [0] },
]

/** "09:00" → "9 AM", "21:30" → "9:30 PM". */
function clockLabel(value: string): string {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour = hours % 12 === 0 ? 12 : hours % 12
  return minutes ? `${hour}:${String(minutes).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`
}

function daysLabel(closedDays: readonly number[]): string {
  if (closedDays.length === 0) return 'Every day'
  if (closedDays.length === 7) return 'Closed all week'
  return `Closed ${WEEK_FROM_MONDAY.filter((day) => closedDays.includes(day)).map((day) => DAY_LABELS[day]).join(', ')}`
}

/** The door sign customers will see: it flips over each time the hours change. */
function OpenSign({ open, close, closedDays }: { open: string; close: string; closedDays: readonly number[] }) {
  const hours = `${clockLabel(open)} – ${clockLabel(close)}`
  const days = daysLabel(closedDays)
  return (
    <div className="flex justify-center [perspective:600px]" aria-live="polite">
      <motion.div
        key={`${hours}|${days}`}
        initial={{ rotateX: -90, opacity: 0 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="relative rounded-2xl border-[3px] px-7 pb-4 pt-5 text-center"
        style={{ borderColor: ACCENT, backgroundColor: OB.canvas, boxShadow: '0 6px 0 var(--ob-accent, #17130F)' }}
      >
        <span className="absolute -top-3 left-1/2 h-3 w-16 -translate-x-1/2 rounded-t-full border-[3px] border-b-0" style={{ borderColor: ACCENT }} aria-hidden />
        <p className="text-[26px] font-black leading-none tracking-[0.12em]" style={{ color: ACCENT }}>BUKAS</p>
        <p className="mt-2 text-[15px] font-bold tabular-nums" style={{ color: OB.ink }}>{hours}</p>
        <p className="text-[12.5px] font-semibold" style={{ color: OB.muted }}>{days}</p>
      </motion.div>
    </div>
  )
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

type WalletKey = 'gcash' | 'maya'

/** The wallets' own brand colors: the mark is how owners recognise them. */
const WALLETS: Record<WalletKey, { name: string; number: keyof WizardDraft; accountName: keyof WizardDraft; color: string; mark: string }> = {
  gcash: { name: 'GCash', number: 'gcashNumber', accountName: 'gcashName', color: '#005CE6', mark: 'G' },
  maya: { name: 'Maya', number: 'mayaNumber', accountName: 'mayaName', color: '#00A35C', mark: 'M' },
}

function PaymentRow({ icon, title, description, isOn, onChange, children }: {
  icon: React.ReactNode
  title: string
  description: string
  isOn: boolean
  onChange: (next: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border-2 transition-[border-color,box-shadow] duration-150"
      style={{ borderColor: isOn ? ACCENT : OB.lineStrong }}>
      <div className="flex min-h-16 items-center gap-4 px-4 py-3">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold" style={{ color: OB.ink }}>{title}</span>
          <span className="block text-[13px]" style={{ color: OB.muted }}>{description}</span>
        </span>
        <Switch isOn={isOn} label={`Accept ${title}`} onChange={onChange} />
      </div>
      <AnimatePresence initial={false}>
        {isOn && children && (
          <motion.div className="overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
            <div className="grid gap-2.5 border-t px-4 py-4 sm:grid-cols-2" style={{ borderColor: OB.line }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function WalletRow({ wallet, draft, update }: StepProps & { wallet: WalletKey }) {
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
    <PaymentRow
      icon={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white" style={{ backgroundColor: config.color }} aria-hidden>{config.mark}</span>}
      title={config.name}
      description="Paid straight to your account"
      isOn={isOpen}
      onChange={setOpen}
    >
      <Field label={`${config.name} number`}>
        <input className={INPUT_CLASS} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" value={number}
          onChange={(event) => update({ [config.number]: event.target.value } as Partial<WizardDraft>)} />
      </Field>
      <Field label="Name on the account">
        <input className={INPUT_CLASS} placeholder="As it shows in the app" value={accountName}
          onChange={(event) => update({ [config.accountName]: event.target.value } as Partial<WizardDraft>)} />
      </Field>
    </PaymentRow>
  )
}

type EyebrowProps = StepProps & { eyebrow: string }

export function OrderingStep({ draft, update, eyebrow }: EyebrowProps) {
  return (
    <div className="space-y-9">
      <QuestionHeading eyebrow={eyebrow} title="How do customers get their order?" lede="Pick every way you serve. You can turn any of them off later." />
      <Stagger itemClassName="h-full" role="group" aria-label="How customers get their order" className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {(Object.keys(ORDER_TYPES) as OnboardingOrderType[]).map((type) => {
          const { icon: Icon, title, description } = ORDER_TYPES[type]
          return (
            <OptionTile key={type} isMulti icon={<Icon className="h-7 w-7" strokeWidth={1.75} />} title={title} description={description}
              isSelected={draft.orderTypes.includes(type)} onClick={() => update({ orderTypes: toggle(draft.orderTypes, type) })} />
          )
        })}
      </Stagger>
    </div>
  )
}

export function PaymentsStep({ draft, update, eyebrow }: EyebrowProps) {
  return (
    <div className="space-y-9">
      <QuestionHeading eyebrow={eyebrow} title="How do they pay you?" lede="Money goes straight to you. E-wallet customers send a screenshot of their payment." />
      <Stagger className="space-y-3">
        <WalletRow wallet="gcash" draft={draft} update={update} />
        <WalletRow wallet="maya" draft={draft} update={update} />
        <PaymentRow
          icon={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: OB.wash }} aria-hidden><Banknote className="h-5 w-5" strokeWidth={1.75} style={{ color: OB.ink }} /></span>}
          title="Cash"
          description="On pickup or delivery"
          isOn={draft.acceptsCash}
          onChange={(next) => update({ acceptsCash: next })}
        />
      </Stagger>
    </div>
  )
}

export function HoursStep({ draft, update, eyebrow }: EyebrowProps) {
  const isPreset = (preset: (typeof HOUR_PRESETS)[number]) =>
    preset.open === draft.open && preset.close === draft.close && preset.closedDays.join() === [...draft.closedDays].sort().join()
  return (
    <div className="space-y-9">
      <QuestionHeading eyebrow={eyebrow} title="When are you open?" lede="Customers see your hours, and orders can pause while you're closed." />

      <OpenSign open={draft.open} close={draft.close} closedDays={draft.closedDays} />

      <div className="flex flex-wrap gap-2">
        {HOUR_PRESETS.map((preset) => (
          <Chip key={preset.label} isSelected={isPreset(preset)} onClick={() => update({ open: preset.open, close: preset.close, closedDays: preset.closedDays })}>
            {preset.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Opens">
          <input type="time" className={INPUT_CLASS} value={draft.open} onChange={(event) => update({ open: event.target.value })} />
        </Field>
        <Field label="Closes">
          <input type="time" className={INPUT_CLASS} value={draft.close} onChange={(event) => update({ close: event.target.value })} />
        </Field>
      </div>

      <div className="space-y-3">
        <GroupLabel hint="Tap the days you're closed.">Days off</GroupLabel>
        <div className="flex flex-wrap gap-2">
          {WEEK_FROM_MONDAY.map((day) => (
            <Chip key={day} isSelected={draft.closedDays.includes(day)} onClick={() => update({ closedDays: toggle(draft.closedDays, day) })}>
              {DAY_LABELS[day]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border px-4 py-3.5" style={{ borderColor: OB.lineStrong }}>
        <PauseCircle className="h-6 w-6 shrink-0" strokeWidth={1.75} style={{ color: OB.ink }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold" style={{ color: OB.ink }}>Pause orders while closed</span>
          <span className="block text-[13px]" style={{ color: OB.muted }}>Customers can still browse your menu.</span>
        </span>
        <Switch isOn={draft.stopOrdersWhenClosed} label="Pause orders while closed" onChange={(next) => update({ stopOrdersWhenClosed: next })} />
      </div>
    </div>
  )
}

function passwordStrength(password: string): { label: string; share: number } {
  if (password.length === 0) return { label: '', share: 0 }
  if (password.length < MIN_OWNER_PASSWORD) return { label: `${MIN_OWNER_PASSWORD - password.length} more characters`, share: 0.25 }
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  if (password.length >= 12 && variety >= 3) return { label: 'Strong password', share: 1 }
  return variety >= 2 ? { label: 'Good password', share: 0.7 } : { label: 'Okay. Add a number or symbol to make it stronger.', share: 0.5 }
}

interface AccountStepProps {
  eyebrow: string
  email: string
  password: string
  setPassword: (value: string) => void
}

export function AccountStep({ eyebrow, email, password, setPassword }: AccountStepProps) {
  const [isVisible, setIsVisible] = useState(false)
  const strength = passwordStrength(password)
  return (
    <div className="space-y-9">
      <QuestionHeading eyebrow={eyebrow} title="Last step: your password" lede="You'll use it for your dashboard and the SmartMenu app on your phone." />

      <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ backgroundColor: OB.wash }}>
        <Mail className="h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: OB.muted }} aria-hidden />
        <span className="min-w-0">
          <span className="block text-[13px]" style={{ color: OB.muted }}>Login email</span>
          <span className="block truncate text-[15px] font-semibold" style={{ color: OB.ink }}>{email}</span>
        </span>
      </div>

      <div>
        <Field label="Create a password">
          <div className="relative">
            <input
              type={isVisible ? 'text' : 'password'}
              autoComplete="new-password"
              className={`${INPUT_CLASS} pr-14`}
              value={password}
              maxLength={MAX_OWNER_PASSWORD}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" onClick={() => setIsVisible(!isVisible)} aria-label={isVisible ? 'Hide password' : 'Show password'}
              className={`absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg hover:bg-[#F6F4F1] ${FOCUS_RING}`}
              style={{ color: OB.muted }}>
              {isVisible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </Field>
        <div className="mt-3 min-h-9" aria-live="polite">
          {strength.label && (
            <>
              <div className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: OB.line }}>
                <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${strength.share * 100}%`, backgroundColor: strength.share >= 0.7 ? '#15803D' : OB.ink }} />
              </div>
              <p className="mt-1.5 text-[13px]" style={{ color: OB.muted }}>{strength.label}</p>
            </>
          )}
        </div>
      </div>

      <p className="text-[15px] leading-relaxed" style={{ color: OB.muted }}>
        When you tap <b style={{ color: OB.ink }}>Build my store</b>, we set everything up in a minute or two and open it for orders.
      </p>
    </div>
  )
}
