'use client'

import { useEffect } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { useCart } from '@/hooks/useCart'

/**
 * Captures Messenger PSID from URL parameters and stores it in cart context.
 * This component should be rendered inside CartProvider.
 * 
 * When a user clicks "View Menu" from Messenger, the URL includes ?psid=...
 * This component captures that PSID and stores it for order tracking.
 */
export function MessengerPsidCapture() {
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const router = useRouter()
    const { setMessengerPsid, messengerPsid } = useCart()

    useEffect(() => {
        const psidFromUrl = searchParams.get('psid')

        if (psidFromUrl) {
            // Store the PSID
            setMessengerPsid(psidFromUrl)
            console.log('[Messenger] Captured PSID from URL:', psidFromUrl)

            // Clean up URL by removing psid parameter
            const newParams = new URLSearchParams(searchParams.toString())
            newParams.delete('psid')
            const newUrl = newParams.toString()
                ? `${pathname}?${newParams.toString()}`
                : pathname

            // Replace URL without psid (keeps history clean)
            router.replace(newUrl, { scroll: false })
        }
    }, [searchParams, pathname, router, setMessengerPsid])

    // This component doesn't render anything visible
    return null
}
