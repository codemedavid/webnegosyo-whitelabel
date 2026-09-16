'use client'

import { RouteErrorFallback, type RouteErrorProps } from '@/components/shared/route-error-fallback'

// Covers storefront pages and failures in the admin/menu layouts themselves.
export default function TenantError(props: RouteErrorProps) {
  return <RouteErrorFallback {...props} boundary="tenant" />
}
