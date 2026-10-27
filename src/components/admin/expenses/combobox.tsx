'use client'

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ComboOption {
  id: string
  label: string
  /** Shown beside the label (e.g. the category badge). */
  leading?: ReactNode
  hint?: string
}

export interface ComboSection {
  id: string
  label: string
  options: ComboOption[]
}

export interface ComboboxProps {
  label: string
  /** The selected option id, or null. */
  value: string | null
  /** What the input shows when nothing is being typed. */
  selectedLabel: string
  /** Sections to offer for what has been typed ('' = browsing). */
  getSections: (query: string) => ComboSection[]
  onSelect: (id: string) => void
  /** Offered as the last row while typing: "Add “Mang Ben”". */
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
  /** Typing without picking keeps the text (free-text "Paid to"). */
  onTextChange?: (text: string) => void
  placeholder?: string
  inputId?: string
  error?: string | null
  hint?: ReactNode
  isRequired?: boolean
  autoFocus?: boolean
  inputClassName?: string
}

const CREATE_ID = '__create__'

interface FlatOption {
  option: ComboOption
  domId: string
}

/**
 * A type-ahead picker (ARIA 1.2 combobox + listbox). Type "kur", press Enter:
 * the first match is taken. The list renders in the flow, never in a portal,
 * so it can't be clipped by the dialog and stays inside its focus trap.
 * Escape closes the list first, and only then the dialog.
 */
