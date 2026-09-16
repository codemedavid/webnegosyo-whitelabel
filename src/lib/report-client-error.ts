import * as Sentry from '@sentry/nextjs'

/** Report caught render failures as well as errors handled by feature fallbacks. */
export function reportClientError(
  error: Error & { digest?: string },
  boundary: string,
  componentStack?: string | null,
) {
  // Diagnostics must not break the recovery screen if the SDK is unavailable.
  try {
    return Sentry.captureException(error, {
      tags: { errorBoundary: boundary },
      contexts: {
        nextjs: { digest: error.digest },
        ...(componentStack ? { react: { componentStack } } : {}),
      },
    })
  } catch {
    return undefined
  }
}
