'use client'

/**
 * Messages tab: every word the bot sends, grouped by the moment it goes out
 * (plan 2026-11-11, A2). Blank = the built-in wording (shown greyed). A
 * message opens to edit it, and the phone jumps to where it is sent.
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { charLength } from '@/lib/messenger/limits'
import {
  defaultText,
  MESSAGE_MOMENTS,
  MESSAGES,
  MOMENT_LABELS,
  PLACEHOLDER_INFO,
  UPDATE_MESSAGE_IDS,
  isToggleOn,
  type MessageEntry,
  type MessageMoment,
  type MessageSettings,
  type TextEntry,
  type TextMessageId,
  type ToggleEntry,
  type ToggleId,
} from '@/lib/messenger/messages/registry'
import { textProblem } from '@/lib/messenger/messages/stored'
import { UPDATE_STATUSES, type OrderUpdatesConfig, type UpdateStatus } from '@/lib/messenger/order-view'
import { ChoiceChips, Notice, PanelHeader, SectionLabel, StudioSwitch } from './studio-ui'

interface MessagesPanelProps {
  messages: MessageSettings
  orderUpdates: OrderUpdatesConfig
  isPlatformOrders: boolean
  moment: MessageMoment
  openId: string | null
  /** Refusals from the last save, by message id. */
  serverProblems: Readonly<Record<string, string>>
  onMomentChange: (moment: MessageMoment) => void
  onOpen: (id: string | null) => void
  onChange: (messages: MessageSettings) => void
  onOrderUpdatesChange: (config: OrderUpdatesConfig) => void
}

const STATUS_BY_MESSAGE = Object.fromEntries(Object.entries(UPDATE_MESSAGE_IDS).map(([status, id]) => [id, status as UpdateStatus])) as Record<string, UpdateStatus>

const LANG_OPTIONS = [{ value: 'en', label: 'English' }, { value: 'tl', label: 'Taglish' }] as const

