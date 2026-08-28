'use client'

/**
 * Thermal-paper preview for the Receipt Studio: a paper roll with sawtooth
 * tear edges, rendered from the exact engine the merchant app prints with.
 */

const SAWTOOTH_SIZE = 10

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

interface PaperPreviewProps {
  receipt: string
}

export function PaperPreview({ receipt }: PaperPreviewProps) {
  return (
    <div className="drop-shadow-xl">
      <TornEdge side="top" />
      <div className="bg-white px-5 py-4">
        <pre className="font-mono text-[11px] leading-[1.4] text-neutral-800">{receipt}</pre>
      </div>
      <TornEdge side="bottom" />
    </div>
  )
}
