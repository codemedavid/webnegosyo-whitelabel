'use client'

import { RouteErrorFallback, type RouteErrorProps } from '@/components/shared/route-error-fallback'

// A segment's own error.tsx cannot catch its layout; catch tenant layouts here.
export default function AppError(props: RouteErrorProps) {
  return <RouteErrorFallback {...props} boundary="app" />
}
