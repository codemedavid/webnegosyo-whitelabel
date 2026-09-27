'use client'

/**
 * Thermal-paper preview for the Receipt Studio: a paper roll with torn edges,
 * drawn from the exact per-block segments the merchant app prints. Styled
 * lines are drawn the way the head prints them — bold, double height, double
 * size, aligned — so what the merchant sees while designing is what prints.
 *
 * Every block is a click target: clicking a line on the paper selects that
 * block in the editor. A block that prints nothing on the sample sale shows
 * as a faint placeholder, never on paper, so it can still be found.
 */

import { useEffect, useRef, type CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { parseReceiptMarkup, type ReceiptPreviewLine, type ReceiptRun } from '@/lib/receipt-markup'
import type { ReceiptSegment } from '@/lib/receipt-layout'
import { scrollIntoPane } from './scroll-into-pane'

const SAWTOOTH_SIZE = 9
/** A 41-module tracking code at 5 dots prints about 26mm — ~17 columns. */
const QR_COLUMNS = 17
/** The app rasters the logo at 320 of the head's dots — ~26 columns. */
const LOGO_COLUMNS = 26

/** A torn paper edge — triangles pointing into the paper. */
function TornEdge({ side }: { side: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: SAWTOOTH_SIZE,
        transform: side === 'top' ? undefined : 'rotate(180deg)',
        background:
          `linear-gradient(45deg, transparent 33.333%, #ffffff 33.333%, #ffffff 66.667%, transparent 66.667%),` +
          `linear-gradient(-45deg, transparent 33.333%, #ffffff 33.333%, #ffffff 66.667%, transparent 66.667%)`,
        backgroundSize: `${SAWTOOTH_SIZE * 2}px ${SAWTOOTH_SIZE * 2}px`,
        backgroundPosition: `0 ${SAWTOOTH_SIZE}px`,
      }}
    />
  )
}

function runStyle(run: ReceiptRun): CSSProperties | undefined {
  if (!run.bold && !run.tall && !run.wide) return undefined
  return {
    fontWeight: run.bold ? 700 : undefined,
    // Double width AND height: twice the font, so it also takes two columns.
    fontSize: run.wide ? '2em' : undefined,
    // Double height only: same columns, stretched upward.
    ...(run.tall && !run.wide
      ? { display: 'inline-block', transform: 'scaleY(2)', transformOrigin: 'center' }
      : {}),
  }
}

function PaperLine({ line }: { line: ReceiptPreviewLine }) {
  return (
    <div style={{ textAlign: line.align, lineHeight: line.isTall ? '2.7em' : '1.35em' }}>
      {line.runs.length === 0
        ? ' '
        : line.runs.map((run, index) => (
            <span key={index} style={runStyle(run)}>
              {run.text}
            </span>
          ))}
    </div>
  )
}

function PaperSegment({ segment }: { segment: ReceiptSegment }) {
  if (segment.type === 'image') {
    return (
      // Plain <img>: tenant logos live on external hosts not in the
      // next/image allowlist, and this is an editor-only preview.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={segment.url}
        alt="Store logo as printed"
        className="mx-auto my-1 max-h-[7em] object-contain grayscale contrast-125"
        style={{ maxWidth: `${LOGO_COLUMNS}ch` }}
      />
    )
  }
  if (segment.type === 'qr') {
    return (
      <div className="my-1 flex justify-center">
        <QRCodeSVG
          value={segment.data}
          size={128}
          level="M"
          style={{ width: `${QR_COLUMNS}ch`, height: `${QR_COLUMNS}ch` }}
        />
      </div>
    )
  }
  return (
    <>
      {parseReceiptMarkup(segment.text).map((line, index) => (
        <PaperLine key={index} line={line} />
      ))}
    </>
  )
}

export interface PreviewBlock {
  id: string
  label: string
  /** Shown in place of the block when it prints nothing on the sample. */
  emptyHint: string
  segments: ReceiptSegment[]
}

interface PaperPreviewProps {
  blocks: PreviewBlock[]
  columns: number
  selectedId: string | null
  onSelect: (id: string) => void
}

export function PaperPreview({ blocks, columns, selectedId, onSelect }: PaperPreviewProps) {
  const paperRef = useRef<HTMLDivElement>(null)

  // Keep the selected block in view when it was picked from the block list.
  useEffect(() => {
    if (!selectedId) return
    scrollIntoPane(paperRef.current?.querySelector<HTMLElement>(`[data-block-id="${selectedId}"]`))
  }, [selectedId])

  return (
    // The mono font is set here, not on the inner roll, so `ch` measures the
    // receipt's own characters and the paper is exactly `columns` wide.
    <div
      className="font-mono text-[13px] drop-shadow-xl"
      style={{ width: `calc(${columns}ch + 2.5rem)` }}
    >
      <TornEdge side="top" />
      <div ref={paperRef} className="bg-white px-5 py-5 text-[#111] [white-space:pre]">
        {blocks.map((block) => {
          const isSelected = block.id === selectedId
          const isEmpty = block.segments.length === 0
          return (
            <div
              key={block.id}
              data-block-id={block.id}
              role="button"
              tabIndex={0}
              aria-label={`Edit ${block.label}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(block.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(block.id)
                }
              }}
              className={`relative -mx-2 cursor-pointer rounded-[4px] px-2 outline-none transition-colors ${
                isSelected
                  ? 'bg-sky-50 ring-2 ring-sky-500'
                  : 'hover:bg-sky-50/60 hover:ring-1 hover:ring-sky-300 focus-visible:ring-2 focus-visible:ring-sky-400'
              }`}
            >
              {isSelected && (
                <span className="absolute left-full top-1/2 ml-4 hidden -translate-y-1/2 rounded-full bg-sky-500 px-2 py-0.5 font-sans text-[10.5px] font-bold text-white [white-space:nowrap] sm:block">
                  {block.label}
                </span>
              )}
              {isEmpty ? (
                <div className="my-0.5 rounded border border-dashed border-neutral-300 px-2 py-0.5 text-center font-sans text-[10.5px] italic text-neutral-400 [white-space:normal]">
                  {block.label} — {block.emptyHint}
                </div>
              ) : (
                block.segments.map((segment, index) => <PaperSegment key={index} segment={segment} />)
              )}
            </div>
          )
        })}
      </div>
      <TornEdge side="bottom" />
    </div>
  )
}
