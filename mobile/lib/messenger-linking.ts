import { Linking, Alert } from 'react-native'
import * as Clipboard from 'expo-clipboard'

/**
 * Extract the page ID / username from an m.me or messenger.com URL.
 * Returns null if the URL doesn't match expected patterns.
 */
function extractPageId(url: string): string | null {
    // m.me/{pageId}?...
    const mmeMatch = url.match(/m\.me\/([^/?]+)/)
    if (mmeMatch) return mmeMatch[1]

    // messenger.com/t/{pageId}
    const messengerMatch = url.match(/messenger\.com\/t\/([^/?]+)/)
    if (messengerMatch) return messengerMatch[1]

    return null
}

/**
 * Build a Messenger deep link URL for the native app.
 * On iOS / Android the fb-messenger:// scheme opens the Messenger app directly.
 */
function buildMessengerDeepLink(pageId: string): string {
    // fb-messenger://user-thread/{pageId} opens a conversation thread
    return `fb-messenger://user-thread/${pageId}`
}

/**
 * Open Facebook Messenger with a smart fallback chain:
 *
 * 1. If URL has `text` / `ref`, open it first to preserve pre-filled content
 * 2. Try `fb-messenger://` deep link → opens native Messenger app directly
 * 3. Fall back to the provided `m.me` URL (opens browser → redirects to app)
 * 4. If all fail, copy message to clipboard and show an alert
 *
 * @param messengerUrl  The m.me / messenger.com URL (with ?text= if applicable)
 * @param message       The order message text (used for clipboard fallback)
 */
export async function openMessenger(
    messengerUrl: string,
    message?: string
): Promise<void> {
    const pageId = extractPageId(messengerUrl)
    const hasQueryParams = /[?&](text|ref)=/i.test(messengerUrl)

    // Step 1: If URL has text/ref params, open it first to preserve pre-filled content.
    if (hasQueryParams && messengerUrl) {
        try {
            await Linking.openURL(messengerUrl)
            return
        } catch {
            // fall through to deep-link fallback
        }
    }

    // Step 2: Try native deep link (fb-messenger://)
    if (pageId) {
        const deepLink = buildMessengerDeepLink(pageId)
        try {
            await Linking.openURL(deepLink)
            // If we opened the native app via deep link, also copy message
            // to clipboard so the user can paste it (deep links don't prefill text)
            if (message) {
                await Clipboard.setStringAsync(message)
            }
            return
        } catch {
            // Deep link failed — fall through to next strategy
        }
    }

    // Step 3: Try the m.me / web URL (browser will redirect to Messenger if installed)
    if (messengerUrl) {
        try {
            await Linking.openURL(messengerUrl)
            return
        } catch {
            // fall through to clipboard fallback
        }
    }

    // Step 4: Clipboard fallback — copy message and inform user
    if (message) {
        await Clipboard.setStringAsync(message)
        Alert.alert(
            'Messenger Not Available',
            'We copied your order message to the clipboard. Please open Messenger manually and paste it to send your order.',
            [{ text: 'OK' }]
        )
    } else {
        Alert.alert(
            'Messenger Not Available',
            'Could not open Messenger. Please open Messenger manually and send your order.',
            [{ text: 'OK' }]
        )
    }
}