export function Combobox({
  label,
  value,
  selectedLabel,
  getSections,
  onSelect,
  onCreate,
  createLabel = (query) => `Add “${query}”`,
  onTextChange,
  placeholder,
  inputId,
  error,
  hint,
  isRequired = false,
  autoFocus = false,
  inputClassName,
}: ComboboxProps) {
  const fallbackId = useId()
  const id = inputId ?? fallbackId
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const typed = query ?? ''
  const sections = useMemo(() => (isOpen ? getSections(typed.trim()) : []), [isOpen, getSections, typed])
  const flat = useMemo(() => {
    const options: FlatOption[] = sections.flatMap((section) =>
      section.options.map((option) => ({ option, domId: `${listId}-${section.id}-${option.id}` })),
    )
    const trimmed = typed.trim()
    const hasExact = options.some(({ option }) => option.label.toLowerCase() === trimmed.toLowerCase())
    return onCreate && trimmed !== '' && !hasExact
      ? [...options, { option: { id: CREATE_ID, label: createLabel(trimmed) }, domId: `${listId}-${CREATE_ID}` }]
      : options
  }, [sections, typed, onCreate, createLabel, listId])
  const safeActive = Math.min(activeIndex, Math.max(flat.length - 1, 0))
  const activeOption = flat[safeActive]?.option
  const activeDomId = flat[safeActive]?.domId

  function open(): void {
    setIsOpen(true)
    setActiveIndex(0)
  }

  function close(): void {
    setIsOpen(false)
    setQuery(null)
  }

  function choose(option: ComboOption | undefined): void {
    if (!option) return
    if (option.id === CREATE_ID) onCreate?.(typed.trim())
    else onSelect(option.id)
    close()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) open()
      else setActiveIndex((index) => Math.min(index + 1, flat.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      if (!isOpen) return
      event.preventDefault()
      choose(activeOption)
      return
    }
    if (event.key === 'Escape' && isOpen) {
      // Close the list, not the dialog around it.
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'Tab' && isOpen && query !== null && query.trim() !== '' && activeOption && activeOption.id !== CREATE_ID) {
      // Tab after typing takes the highlighted match, then moves on.
      choose(activeOption)
    }
  }

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  let optionIndex = -1

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-wn-ink">
        {label}
        {isRequired && <span className="sr-only"> (required)</span>}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen ? activeDomId : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={isRequired || undefined}
          placeholder={placeholder}
          value={query ?? selectedLabel}
          onChange={(event) => {
            setQuery(event.target.value)
            onTextChange?.(event.target.value)
            setIsOpen(true)
            setActiveIndex(0)
          }}
          onFocus={(event) => event.target.select()}
          onClick={() => (isOpen ? undefined : open())}
          onBlur={() => {
            // Let a pointer pick land first (options use onMouseDown + preventDefault).
            setIsOpen(false)
            setQuery(null)
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-11 w-full rounded-xl border border-wn-line bg-white pl-3 pr-9 text-[15px] text-wn-ink outline-none transition-shadow placeholder:text-wn-stone/80 focus-visible:border-wn-ink focus-visible:ring-[3px] focus-visible:ring-wn-ink/15',
            error && 'border-red-700 focus-visible:border-red-700 focus-visible:ring-red-700/15',
            inputClassName,
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onMouseDown={(event) => {
            event.preventDefault()
            if (isOpen) close()
            else {
              open()
              inputRef.current?.focus()
            }
          }}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-wn-stone"
        >
          <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
        </button>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!isOpen}
        className="max-h-64 overflow-y-auto overscroll-contain rounded-xl bg-white p-1 shadow-[0_8px_24px_-12px_rgb(29_24_21/0.35)] ring-1 ring-wn-line"
      >
        {isOpen && flat.length === 0 && <p className="px-3 py-2.5 text-[13.5px] text-wn-stone">Nothing matches “{typed}”.</p>}
        {sections.map((section) =>
          section.options.length === 0 ? null : (
            <div key={section.id} role="group" aria-labelledby={`${listId}-g-${section.id}`}>
              <p
                id={`${listId}-g-${section.id}`}
                className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-wn-stone"
              >
                {section.label}
              </p>
              {section.options.map((option) => {
                optionIndex += 1
                const index = optionIndex
                return (
                  <OptionRow
                    key={`${section.id}-${option.id}`}
                    domId={`${listId}-${section.id}-${option.id}`}
                    option={option}
                    isActive={index === safeActive}
                    isSelected={option.id === value}
                    onPick={() => choose(option)}
                    onHover={() => setActiveIndex(index)}
                  />
                )
              })}
            </div>
          ),
        )}
        {flat[flat.length - 1]?.option.id === CREATE_ID && (
          <OptionRow
            domId={`${listId}-${CREATE_ID}`}
            option={{ ...flat[flat.length - 1].option, leading: <Plus className="size-4 text-wn-stone" aria-hidden /> }}
            isActive={safeActive === flat.length - 1}
            isSelected={false}
            onPick={() => choose(flat[flat.length - 1].option)}
            onHover={() => setActiveIndex(flat.length - 1)}
          />
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-[12.5px] text-wn-stone">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[12.5px] font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  )
}

interface OptionRowProps {
  domId: string
  option: ComboOption
  isActive: boolean
  isSelected: boolean
  onPick: () => void
  onHover: () => void
}

function OptionRow({ domId, option, isActive, isSelected, onPick, onHover }: OptionRowProps) {
  return (
    <div
      id={domId}
      role="option"
      aria-selected={isSelected}
      onMouseDown={(event) => {
        event.preventDefault()
        onPick()
      }}
      onMouseMove={onHover}
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-wn-ink',
        isActive && 'bg-wn-sand',
      )}
    >
      {option.leading}
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.hint && <span className="shrink-0 text-[12px] text-wn-stone">{option.hint}</span>}
      {isSelected && <Check className="size-4 shrink-0 text-wn-ink" aria-hidden />}
    </div>
  )
}

/**
 * For a Dialog/Sheet's `onEscapeKeyDown`: Radix listens for Escape on the
 * document in the capture phase, before the combobox sees it, so an open list
 * would take its dialog down with it. Escape closes the list first.
 */
export function keepOpenWhileListOpen(event: globalThis.KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.getAttribute('role') === 'combobox' && target.getAttribute('aria-expanded') === 'true') event.preventDefault()
}
