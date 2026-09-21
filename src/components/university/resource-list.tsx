import { Download, ExternalLink, FileText, Link2 } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import type { LessonResource } from '@/lib/university/blocks'

/** Documents and links attached to a lesson, each opening in a new tab. */
export function ResourceList({ resources }: { resources: LessonResource[] }) {
  if (resources.length === 0) return null
  return (
    <section>
      <h3 className="font-display text-lg font-bold" style={{ color: SMARTMENU.ink }}>
        Resources
      </h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {resources.map((resource, index) => {
          const isFile = resource.kind === 'file'
          const Icon = isFile ? FileText : Link2
          const Action = isFile ? Download : ExternalLink
          return (
            <li key={`${resource.url}-${index}`}>
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                download={isFile ? true : undefined}
                className="group flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 transition-colors hover:border-current"
                style={{ borderColor: `${SMARTMENU.ink}14`, color: SMARTMENU.ink }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: SMARTMENU.creamDeep }}>
                  <Icon className="h-4.5 w-4.5" style={{ color: SMARTMENU.red }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{resource.label}</span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: `${SMARTMENU.cocoa}B3` }}>
                    {isFile ? (resource.fileType ?? 'file') : 'link'}
                  </span>
                </span>
                <Action className="h-4 w-4 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