function TextEditor({ entry, messages, problem, onChange }: {
  entry: TextEntry
  messages: MessageSettings
  problem: string | null
  onChange: (value: string) => void
}) {
  const id = entry.id as TextMessageId
  const value = messages.texts[id] ?? ''
  const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const fieldId = `message-${entry.id}`
  const shown = value || defaultText(id, messages.lang)
  const count = charLength(shown)

  const insert = (token: string) => {
    const field = fieldRef.current
    const base = value || defaultText(id, messages.lang)
    const start = field && value ? field.selectionStart ?? base.length : base.length
    const end = field && value ? field.selectionEnd ?? base.length : base.length
    const next = `${base.slice(0, start)}${token}${base.slice(end)}`
    onChange(next)
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const common = {
    id: fieldId,
    value,
    placeholder: defaultText(id, messages.lang) || 'Nothing is sent',
    onChange: (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(event.target.value),
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': `${fieldId}-hint`,
    className: `w-full rounded-lg border bg-neutral-50 px-3 py-2 text-[12.5px] outline-none placeholder:text-[#B5AEA2] focus:border-[#1D1815] focus:bg-white ${problem ? 'border-red-500' : 'border-neutral-200'}`,
  }

  return (
    <div className="space-y-2 pt-1">
      <label htmlFor={fieldId} className="sr-only">{entry.label}</label>
      {entry.kind === 'button'
        ? <input ref={fieldRef} {...common} maxLength={entry.max * 2} />
        : <textarea ref={fieldRef} {...common} rows={Math.min(5, Math.max(2, shown.split('\n').length + 1))} />}
      {entry.placeholders.length > 0 ? (
        <div className="flex flex-wrap gap-1" aria-label="Insert a detail">
          {entry.placeholders.map((key) => (
            <button key={key} type="button" onClick={() => insert(`{${key}}`)}
              title={`Inserts ${PLACEHOLDER_INFO[key].label.toLowerCase()}, e.g. “${PLACEHOLDER_INFO[key].sample.trim()}”`}
              className="min-h-7 rounded-full bg-[#FBEAE3] px-2.5 text-[11px] font-bold text-[#B23E1B] hover:bg-[#F7DCD1]">
              + {PLACEHOLDER_INFO[key].label}
            </button>
          ))}
        </div>
      ) : null}
      <div id={`${fieldId}-hint`} className="flex items-start gap-2 text-[11px] text-[#8B857B]">
        <span className="flex-1">
          {problem ? <span className="font-semibold text-red-700">{problem}</span> : entry.help ?? (entry.placeholders.includes('name') ? 'No name from Messenger? It is left out.' : 'Blank uses the grey words.')}
        </span>
        <span className={`tabular-nums ${count > entry.max ? 'font-bold text-red-700' : ''}`}>{count}/{entry.max}</span>
        {value ? <button type="button" onClick={() => onChange('')} className="font-bold underline hover:text-[#1D1815]">Reset</button> : null}
      </div>
    </div>
  )
}

function EntryRow({ entry, messages, isOpen, problem, statusSwitch, onOpen, onText, onToggle }: {
  entry: MessageEntry
  messages: MessageSettings
  isOpen: boolean
  problem: string | null
  statusSwitch?: { isOn: boolean; onChange: (isOn: boolean) => void }
  onOpen: (isOpen: boolean) => void
  onText: (value: string) => void
  onToggle: (isOn: boolean) => void
}) {
  if (entry.kind === 'toggle') {
    return (
      <li className="flex items-center gap-2.5 rounded-[10px] border border-[#E5E0D6] bg-white px-3 py-2.5" onFocus={() => onOpen(false)}>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold">Show {entry.label.charAt(0).toLowerCase()}{entry.label.slice(1)}</span>
          {entry.help ? <span className="block text-[11px] text-[#8B857B]">{entry.help}</span> : null}
        </span>
        <StudioSwitch isOn={isToggleOn(messages, entry.id as ToggleId)} onChange={onToggle} label={entry.label} />
      </li>
    )
  }
  const isChanged = Boolean(messages.texts[entry.id as TextMessageId])
  return (
    <li className={`rounded-[10px] border bg-white ${isOpen ? 'border-[#1D1815]' : 'border-[#E5E0D6]'} ${problem ? 'border-red-400' : ''}`}>
      <div className="flex items-center gap-2 px-3">
        <button type="button" onClick={() => onOpen(!isOpen)} aria-expanded={isOpen} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#8B857B]" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#8B857B]" aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold">{entry.label}</span>
            {!isOpen ? (
              <span className="block truncate text-[11px] text-[#8B857B]">{(messages.texts[entry.id as TextMessageId] || defaultText(entry.id as TextMessageId, messages.lang) || 'Nothing is sent').replace(/\n/g, ' · ')}</span>
            ) : null}
          </span>
          {isChanged ? <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#E4572E]" title="Changed" aria-label="Changed" /> : null}
        </button>
        {statusSwitch ? <StudioSwitch isOn={statusSwitch.isOn} onChange={statusSwitch.onChange} label={`Send “${entry.label}”`} /> : null}
      </div>
      {isOpen ? <div className="px-3 pb-3"><TextEditor entry={entry} messages={messages} problem={problem} onChange={onText} /></div> : null}
    </li>
  )
}

export function MessagesPanel(props: MessagesPanelProps) {
  const { messages, orderUpdates, moment } = props
  const [hasConfirmedReset, setHasConfirmedReset] = useState(false)
  const entries = (MESSAGES as readonly MessageEntry[]).filter((entry) => entry.moment === moment)
  const isChanged = Object.keys(messages.texts).length > 0 || Object.keys(messages.toggles).length > 0

  const setText = (id: string, value: string) => {
    const texts = { ...messages.texts }
    if (value) texts[id as TextMessageId] = value
    else delete texts[id as TextMessageId]
    props.onChange({ ...messages, texts })
  }
  const setToggle = (entry: ToggleEntry, isOn: boolean) => {
    const toggles = { ...messages.toggles }
    if (isOn === entry.default) delete toggles[entry.id as ToggleId]
    else toggles[entry.id as ToggleId] = isOn
    props.onChange({ ...messages, toggles })
  }
  const setStatus = (status: UpdateStatus, isOn: boolean) => {
    const statuses = isOn ? [...orderUpdates.statuses, status] : orderUpdates.statuses.filter((entry) => entry !== status)
    props.onOrderUpdatesChange({ ...orderUpdates, statuses: UPDATE_STATUSES.filter((entry) => statuses.includes(entry)) })
  }
  const problemFor = (entry: MessageEntry): string | null => {
    if (props.serverProblems[entry.id]) return props.serverProblems[entry.id]
    if (entry.kind === 'toggle') return null
    const value = messages.texts[entry.id as TextMessageId]
    return value ? textProblem(entry, value) : null
  }

  return (
    <>
      <PanelHeader
        title="Messages"
        description="Every word the bot sends. Blank uses ours (shown in grey)."
        action={isChanged ? (
          <button type="button"
            onClick={() => {
              if (!hasConfirmedReset) { setHasConfirmedReset(true); return }
              setHasConfirmedReset(false)
              props.onChange({ ...messages, texts: {}, toggles: {} })
            }}
            onBlur={() => setHasConfirmedReset(false)}
            className="text-[11.5px] font-bold text-[#8B857B] underline hover:text-[#1D1815]">
            {hasConfirmedReset ? 'Tap again to reset all' : 'Reset all'}
          </button>
        ) : undefined}
      />
      <div className="space-y-4 px-[18px] py-4">
        <div>
          <SectionLabel className="mb-1.5">Wording style</SectionLabel>
          <ChoiceChips label="Wording style" options={LANG_OPTIONS} value={messages.lang} onChange={(lang) => props.onChange({ ...messages, lang })} />
          <p className="mt-1.5 text-[11px] text-[#8B857B]">Changes every message you haven’t written yourself.</p>
        </div>

        <ChoiceChips
          label="When it is sent"
          options={MESSAGE_MOMENTS.map((value) => ({ value, label: MOMENT_LABELS[value] }))}
          value={moment}
          onChange={(next) => { props.onMomentChange(next); props.onOpen(null) }}
        />

        {moment === 'after' ? (
          props.isPlatformOrders ? (
            <div className="flex items-center gap-2.5 rounded-[10px] bg-[#F7F5F0] px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold">Send order status messages</span>
                <span className="block text-[11px] leading-snug text-[#8B857B]">For orders placed from the chat, within 24 hours of the customer’s last message (Messenger’s rule). Always with a Track order button.</span>
              </span>
              <StudioSwitch isOn={orderUpdates.enabled} onChange={(enabled) => props.onOrderUpdatesChange({ ...orderUpdates, enabled })} label="Send order status messages" />
            </div>
          ) : (
            <Notice>Your orders are kept on a separate order system, so status messages and order lists can’t be sent yet. Customers get their tracking link instead.</Notice>
          )
        ) : null}

        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const status = STATUS_BY_MESSAGE[entry.id]
            return (
              <EntryRow
                key={entry.id}
                entry={entry}
                messages={messages}
                isOpen={props.openId === entry.id}
                problem={problemFor(entry)}
                statusSwitch={status && props.isPlatformOrders && orderUpdates.enabled
                  ? { isOn: orderUpdates.statuses.includes(status), onChange: (isOn) => setStatus(status, isOn) }
                  : undefined}
                onOpen={(isOpen) => props.onOpen(isOpen ? entry.id : entry.kind === 'toggle' ? entry.id : null)}
                onText={(value) => setText(entry.id, value)}
                onToggle={(isOn) => { setToggle(entry as ToggleEntry, isOn); props.onOpen(entry.id) }}
              />
            )
          })}
        </ul>
      </div>
    </>
  )
}
