/**
 * The web mic: picks a format the browser can record, sends the clip, hands
 * the transcript to the composer, and always releases the microphone.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { micErrorMessage, pickRecordingType, useVoiceInput, voiceFilename } from '@/components/admin/assistant/voice-input'

const TENANT = '11111111-1111-4111-8111-111111111111'

class FakeRecorder {
  static instances: FakeRecorder[] = []
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm;codecs=opus'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor() {
    FakeRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['clip'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

const stopTrack = jest.fn()
const getUserMedia = jest.fn()
const fetchMock = jest.fn()

beforeEach(() => {
  FakeRecorder.instances = []
  stopTrack.mockReset()
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] })
  fetchMock.mockReset()
  Object.assign(globalThis, { MediaRecorder: FakeRecorder, fetch: fetchMock })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
})

describe('voice helpers', () => {
  test('prefers opus webm, falls back to mp4 for Safari', () => {
    expect(pickRecordingType(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickRecordingType((type) => type === 'audio/mp4')).toBe('audio/mp4')
    expect(pickRecordingType(() => false)).toBeUndefined()
  })

  test('names the file after its container', () => {
    expect(voiceFilename('audio/mp4')).toBe('voice.m4a')
    expect(voiceFilename('audio/ogg;codecs=opus')).toBe('voice.ogg')
    expect(voiceFilename('audio/webm;codecs=opus')).toBe('voice.webm')
  })

  test('explains a blocked microphone', () => {
    expect(micErrorMessage(new DOMException('no', 'NotAllowedError'))).toMatch(/Allow microphone/)
    expect(micErrorMessage(new DOMException('no', 'NotFoundError'))).toMatch(/No microphone/)
    expect(micErrorMessage(new Error('boom'))).toMatch(/type instead/)
  })
})

describe('useVoiceInput', () => {
  test('records, transcribes and hands back the text', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ text: 'Ilan orders ngayon?' }) })
    const onTranscript = jest.fn()
    const { result } = renderHook(() => useVoiceInput({ tenantId: TENANT, onTranscript }))
    expect(result.current.isSupported).toBe(true)

    await act(() => result.current.start())
    expect(result.current.state).toBe('recording')
    act(() => result.current.stop())

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('Ilan orders ngayon?'))
    expect(result.current.state).toBe('idle')
    expect(stopTrack).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/assistant/transcribe')
    expect((init.body as FormData).get('tenantId')).toBe(TENANT)
  })

  test('cancel releases the mic without sending anything', async () => {
    const onTranscript = jest.fn()
    const { result } = renderHook(() => useVoiceInput({ tenantId: TENANT, onTranscript }))

    await act(() => result.current.start())
    act(() => result.current.cancel())

    expect(result.current.state).toBe('idle')
    expect(stopTrack).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('shows the server refusal', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Voice input isn’t set up yet. Please type your message.' }) })
    const onTranscript = jest.fn()
    const { result } = renderHook(() => useVoiceInput({ tenantId: TENANT, onTranscript }))

    await act(() => result.current.start())
    act(() => result.current.stop())

    await waitFor(() => expect(result.current.error).toMatch(/isn’t set up/))
    expect(onTranscript).not.toHaveBeenCalled()
  })

  test('explains a denied microphone', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const { result } = renderHook(() => useVoiceInput({ tenantId: TENANT, onTranscript: jest.fn() }))

    await act(() => result.current.start())

    expect(result.current.state).toBe('idle')
    expect(result.current.error).toMatch(/Allow microphone/)
  })

  test('closing while the browser is still asking for the mic never starts recording', async () => {
    let grant: (stream: unknown) => void = () => {}
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)))
    const { result, unmount } = renderHook(() => useVoiceInput({ tenantId: TENANT, onTranscript: jest.fn() }))

    let starting: Promise<void> = Promise.resolve()
    act(() => {
      starting = result.current.start()
    })
    unmount()
    await act(async () => {
      grant({ getTracks: () => [{ stop: stopTrack }] })
      await starting
    })

    expect(FakeRecorder.instances).toHaveLength(0)
    expect(stopTrack).toHaveBeenCalled()
  })

  test('a recorder the browser refuses releases the mic and explains', async () => {
    Object.assign(globalThis, {
      MediaRecorder: class RefusingRecorder {
        static isTypeSupported(): boolean {
          return false
        }
        constructor() {
          throw new DOMException('nope', 'NotSupportedError')
        }
      },
    })
    const { result } = renderHook(() => useVoiceInput({ tenantId: TENANT, onTranscript: jest.fn() }))

    await act(() => result.current.start())

    expect(result.current.state).toBe('idle')
    expect(result.current.error).toMatch(/type instead/)
    expect(stopTrack).toHaveBeenCalled()
  })

  test('unmounting mid-recording releases the mic', async () => {
    const { result, unmount } = renderHook(() => useVoiceInput({ tenantId: TENANT, onTranscript: jest.fn() }))

    await act(() => result.current.start())
    unmount()

    expect(stopTrack).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
