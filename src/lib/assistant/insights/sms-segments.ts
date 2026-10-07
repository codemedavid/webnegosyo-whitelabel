/**
 * How many texts one SMS will cost per guest. Any character outside the plain
 * GSM alphabet (₱, emoji, curly quotes) switches the whole message to UCS-2,
 * which cuts a text from 160 characters to 70 — the surprise worth flagging.
 * Placeholders are counted at typical filled-in lengths.
 */

const GSM_BASIC = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/
const TYPICAL_FIRST_NAME = 10
const TYPICAL_COUNT = 2

export interface SegmentEstimate {
  segments: number
  isUnicode: boolean
  length: number
}

export function estimateSmsSegments(template: string, storeName: string): SegmentEstimate {
  const filled = template
    .replace(/\{\{\s*firstName\s*\}\}/g, 'x'.repeat(TYPICAL_FIRST_NAME))
    .replace(/\{\{\s*storeName\s*\}\}/g, storeName)
    .replace(/\{\{\s*orderCount\s*\}\}/g, 'x'.repeat(TYPICAL_COUNT))
  const isUnicode = !GSM_BASIC.test(filled)
  const [single, multi] = isUnicode ? [70, 67] : [160, 153]
  const length = [...filled].length
  return { segments: length <= single ? 1 : Math.ceil(length / multi), isUnicode, length }
}
