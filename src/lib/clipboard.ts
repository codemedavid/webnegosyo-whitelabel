/**
 * Puts `text` on the clipboard, true when it got there. The clipboard API is
 * missing on plain http and can be refused inside in-app browsers (Messenger,
 * Facebook), where most customers arrive, so it falls back to the old
 * selection copy. Call from a tap handler: browsers require the gesture.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused: the selection copy below may still be allowed.
  }
  return copyWithSelection(text)
}

function copyWithSelection(text: string): boolean {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const box = document.createElement('textarea')
  box.value = text
  box.readOnly = true
  // Off screen, and 16px so focusing it can't make iOS zoom the page.
  box.style.cssText = 'position:fixed;top:0;left:-9999px;font-size:16px'
  document.body.append(box)
  box.select()
  box.setSelectionRange(0, text.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    box.remove()
    previous?.focus({ preventScroll: true })
  }
}
