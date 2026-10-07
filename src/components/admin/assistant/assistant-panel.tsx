'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { ArrowUp, Check, History, ImagePlus, Loader2, Mic, Plus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_INPUT_CHARS, MAX_PHOTOS_PER_MESSAGE, MAX_PHOTOS_TOTAL_CHARS, PHOTO_ONLY_TEXT } from '@/lib/assistant/limits'
import { AssistantMessage, collectChips } from './assistant-message'
import { PhotoError, prepareMenuPhoto } from './menu-photos'
import { useVoiceInput } from './voice-input'

interface StarterGroup {
  title: string
  prompts: string[]
}

const STARTERS: StarterGroup[] = [
  { title: 'Sell more', prompts: ['How were sales this week?', 'How many orders are waiting?', 'When am I busiest?', 'Give me offer ideas'] },
  { title: 'Menu', prompts: ['Which dishes aren’t selling?', 'What are my hidden gems?', 'What do people order together?'] },
  { title: 'Customers & team', prompts: ['Who are my best customers?', 'How is my staff doing this week?'] },
  { title: 'Promos', prompts: ['Suggest a promo for my quiet hours', 'Can I afford 20% off my best seller?'] },
  { title: 'Loyalty & offers', prompts: ['How is my loyalty program doing?', 'Which offers are running?', 'Which vouchers are being used?'] },
  { title: 'Inventory', prompts: ['What stock is running low?'] },
]

interface AssistantPanelProps {
  tenantId: string
  adminBasePath: string
  isOpen: boolean
  onClose: () => void
}

function readError(error: Error | undefined): string | null {
  if (!error) return null
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
  } catch {
    // Not our JSON refusal: fall through to the generic line.
  }
  return 'Something went wrong. Please try again.'
}

interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
}

const DATE_LABEL = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function conversationIdOf(messages: UIMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = messages[index].metadata as { conversationId?: unknown } | undefined
    if (typeof metadata?.conversationId === 'string') return metadata.conversationId
  }
  return null
}

