'use client'

import { useEffect, useRef } from 'react'
import { META_PIXEL_READY_EVENT, trackMetaEvent } from '@/lib/meta-pixel'

/** The root bootstrap owns init/PageView; this landing visit adds only ViewContent. */
export function LandingViewContent() {
  const sent = useRef(false)
  useEffect(() => {
    const track = () => {
      if (sent.current || !window.fbq) return
      sent.current = true
      trackMetaEvent('ViewContent', {
        content_name: 'SmartMenu by WebNegosyo',
        content_category: 'Marketing Landing Page',
      })
    }
    // afterInteractive may run after this effect, or already be queued on a
    // client-side return to the landing page. Cover both without a second init.
    window.addEventListener(META_PIXEL_READY_EVENT, track)
    track()
    return () => window.removeEventListener(META_PIXEL_READY_EVENT, track)
  }, [])
  return null
}
