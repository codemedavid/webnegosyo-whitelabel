import type { Metadata } from 'next'
import { FunnelPage } from '@/components/funnel/funnel-page'
import { FUNNEL_METADATA } from '@/components/funnel/funnel-metadata'

export const metadata: Metadata = FUNNEL_METADATA

export default function FunnelRoute() {
  return <FunnelPage />
}
