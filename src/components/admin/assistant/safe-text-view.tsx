import { Fragment } from 'react'
import { parseSafeText, type InlineRun } from '@/lib/assistant/safe-text'

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((run, index) =>
        run.isBold ? (
          <strong key={index} className="font-semibold">
            {run.text}
          </strong>
        ) : (
          <Fragment key={index}>{run.text}</Fragment>
        ),
      )}
    </>
  )
}

/** The assistant's words, rendered as text nodes only (see safe-text.ts). */
export function SafeTextView({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[14px] leading-relaxed">
      {parseSafeText(text).map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <p key={index}>
              <Runs runs={block.runs} />
            </p>
          )
        }
        const List = block.type === 'bullets' ? 'ul' : 'ol'
        return (
          <List key={index} className={block.type === 'bullets' ? 'list-disc space-y-1 pl-5' : 'list-decimal space-y-1 pl-5'}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Runs runs={item} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