export function AssistantPanel({ tenantId, adminBasePath, isOpen, onClose }: AssistantPanelProps) {
  const conversationRef = useRef<string | null>(null)
  const [draft, setDraft] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/assistant/chat',
        // Only the new message travels: the server rebuilds history itself.
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages[messages.length - 1]
          const text = last.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join(' ')
          const images = last.parts.flatMap((part) => (part.type === 'file' ? [part.url] : []))
          const message = images.length > 0 ? { id: last.id, text, images } : { id: last.id, text }
          return { body: { tenantId, conversationId: conversationRef.current, message } }
        },
      }),
    [tenantId],
  )

  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({ transport })
  const isBusy = status === 'submitted' || status === 'streaming'
  const [history, setHistory] = useState<ConversationSummary[] | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  // A transcript joins whatever is already typed; the owner reviews it before sending.
  const voice = useVoiceInput({
    tenantId,
    onTranscript: (text) => {
      setDraft((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text))
      inputRef.current?.focus()
    },
  })
  const { cancel: cancelVoice } = voice

  const openHistory = async () => {
    setIsHistoryOpen(true)
    setHistory(null)
    setHistoryError(null)
    try {
      const response = await fetch(`/api/assistant/conversations?tenantId=${encodeURIComponent(tenantId)}`)
      const body = (await response.json()) as { conversations?: ConversationSummary[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not load your chats.')
      setHistory(body.conversations ?? [])
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : 'Could not load your chats.')
    }
  }

  const reopen = async (conversationId: string) => {
    setHistoryError(null)
    try {
      const response = await fetch(`/api/assistant/conversations?tenantId=${encodeURIComponent(tenantId)}&id=${conversationId}`)
      const body = (await response.json()) as { messages?: UIMessage[]; error?: string }
      if (!response.ok || !body.messages) throw new Error(body.error ?? 'Could not open that chat.')
      stop()
      clearError()
      conversationRef.current = conversationId
      setMessages(body.messages)
      setIsHistoryOpen(false)
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : 'Could not open that chat.')
    }
  }

  useEffect(() => {
    conversationRef.current = conversationIdOf(messages) ?? conversationRef.current
  }, [messages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, status])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
    else cancelVoice()
  }, [isOpen, cancelVoice])

  const addPhotos = async (files: FileList | null) => {
    const picked = Array.from(files ?? []).slice(0, MAX_PHOTOS_PER_MESSAGE - photos.length)
    if (picked.length === 0) return
    setPhotoError(null)
    setIsPreparingPhotos(true)
    try {
      const prepared = await Promise.all(picked.map(prepareMenuPhoto))
      const next = [...photos, ...prepared]
      if (next.reduce((sum, photo) => sum + photo.length, 0) > MAX_PHOTOS_TOTAL_CHARS) throw new PhotoError('Those photos are too large together. Send fewer at a time.')
      setPhotos(next)
    } catch (photoFailure) {
      setPhotoError(photoFailure instanceof PhotoError ? photoFailure.message : 'That photo could not be added.')
    } finally {
      setIsPreparingPhotos(false)
    }
  }

  const send = (text: string) => {
    const trimmed = text.trim() || (photos.length > 0 ? PHOTO_ONLY_TEXT : '')
    if (!trimmed || isBusy || isPreparingPhotos) return
    clearError()
    setDraft('')
    setPhotos([])
    setPhotoError(null)
    const files = photos.map((url) => ({ type: 'file' as const, mediaType: 'image/jpeg', url }))
    void sendMessage({ text: trimmed.slice(0, MAX_INPUT_CHARS), ...(files.length > 0 ? { files } : {}) })
  }

  const startOver = () => {
    stop()
    conversationRef.current = null
    setMessages([])
    clearError()
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
  const chips = !isBusy && lastAssistant ? collectChips(lastAssistant) : []
  const errorText = readError(error)

  return (
    <div
      role="dialog"
      aria-label="Owl assistant"
      aria-hidden={!isOpen}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-[#FBFAF7] md:inset-auto md:bottom-24 md:right-6 md:h-[min(680px,calc(100vh-8rem))] md:w-[400px] md:rounded-3xl md:shadow-2xl md:ring-1 md:ring-border',
        isOpen ? 'flex' : 'hidden',
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Image src="/assistant/owl-96.webp" alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold tracking-[-0.01em]">Owl</p>
          <p className="truncate text-[11px] text-muted-foreground">Your store assistant</p>
        </div>
        <button type="button" onClick={openHistory} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Past chats" title="Past chats">
          <History className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { startOver(); setIsHistoryOpen(false) }} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="New chat" title="New chat">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close assistant">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isHistoryOpen ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold">Past chats</p>
              <button type="button" onClick={() => setIsHistoryOpen(false)} className="text-xs font-semibold text-muted-foreground hover:underline">
                Back
              </button>
            </div>
            {historyError ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{historyError}</p> : null}
            {history === null && !historyError ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" /> : null}
            {history?.length === 0 ? <p className="text-[13px] text-muted-foreground">No past chats yet.</p> : null}
            {history?.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => reopen(conversation.id)}
                className="block w-full rounded-xl bg-white px-3 py-2 text-left ring-1 ring-border hover:bg-muted"
              >
                <span className="block truncate text-[13px] font-semibold">{conversation.title ?? 'Untitled chat'}</span>
                <span className="text-[11px] text-muted-foreground">{DATE_LABEL.format(new Date(conversation.updatedAt))}</span>
              </button>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-[15px] font-bold">Hi! What would you like to know?</p>
              <p className="text-[13px] text-muted-foreground">I read your real sales and menu, then suggest what to do next. Send a photo of a menu and I’ll add its dishes.</p>
            </div>
            {STARTERS.map((group) => (
              <div key={group.title} className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.prompts.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => send(prompt)} className="rounded-full bg-white px-3 py-1.5 text-[13px] ring-1 ring-border hover:bg-muted">
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          messages.map((message) => <AssistantMessage key={message.id} message={message} tenantId={tenantId} adminBasePath={adminBasePath} onNavigate={onClose} />)
        )}
        {status === 'submitted' ? <p className="text-xs text-muted-foreground">Thinking…</p> : null}
        {errorText ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{errorText}</p> : null}
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button key={chip.prompt} type="button" onClick={() => send(chip.prompt)} className="rounded-full bg-white px-3 py-1.5 text-[12px] font-medium ring-1 ring-border hover:bg-muted">
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-border bg-white px-3 py-3 md:rounded-b-3xl"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        {voice.error ? <p className="mb-2 text-[12px] text-rose-700">{voice.error}</p> : null}
        {photos.length > 0 || isPreparingPhotos || photoError ? (
          <div className="mb-2 space-y-1.5">
            <div className="flex gap-2">
              {photos.map((photo, index) => (
                <div key={index} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, not an optimisable asset */}
                  <img src={photo} alt={`Photo ${index + 1}`} className="h-14 w-14 rounded-xl object-cover ring-1 ring-border" />
                  <button
                    type="button"
                    onClick={() => setPhotos(photos.filter((_, other) => other !== index))}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-neutral-900 text-white"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {isPreparingPhotos ? (
                <div className="grid h-14 w-14 place-items-center rounded-xl bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Preparing photo" />
                </div>
              ) : null}
            </div>
            {photoError ? <p className="text-[12px] text-rose-700">{photoError}</p> : null}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void addPhotos(event.target.files)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || photos.length >= MAX_PHOTOS_PER_MESSAGE}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="Add a menu photo"
            title="Add a menu photo"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          {voice.state === 'recording' ? (
            <div className="flex min-h-[40px] flex-1 items-center gap-2 rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[14px] text-rose-900" role="status">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" aria-hidden />
              <span className="flex-1">Listening… {formatClock(voice.elapsedSec)}</span>
              <button type="button" onClick={voice.cancel} className="rounded-full p-1 text-rose-900/70 hover:bg-rose-100" aria-label="Cancel recording" title="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send(draft)
                }
              }}
              maxLength={MAX_INPUT_CHARS}
              rows={1}
              readOnly={voice.state === 'transcribing'}
              placeholder={
                voice.state === 'transcribing'
                  ? 'Turning your voice into text…'
                  : photos.length > 0
                    ? 'Add a note, or just send'
                    : 'Ask about sales, menu, customers…'
              }
              aria-label="Message Owl"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl bg-muted/60 px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          )}
          {isBusy ? (
            <button type="button" onClick={stop} className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-white" aria-label="Stop">
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : voice.state === 'recording' ? (
            <button type="button" onClick={voice.stop} className="grid h-10 w-10 place-items-center rounded-full bg-rose-600 text-white" aria-label="Done talking" title="Done">
              <Check className="h-4 w-4" />
            </button>
          ) : voice.state === 'transcribing' ? (
            <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-white" aria-label="Turning your voice into text">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          ) : voice.isSupported && !draft.trim() && photos.length === 0 ? (
            <button
              type="button"
              onClick={() => void voice.start()}
              className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-white"
              aria-label="Talk to Owl"
              title="Talk instead of typing"
            >
              <Mic className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={(!draft.trim() && photos.length === 0) || isPreparingPhotos} className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-white disabled:opacity-30" aria-label="Send">
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
