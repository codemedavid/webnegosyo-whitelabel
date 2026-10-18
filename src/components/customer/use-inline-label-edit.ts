'use client'

/**
 * Inline text editing in the Branding Studio preview: double-click (or
 * double-tap) a store label to retype it on the page. Enter or leaving the
 * text saves it to the editor's draft; Escape cancels.
 *
 * React owns the label's text node, so the edit is never left in the DOM: the
 * original node is put back and the editor's draft re-renders the new words.
 * Only one message leaves the frame per edit (no per-keystroke round trips
 * that would move the caret).
 */

import { useEffect } from 'react'
import { BRANDING_SCOPE_ATTRIBUTE, BRANDING_TEXT_EDIT_MESSAGE, labelKeyOfScope } from '@/lib/branding-inspect'
import { STOREFRONT_LABELS, cleanLabelText } from '@/lib/storefront-labels'

function startEditing(element: HTMLElement): void {
    const scopeKey = element.getAttribute(BRANDING_SCOPE_ATTRIBUTE)
    const key = labelKeyOfScope(scopeKey)
    if (!key || element.isContentEditable) return

    const original = [...element.childNodes]
    const originalText = element.textContent ?? ''
    const restore = () => {
        element.removeAttribute('contenteditable')
        element.replaceChildren(...original)
        original.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) node.textContent = originalText
        })
    }

    const finish = (shouldSave: boolean) => {
        element.removeEventListener('keydown', handleKeyDown)
        element.removeEventListener('blur', handleBlur)
        const text = cleanLabelText(element.textContent ?? '', STOREFRONT_LABELS[key].maxLength)
        restore()
        if (!shouldSave || text === originalText.trim()) return
        try {
            window.parent?.postMessage({ type: BRANDING_TEXT_EDIT_MESSAGE, key, text }, window.location.origin)
        } catch {
            // Cross-origin parent (not the editor) — nothing to report to.
        }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
            event.preventDefault()
            finish(true)
        } else if (event.key === 'Escape') {
            event.preventDefault()
            finish(false)
        }
    }
    const handleBlur = () => finish(true)

    element.setAttribute('contenteditable', 'plaintext-only')
    element.addEventListener('keydown', handleKeyDown)
    element.addEventListener('blur', handleBlur)
    element.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    selection?.removeAllRanges()
    selection?.addRange(range)
}

/** While `isActive`, double-clicking a label in the preview edits it in place. */
export function useInlineLabelEdit(isActive: boolean): void {
    useEffect(() => {
        if (!isActive) return
        const handleDoubleClick = (event: MouseEvent) => {
            if (!(event.target instanceof Element)) return
            const element = event.target.closest(`[${BRANDING_SCOPE_ATTRIBUTE}^="label/"]`)
            if (!(element instanceof HTMLElement)) return
            event.preventDefault()
            event.stopPropagation()
            startEditing(element)
        }
        document.addEventListener('dblclick', handleDoubleClick, true)
        return () => document.removeEventListener('dblclick', handleDoubleClick, true)
    }, [isActive])
}
