'use client'

/**
 * Journey tab: everything the Page's chat does by itself, in the order a
 * customer meets it. A tap shows that moment on the phone; "Edit" goes to
 * where it is changed.
 */

import { journeySteps, type JourneyInput, type JourneyStep, type JourneyStepId } from '@/lib/messenger/journey'
import { PanelHeader, SectionLabel, StudioSwitch } from './studio-ui'

interface JourneyPanelProps extends JourneyInput {
  activeStep: JourneyStepId | null
  onShow: (step: JourneyStepId) => void
  onEdit: (step: JourneyStepId) => void
  onStatusMessagesChange: (isOn: boolean) => void
}

const EDIT_LABEL: Record<JourneyStepId, string> = {
  hello: 'Edit first hello',
  browsing: 'Edit the words',
  cart: 'Edit the words',
  after: 'Edit status messages',
  handover: 'Edit handover',
  fallback: 'Set up this reply',
}

function StepCard({ step, number, isActive, onShow, onEdit, toggle, hasConnector }: {
  step: JourneyStep
  number: string
  isActive: boolean
  onShow: () => void
  onEdit: () => void
  toggle?: { isOn: boolean; onChange: (isOn: boolean) => void; label: string }
  hasConnector?: boolean
}) {
  return (
    <li>
      {hasConnector ? <div aria-hidden className="ml-[22px] h-3 w-px bg-[#D9D3C7]" /> : null}
      <div
        className={`flex w-full items-start gap-2.5 rounded-[10px] border px-3 py-2.5 transition-shadow ${
          isActive ? 'border-[#1D1815] shadow-[0_0_0_1px_#1D1815]' : 'border-[#E5E0D6]'
        } ${step.isOff ? 'bg-[#FBFAF7]' : 'bg-white'}`}
      >
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onShow} className="flex w-full items-start gap-2.5 text-left" aria-pressed={isActive}>
            <span className={`mt-px inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[7px] text-[11px] font-black ${
              isActive ? 'bg-[#1D1815] text-white' : 'bg-[#EFECE6] text-[#1D1815]'}`}>{number}</span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-extrabold ${step.isOff ? 'text-[#8B857B]' : 'text-[#1D1815]'}`}>{step.title}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-[#6B655B]">{step.summary}</span>
            </span>
          </button>
          <button type="button" onClick={onEdit} className="ml-[32px] mt-1 min-h-7 text-[11.5px] font-bold text-[#B23E1B] underline-offset-2 hover:underline">
            {EDIT_LABEL[step.id]} →
          </button>
        </div>
        {toggle ? <StudioSwitch isOn={toggle.isOn} onChange={toggle.onChange} label={toggle.label} /> : null}
      </div>
    </li>
  )
}

export function JourneyPanel({ activeStep, onShow, onEdit, onStatusMessagesChange, ...input }: JourneyPanelProps) {
  const steps = journeySteps(input)
  const path = steps.filter((step) => ['hello', 'browsing', 'cart', 'after'].includes(step.id))
  const anyTime = steps.filter((step) => step.id === 'handover' || step.id === 'fallback')
  return (
    <>
      <PanelHeader title="Journey" description="Everything your Page’s chat does by itself, in the order a customer meets it. Tap a step to see it on the phone." />
      <div className="space-y-5 px-[18px] py-4">
        <section>
          <SectionLabel className="mb-2.5">The customer’s path</SectionLabel>
          <ol className="space-y-0">
            {path.map((step, index) => (
                <StepCard
                  key={step.id}
                  hasConnector={index > 0}
                  step={step}
                  number={String(index + 1)}
                  isActive={activeStep === step.id}
                  onShow={() => onShow(step.id)}
                  onEdit={() => onEdit(step.id)}
                  toggle={step.id === 'after' && input.isPlatformOrders
                    ? { isOn: input.orderUpdates.enabled, onChange: onStatusMessagesChange, label: 'Send order status messages' }
                    : undefined}
                />
            ))}
          </ol>
        </section>
        <section>
          <SectionLabel className="mb-2.5">Any time</SectionLabel>
          <ol className="space-y-2">
            {anyTime.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                number={step.id === 'handover' ? '·' : '?'}
                isActive={activeStep === step.id}
                onShow={() => onShow(step.id)}
                onEdit={() => onEdit(step.id)}
              />
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
