/**
 * Scroll `element` into view inside its own scrolling pane, and only when it
 * is out of view. The Studio keeps the block list and the paper in sync; with
 * `scrollIntoView` the second call cancelled the first pane's smooth scroll,
 * because it scrolls every ancestor at once. Scrolling each pane directly
 * leaves the other alone.
 */
const EDGE_PADDING_PX = 12

function scrollingPane(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

export function scrollIntoPane(element: HTMLElement | null | undefined): void {
  if (!element) return
  const pane = scrollingPane(element)
  if (!pane) return
  const paneBox = pane.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  let delta = 0
  if (box.top < paneBox.top + EDGE_PADDING_PX) {
    delta = box.top - paneBox.top - EDGE_PADDING_PX
  } else if (box.bottom > paneBox.bottom - EDGE_PADDING_PX) {
    // A row taller than the pane shows its top rather than its bottom.
    delta = Math.min(box.bottom - paneBox.bottom + EDGE_PADDING_PX, box.top - paneBox.top - EDGE_PADDING_PX)
  }
  if (delta !== 0) pane.scrollBy({ top: delta, behavior: 'smooth' })
}
