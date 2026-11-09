import { copyText } from '@/lib/clipboard'

const setClipboard = (writeText?: (text: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: writeText ? { writeText } : undefined })

describe('copyText', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: jest.fn(() => true) })
  })

  it('uses the clipboard API when the browser offers it', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    await expect(copyText('12 Rizal Ave')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('12 Rizal Ave')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('falls back to a selection copy when the API refuses (in-app browsers)', async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error('NotAllowedError')))
    await expect(copyText('12 Rizal Ave')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when there is no clipboard API at all (http pages)', async () => {
    setClipboard(undefined)
    await expect(copyText('x')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('reports failure when neither way works, so the page can say so', async () => {
    setClipboard(undefined)
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: jest.fn(() => false) })
    await expect(copyText('x')).resolves.toBe(false)
  })
})
