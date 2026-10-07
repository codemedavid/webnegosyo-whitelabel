/**
 * The QR studio disables its export buttons until `printSheet` settles. A
 * hidden print frame that never loads used to leave them disabled for good.
 */

import { describe, test, expect, jest, afterEach } from '@jest/globals'
import { printSheet } from '@/lib/qr-print/browser-export'

jest.mock('fflate', () => ({ zipSync: () => new Uint8Array() }))

describe('printSheet', () => {
  afterEach(() => {
    jest.useRealTimers()
    document.body.innerHTML = ''
  })

  test('rejects and removes the frame when it never loads', async () => {
    // Arrange
    jest.useFakeTimers()
    const appendChild = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node)

    // Act
    const printing = printSheet('<p>codes</p>', 1_000)
    jest.advanceTimersByTime(1_000)

    // Assert
    await expect(printing).rejects.toThrow(/did not load/i)
    appendChild.mockRestore()
  })

  test('rejects when the frame reports an error', async () => {
    // Arrange
    let frame: HTMLIFrameElement | null = null
    const appendChild = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      frame = node as HTMLIFrameElement
      return node
    })

    // Act
    const printing = printSheet('<p>codes</p>', 60_000)
    ;(frame as unknown as HTMLIFrameElement).onerror?.(new Event('error'))

    // Assert
    await expect(printing).rejects.toThrow(/could not open/i)
    appendChild.mockRestore()
  })
})
