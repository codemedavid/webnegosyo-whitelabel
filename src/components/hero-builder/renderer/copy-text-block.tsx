'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { copyText } from '@/lib/clipboard'

const COPIED_MS = 2000

interface CopyTextBlockProps {
  title: string
  /** The words on screen and on the clipboard, tokens already filled in. */
  text: string
  design: 'icon' | 'button' | 'only'
  buttonLabel: string
  copiedLabel: string
  isEditor: boolean
}

/** Select the words on screen, so the customer's long-press lands on all of them. */
function selectContents(element: HTMLElement | null): void {
  const selection = window.getSelection?.()
  if (!element || !selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Words a customer copies with one tap. When the browser blocks copying
 * (some in-app browsers), the words are selected and the customer is told to
 * press and hold, so the address can always be taken.
 */
export function CopyTextBlock({ title, text, design, buttonLabel, copiedLabel, isEditor }: CopyTextBlockProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'blocked'>('idle')
  const textRef = useRef<HTMLParagraphElement>(null)
  const noteRef = useRef<HTMLParagraphElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // After the render: the "only" design's text exists just once it is blocked.
  useEffect(() => {
    if (status === 'blocked') selectContents(textRef.current ?? noteRef.current)
  }, [status])

  const handleCopy = async () => {
    if (isEditor) return
    if (timer.current) clearTimeout(timer.current)
    if (!(await copyText(text))) {
      setStatus('blocked')
      return
    }
    setStatus('copied')
    timer.current = setTimeout(() => setStatus('idle'), COPIED_MS)
  }

  const isCopied = status === 'copied'
  const restingLabel = buttonLabel.trim() || 'Copy'
  const label = isCopied ? copiedLabel.trim() || 'Copied!' : restingLabel
  const button = (
    <button
      type="button"
      className="hb-copy-btn"
      data-copied={isCopied ? '' : undefined}
      onClick={handleCopy}
      aria-label={design === 'icon' ? `${label}${title.trim() ? `: ${title.trim()}` : ''}` : undefined}
    >
      {isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {design !== 'icon' && <span>{label}</span>}
    </button>
  )

  return (
    <div className={`hb-copy hb-copy--${design}`}>
      {title.trim() && <p className="hb-copy-title">{title}</p>}
      {design === 'only' ? (
        button
      ) : (
        <div className="hb-copy-row">
          <p ref={textRef} className="hb-copy-text">{text}</p>
          {button}
        </div>
      )}
      {status === 'blocked' && (
        <div role="status">
          <p className="hb-copy-note">Press and hold the text to copy it.</p>
          {design === 'only' && <p ref={noteRef} className="hb-copy-note">{text}</p>}
        </div>
      )}
    </div>
  )
}
