/**
 * Regression tests for the two production crashes these helpers close:
 *
 *  - JAVASCRIPT-NEXTJS-2F — "An unexpected response was received from the
 *    server." A Server Action POST from the menu admin answered with something
 *    that was not an RSC payload; the rejection escaped an unguarded
 *    `startTransition(async …)` and reached window.onunhandledrejection.
 *  - JAVASCRIPT-NEXTJS-2G — "TypeError: Load failed" on the order-types page
 *    while `document.visibilityState` was "hidden": an in-flight fetch the
 *    browser tore down on suspend, escalated to a full-page error screen.
 *
 * The contract under test: a guarded call never rejects, an abort is told apart
 * from a real failure, and nothing is reported without a message.
 */

import {
  UNEXPECTED_ACTION_RESPONSE,
  classifyActionFailure,
  describeActionError,
  readClientEnvironment,
  runServerAction,
  shouldDeferRefresh,
  type ClientEnvironment,
} from '@/components/admin/server-action-safety'

const VISIBLE_ONLINE: ClientEnvironment = { isOnline: true, visibility: 'visible' }
const HIDDEN_ONLINE: ClientEnvironment = { isOnline: true, visibility: 'hidden' }
const VISIBLE_OFFLINE: ClientEnvironment = { isOnline: false, visibility: 'visible' }

describe('classifyActionFailure', () => {
  test('classifies Next\'s unexpected-response rejection as a stale page', () => {
    // Arrange
    const error = new Error(UNEXPECTED_ACTION_RESPONSE)

    // Act
    const kind = classifyActionFailure(error, VISIBLE_ONLINE)

    // Assert
    expect(kind).toBe('stale-page')
  })

  test('classifies an action id the deployment no longer knows as a stale page', () => {
    // Arrange
    const error = new Error(
      'Server Action "7f0a" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'
    )

    // Act
    const kind = classifyActionFailure(error, VISIBLE_ONLINE)

    // Assert
    expect(kind).toBe('stale-page')
  })

  test('classifies an AbortError as aborted even on a visible, online page', () => {
    // Arrange
    const error = new DOMException('The operation was aborted.', 'AbortError')

    // Act
    const kind = classifyActionFailure(error, VISIBLE_ONLINE)

    // Assert
    expect(kind).toBe('aborted')
  })

  test('classifies "Load failed" while the tab is hidden as aborted, not a failure', () => {
    // Arrange — the exact shape of JAVASCRIPT-NEXTJS-2G
    const error = new TypeError('Load failed')

    // Act
    const kind = classifyActionFailure(error, HIDDEN_ONLINE)

    // Assert
    expect(kind).toBe('aborted')
  })

  test('classifies "Load failed" on a visible, online page as a real network failure', () => {
    // Arrange
    const error = new TypeError('Load failed')

    // Act
    const kind = classifyActionFailure(error, VISIBLE_ONLINE)

    // Assert
    expect(kind).toBe('network')
  })

  test('classifies "Failed to fetch" while offline as aborted', () => {
    // Arrange
    const error = new TypeError('Failed to fetch')

    // Act
    const kind = classifyActionFailure(error, VISIBLE_OFFLINE)

    // Assert
    expect(kind).toBe('aborted')
  })

  test('does not classify an application error as a transport failure', () => {
    // Arrange
    const error = new Error('Price must be greater than zero')

    // Act
    const kind = classifyActionFailure(error, HIDDEN_ONLINE)

    // Assert
    expect(kind).toBe('unknown')
  })
})

describe('describeActionError', () => {
  test('replaces the framework wording with an instruction the merchant can act on', () => {
    // Arrange
    const error = new Error(UNEXPECTED_ACTION_RESPONSE)

    // Act
    const message = describeActionError(error, VISIBLE_ONLINE)

    // Assert
    expect(message).not.toBe(UNEXPECTED_ACTION_RESPONSE)
    expect(message).toMatch(/reload the page/i)
  })

  test('keeps an application error message rather than replacing it', () => {
    // Arrange
    const error = new Error('Price must be greater than zero')

    // Act
    const message = describeActionError(error, VISIBLE_ONLINE)

    // Assert
    expect(message).toBe('Price must be greater than zero')
  })

  test('falls back to a generic message when the rejection carries no text', () => {
    // Arrange
    const error = { nothing: 'useful' }

    // Act
    const message = describeActionError(error, VISIBLE_ONLINE)

    // Assert
    expect(message).toBe('Something went wrong. Please try again.')
  })

  test('says an aborted request saved nothing so the merchant is never left guessing', () => {
    // Arrange
    const error = new TypeError('Load failed')

    // Act
    const message = describeActionError(error, HIDDEN_ONLINE)

    // Assert
    expect(message).toMatch(/nothing was saved/i)
  })
})

describe('runServerAction', () => {
  test('returns the action result when the call lands', async () => {
    // Arrange
    const invoke = jest.fn().mockResolvedValue({ success: true, data: ['tag-1'] })

    // Act
    const outcome = await runServerAction(invoke)

    // Assert
    expect(outcome).toEqual({ ok: true, value: { success: true, data: ['tag-1'] } })
  })

  test('never rejects when the Server Action promise rejects', async () => {
    // Arrange — the rejection that produced JAVASCRIPT-NEXTJS-2F
    const invoke = () => Promise.reject(new Error(UNEXPECTED_ACTION_RESPONSE))

    // Act
    const outcome = await runServerAction(invoke)

    // Assert
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.kind).toBe('stale-page')
    expect(outcome.ok === false && outcome.message).toMatch(/reload the page/i)
  })

  test('reports a backgrounded abort as aborted rather than as a crash', async () => {
    // Arrange
    const hide = jest
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden' as DocumentVisibilityState)

    try {
      // Act
      const outcome = await runServerAction(() => Promise.reject(new TypeError('Load failed')))

      // Assert
      expect(outcome.ok === false && outcome.kind).toBe('aborted')
    } finally {
      hide.mockRestore()
    }
  })

  test('does not swallow the failure — every failed outcome carries a message', async () => {
    // Arrange
    const invoke = () => Promise.reject(new Error('Tenant not found'))

    // Act
    const outcome = await runServerAction(invoke)

    // Assert
    expect(outcome.ok === false && outcome.message).toBe('Tenant not found')
  })
})

describe('shouldDeferRefresh', () => {
  test('defers an RSC refresh while the tab is hidden', () => {
    // Arrange / Act
    const deferred = shouldDeferRefresh('hidden')

    // Assert
    expect(deferred).toBe(true)
  })

  test('refreshes immediately while the tab is visible', () => {
    // Arrange / Act
    const deferred = shouldDeferRefresh('visible')

    // Assert
    expect(deferred).toBe(false)
  })
})

describe('readClientEnvironment', () => {
  test('reports the live visibility state so an abort can be recognised', () => {
    // Arrange
    const hide = jest
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden' as DocumentVisibilityState)

    try {
      // Act
      const env = readClientEnvironment()

      // Assert
      expect(env.visibility).toBe('hidden')
    } finally {
      hide.mockRestore()
    }
  })

  test('treats an unreadable connection state as online so real errors stay visible', () => {
    // Arrange
    const broken = jest.spyOn(navigator, 'onLine', 'get').mockImplementation(() => {
      throw new Error('blocked by privacy settings')
    })

    try {
      // Act
      const env = readClientEnvironment()

      // Assert
      expect(env.isOnline).toBe(true)
    } finally {
      broken.mockRestore()
    }
  })
})
