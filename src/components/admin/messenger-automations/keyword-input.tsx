'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from '@/lib/messenger/rules'

interface KeywordInputProps {
  id: string
  keywords: readonly string[]
  onChange: (keywords: string[]) => void
}

/** Words as chips: Enter or a comma adds one, × removes it. */
export function KeywordInput({ id, keywords, onChange }: KeywordInputProps) {
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const words = raw.split(',').map((word) => word.trim().slice(0, MAX_KEYWORD_LENGTH)).filter(Boolean)
    const known = new Set(keywords.map((word) => word.toLowerCase()))
    const fresh = words.filter((word) => !known.has(word.toLowerCase()))
    if (fresh.length > 0) onChange([...keywords, ...fresh].slice(0, MAX_KEYWORDS))
    setDraft('')
  }

  return (
    <div className="space-y-2">
      {keywords.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Words">
          {keywords.map((word) => (
            <li key={word} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
              {word}
              <button
                type="button"
                onClick={() => onChange(keywords.filter((entry) => entry !== word))}
                className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${word}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id}
        value={draft}
        placeholder={keywords.length === 0 ? 'e.g. menu, magkano, price' : 'Add another word'}
        maxLength={MAX_KEYWORD_LENGTH * 4}
        disabled={keywords.length >= MAX_KEYWORDS}
        onChange={(event) => {
          const value = event.target.value
          if (value.includes(',')) add(value)
          else setDraft(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add(draft)
          }
        }}
        onBlur={() => { if (draft.trim()) add(draft) }}
      />
      <p className="text-xs text-muted-foreground">Press Enter after each word. Capital letters, accents and “po” at the end don’t matter.</p>
    </div>
  )
}
