/**
 * Errors whose message was written for the buyer. Everything else (database,
 * network, validation internals) is logged server-side and replaced by a
 * generic message before it reaches the caller.
 */

const BUYER_FACING = 'OnboardingBuyerFacingError'

export function buyerFacingError(message: string): Error {
  const error = new Error(message)
  error.name = BUYER_FACING
  return error
}

export function isBuyerFacingError(error: unknown): error is Error {
  return error instanceof Error && error.name === BUYER_FACING
}
