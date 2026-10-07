/**
 * Best-effort work that follows a saved order (notifications, the Regulars
 * list, the Loyverse receipt) must not hold the customer's response hostage,
 * and must still run when there is no request to defer it behind.
 */

import { describe, test, expect, jest } from '@jest/globals'
import { runAfterResponse, type AfterScheduler } from '@/lib/checkout/after-response'

describe('runAfterResponse', () => {
  test('hands the task to the scheduler instead of running it inline', async () => {
    // Arrange
    const scheduled: Array<() => Promise<void>> = []
    const schedule: AfterScheduler = (task) => { scheduled.push(task) }
    const task = jest.fn(async () => {})

    // Act
    await runAfterResponse('notify', task, schedule)

    // Assert
    expect(task).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(1)
    await scheduled[0]()
    expect(task).toHaveBeenCalledTimes(1)
  })

  test('runs the task inline when there is no request scope to defer behind', async () => {
    // Arrange
    const schedule: AfterScheduler = () => {
      throw new Error('`after` was called outside a request scope')
    }
    const task = jest.fn(async () => {})

    // Act
    await runAfterResponse('notify', task, schedule)

    // Assert
    expect(task).toHaveBeenCalledTimes(1)
  })

  test('never throws when the deferred task fails — it logs instead', async () => {
    // Arrange
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const scheduled: Array<() => Promise<void>> = []
    const schedule: AfterScheduler = (task) => { scheduled.push(task) }

    // Act
    await runAfterResponse('notify', async () => { throw new Error('boom') }, schedule)
    await expect(scheduled[0]()).resolves.toBeUndefined()

    // Assert
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('notify'), 'boom')
    errorSpy.mockRestore()
  })

  test('with the default scheduler, outside a request it still runs the task', async () => {
    // Arrange — jest has no Next request scope, so `after()` refuses.
    const task = jest.fn(async () => {})

    // Act
    await runAfterResponse('notify', task)

    // Assert
    expect(task).toHaveBeenCalledTimes(1)
  })

  test('never throws when the inline fallback task fails', async () => {
    // Arrange
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const schedule: AfterScheduler = () => { throw new Error('no scope') }

    // Act + Assert
    await expect(
      runAfterResponse('notify', async () => { throw new Error('boom') }, schedule),
    ).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
