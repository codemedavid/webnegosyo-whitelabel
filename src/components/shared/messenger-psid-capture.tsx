'use client'

import { useEffect } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { useCart } from '@/hooks/useCart'
import { looksLikeMessengerLinkToken, MESSENGER_LINK_QUERY_PARAM } from '@/lib/messenger/link-token-shape'

/** Menu cards sent before 2026-11-10 carried the raw PSID; the server still honours them for a while. */
const LEGACY_PSID_PARAM = 'psid'

/**
 * Keeps the Messenger reference a link from the store's chat carried, so the
 * order (and the cart summary) can reach that conversation.
 *
 * Links from the bot carry `?m=<signed token>`; the value is opaque here and
 * the server resolves it to a PSID for THIS store only
 * (`src/lib/messenger/recipient.ts`). Rendered inside CartProvider.
 */
export function MessengerPsidCapture() {
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const router = useRouter()
    const { setMessengerPsid } = useCart()

    useEffect(() => {
        const token = searchParams.get(MESSENGER_LINK_QUERY_PARAM)
        const legacyPsid = searchParams.get(LEGACY_PSID_PARAM)
        if (token === null && legacyPsid === null) return

        if (looksLikeMessengerLinkToken(token)) setMessengerPsid(token)
        else if (legacyPsid) setMessengerPsid(legacyPsid)

        // Keep the address bar (and anything shared from it) free of the reference.
        const newParams = new URLSearchParams(searchParams.toString())
        newParams.delete(MESSENGER_LINK_QUERY_PARAM)
        newParams.delete(LEGACY_PSID_PARAM)
        const query = newParams.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }, [searchParams, pathname, router, setMessengerPsid])

    return null
}
