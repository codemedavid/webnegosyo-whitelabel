'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_VOICE_SECONDS } from '@/lib/assistant/limits'

/**
 * Talk to the Owl: record a clip in the browser (MediaRecorder), send it to
 * /api/assistant/transcribe, and hand the text back for the composer. The
 * owner always sees and can edit the transcript before it is sent.
 */

export type VoiceState = 'idle' | 'recording' | 'transcribing'

/** Opus first (Chrome, Firefox, Edge); Safari only records mp4/AAC. */
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const

export function pickRecordingType(isTypeSupported: (type: string) => boolean): string | undefined {
  return PREFERRED_TYPES.find((type) => isTypeSupported(type))
}

/** Whisper reads the container from the extension, so it must match the bytes. */
export function voiceFilename(type: string): string {
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'voice.m4a'
  if (type.includes('ogg')) return 'voice.ogg'
  return 'voice.webm'
}

export function micErrorMessage(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Allow microphone access in your browser to talk to Owl.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found on this device.'
  return 'Couldn’t start the microphone. Please type instead.'
}

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

async function requestTranscript(tenantId: string, clip: Blob): Promise<string> {
  const form = new FormData()
  form.append('tenantId', tenantId)
  form.append('audio', clip, voiceFilename(clip.type))
  const response = await fetch('/api/assistant/transcribe', { method: 'POST', body: form })
  const body = (await response.json().catch(() => ({}))) as { text?: unknown; error?: unknown }
  if (!response.ok || typeof body.text !== 'string') {
    throw new Error(typeof body.error === 'string' ? body.error : 'Couldn’t turn that into text. Please try again.')
  }
  return body.text
}

interface VoiceInputOptions {
  tenantId: string
  onTranscript: (text: string) => void
}

export function useVoiceInput({ tenantId, onTranscript }: VoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [isSupported, setIsSupported] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const isCancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  // Decided after mount: the server render has no MediaRecorder.
  useEffect(() => setIsSupported(isVoiceSupported()), [])

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const stop = useCallback(() => {
    clearTimer()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const cancel = useCallback(() => {
    isCancelledRef.current = true
    stop()
  }, [stop])

  const start = useCallback(async () => {
    if (recorderRef.current) return
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (micError) {
      setError(micErrorMessage(micError))
      return
    }

    const mimeType = pickRecordingType((type) => MediaRecorder.isTypeSupported(type))
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    recorderRef.current = recorder
    isCancelledRef.current = false

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      clearTimer()
      if (isCancelledRef.current || chunks.length === 0) {
        setState('idle')
        return
      }
      setState('transcribing')
      try {
        const text = await requestTranscript(tenantId, new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
        onTranscriptRef.current(text)
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Couldn’t turn that into text. Please try again.')
      } finally {
        setState('idle')
      }
    }

    recorder.start()
    setElapsedSec(0)
    setState('recording')
    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      setElapsedSec(seconds)
      if (seconds >= MAX_VOICE_SECONDS) stop()
    }, 250)
  }, [tenantId, stop])

  // Closing the page mid-recording must release the microphone.
  useEffect(() => cancel, [cancel])

  return { state, error, elapsedSec, isSupported, start, stop, cancel, clearError: () => setError(null) }
}
