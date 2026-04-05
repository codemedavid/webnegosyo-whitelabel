'use client'

import type {
  BlockColumn,
  BlockSection,
  BlockSelection,
  BlockWidget,
  Breakpoint,
  HeroBlockDesign,
} from '@/types/hero-block-designer'
import type { BlockDesignerAction } from '@/hooks/use-hero-block-designer'
import { GlobalSettings } from '@/components/admin/hero-block-designer/global-settings'
import { SectionSettingsPanel } from '@/components/admin/hero-block-designer/section-settings'
import { ColumnSettingsPanel } from '@/components/admin/hero-block-designer/column-settings'
import { WidgetSettingsPanel } from '@/components/admin/hero-block-designer/widget-settings'

// ---------------------------------------------------------------------------
// SettingsPanel — Router component for the right-side settings panel
// ---------------------------------------------------------------------------

interface SettingsPanelProps {
  design: HeroBlockDesign
  selection: BlockSelection | null
  breakpoint: Breakpoint
  selectedSection: BlockSection | null
  selectedColumn: BlockColumn | null
  selectedWidget: BlockWidget | null
  dispatch: React.Dispatch<BlockDesignerAction>
}

export function SettingsPanel({
  design,
  selection,
  breakpoint,
  selectedSection,
  selectedColumn,
  selectedWidget,
  dispatch,
}: SettingsPanelProps) {
  // Determine which sub-panel to render based on current selection
  let content: React.ReactNode

  if (
    selection?.type === 'widget' &&
    selectedWidget &&
    selectedSection &&
    selectedColumn
  ) {
    content = (
      <WidgetSettingsPanel
        widget={selectedWidget}
        breakpoint={breakpoint}
        sectionId={selection.sectionId}
        columnId={selection.columnId!}
        dispatch={dispatch}
      />
    )
  } else if (
    selection?.type === 'column' &&
    selectedColumn &&
    selectedSection
  ) {
    content = (
      <ColumnSettingsPanel
        column={selectedColumn}
        breakpoint={breakpoint}
        onUpdateSettings={(settings) =>
          dispatch({
            type: 'UPDATE_COLUMN_SETTINGS',
            sectionId: selection.sectionId,
            columnId: selection.columnId!,
            settings,
            breakpoint: breakpoint === 'desktop' ? undefined : breakpoint,
          })
        }
      />
    )
  } else if (selection?.type === 'section' && selectedSection) {
    content = (
      <SectionSettingsPanel
        section={selectedSection}
        breakpoint={breakpoint}
        onUpdateSettings={(settings) =>
          dispatch({
            type: 'UPDATE_SECTION_SETTINGS',
            sectionId: selection.sectionId,
            settings,
            breakpoint: breakpoint === 'desktop' ? undefined : breakpoint,
          })
        }
        onSetColumnLayout={(widths) =>
          dispatch({
            type: 'SET_COLUMN_LAYOUT',
            sectionId: selection.sectionId,
            widths,
          })
        }
        onRename={(label) =>
          dispatch({
            type: 'RENAME_SECTION',
            sectionId: selection.sectionId,
            label,
          })
        }
      />
    )
  } else {
    content = (
      <GlobalSettings
        globalStyles={design.globalStyles}
        onUpdate={(styles) =>
          dispatch({ type: 'UPDATE_GLOBAL_STYLES', styles })
        }
      />
    )
  }

  return (
    <div className="flex h-full w-72 flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900">
      {content}
    </div>
  )
}
