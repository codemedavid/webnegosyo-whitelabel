'use client'

/**
 * Thermal-paper preview for the Receipt Studio: a paper roll with sawtooth
 * tear edges, rendered from the exact segments the merchant app prints —
 * text as monospace lines, the logo as a grayscale raster, the QR (which
 * prints as a scannable code) degraded to its URL like the flat renderer.
 * Styled lines carry the printer's inline markup; the paper cannot show
 * bold or tall text, so they are flattened the same way browser printing is.
 */

import { flattenReceiptMarkup, type ReceiptSegment } from '@/lib/receipt-layout'

const SAWTOOTH_SIZE = 10
const PAPER_WIDTH_CHARS = 32

/** A torn paper edge — triangles pointing into the paper. */
function TornEdge({ side }: { side: 'top' | 'bottom' }) {
  const direction = side === 'top' ? '' : 'rotate(180deg)'
  return (
    <div
      aria-hidden="true"
      style={{
        height: SAWTOOTH_SIZE,
        transform: direction,
        background:
          `linear-gradient(45deg, transparent 33.333%, #ffffff 33.333%, #ffffff 66.667%, transparent 66.667%),` +
          `linear-gradient(-45deg, transparent 33.333%, #ffffff 33.333%, #ffffff 66.667%, transparent 66.667%)`,
        backgroundSize: `${SAWTOOTH_SIZE * 2}px ${SAWTOOTH_SIZE * 2}px`,
        backgroundPosition: `0 ${SAWTOOTH_SIZE}px`,
      }}
    />
  )
}

/** Chunk a long URL to the paper width, like the flat renderer does. */
function wrapToPaper(data: string): string {
  const wrapped: string[] = []
  for (let i = 0; i < data.length; i += PAPER_WIDTH_CHARS) {
    wrapped.push(data.slice(i, i + PAPER_WIDTH_CHARS))
  }
  return wrapped.join('\n')
}

interface PaperPreviewProps {
  segments: ReceiptSegment[]
}

export function PaperPreview({ segments }: PaperPreviewProps) {
  return (
    <div className="drop-shadow-xl">
      <TornEdge side="top" />
      <div className="bg-white px-5 py-4">
        {segments.map((segment, index) => {
          if (segment.type === 'image') {
            return (
              // Plain <img>: tenant logos live on external hosts not in the
              // next/image allowlist, and this is an editor-only preview.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={segment.url}
                alt="Store logo as printed"
                className="mx-auto my-1 max-h-24 max-w-[200px] object-contain grayscale contrast-125"
              />
            )
          }
          const text =
            segment.type === 'text'
              ? flattenReceiptMarkup(segment.text, PAPER_WIDTH_CHARS)
              : wrapToPaper(segment.data)
          return (
            <pre key={index} className="font-mono text-[11px] leading-[1.4] text-neutral-800">
              {text}
            </pre>
          )
        })}
      </div>
      <TornEdge side="bottom" />
    </div>
  )
}
