// ---------------------------------------------------------------------------
// "HTML & CSS" widget sanitizer. Runs in the browser (DOMPurify needs a DOM)
// right before the markup is written into the block's shadow root — output
// sanitization, so it also covers designs that reached the DB by other paths.
// Scripts, event handlers, forms, frames and javascript: URLs are removed;
// <style> survives because the shadow root scopes it to the block.
// ---------------------------------------------------------------------------

import DOMPurify from 'dompurify'

import { LIMITS } from './constants'

const FORBID_TAGS = [
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'link', 'meta',
  'form', 'input', 'button', 'textarea', 'select', 'option', 'noscript', 'template', 'portal',
]
const FORBID_ATTR = ['action', 'formaction', 'srcdoc', 'ping', 'autofocus']

/**
 * DOMPurify tests EVERY non-URI-safe attribute value (width, colspan, target…)
 * against this, not just hrefs — so it must pass plain values. Allowed: the
 * https/http/mailto/tel/sms schemes, values that start with a non-letter
 * (#anchor, /path, 200, _blank) except protocol-relative `//` or `/\`, and
 * scheme-less words. Every other scheme (javascript:, data:, vbscript:…) fails.
 */
const SAFE_ATTR_VALUE = /^(?:(?:https?|mailto|tel|sms):|(?![\\/]{2})[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

/** Drop CSS constructs that load remote code or escape the block. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(')
    .replace(/javascript:/gi, '')
    .replace(/-moz-binding\s*:[^;]*;?/gi, '')
    .replace(/behavior\s*:[^;]*;?/gi, '')
}

let hooksInstalled = false

function installHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style' && node.textContent) node.textContent = sanitizeCss(node.textContent)
  })
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.hasAttribute('style')) {
      node.setAttribute('style', sanitizeCss(node.getAttribute('style') ?? ''))
    }
    // `target` is allowed only as _blank (new tab that cannot reach back into
    // the store). Named targets would open a window that keeps its opener.
    if (node instanceof Element && node.hasAttribute('target')) {
      const isBlank = node.tagName === 'A' && node.getAttribute('target')?.toLowerCase() === '_blank'
      if (isBlank) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      } else {
        node.removeAttribute('target')
      }
    }
  })
}

export function sanitizeWidgetHtml(html: unknown): string {
  if (typeof html !== 'string' || !html) return ''
  if (typeof window === 'undefined') return ''
  installHooks()
  return DOMPurify.sanitize(html.slice(0, LIMITS.htmlLength), {
    // HTML only — SVG/MathML are dropped entirely (the classic mXSS surface;
    // icons have their own widget).
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR,
    ADD_TAGS: ['style'],
    // DOMPurify drops `target` by default; the hook above normalises it.
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_ATTR_VALUE,
  })
}
