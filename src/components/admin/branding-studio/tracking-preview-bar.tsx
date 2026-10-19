'use client'

/**
 * "Show" toggles for the sample order under the Order status / Loyalty card
 * preview: the order's status, the loyalty card's face, and extras such as the
 * pickup code or the ready alert. A setting being edited can switch the sample
 * by itself (see focusTrackingPreview); those choices show as on.
 */

import {
    LOYALTY_PREVIEW_VIEWS,
    TRACKING_PREVIEW_EXTRAS,
    TRACKING_PREVIEW_STATUSES,
    type TrackingPreviewExtra,
    type TrackingPreviewState,
} from '@/lib/branding-studio/tracking-preview'

interface TrackingPreviewBarProps {
    /** What the owner picked. */
    chosen: TrackingPreviewState
    /** What the preview shows (the pick, adjusted for the setting in focus). */
    shown: TrackingPreviewState
    onChange: (next: TrackingPreviewState) => void
    /** The Loyalty card screen lists the card's faces first. */
    isLoyaltyFirst: boolean
}

function Chip({ label, isOn, onClick }: { label: string; isOn: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={isOn}
            onClick={onClick}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
                isOn ? 'border-[#2A6FDB] bg-[#2A6FDB] text-white' : 'border-[#D8D2C6] bg-white text-[#5E574C] hover:border-[#1D1815]'
            }`}
        >
            {label}
        </button>
    )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div role="group" aria-label={title} className="flex flex-wrap items-center justify-center gap-1.5 max-md:flex-nowrap max-md:justify-start max-md:overflow-x-auto max-md:px-2">
            <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">{title}</span>
            {children}
        </div>
    )
}

export function TrackingPreviewBar({ chosen, shown, onChange, isLoyaltyFirst }: TrackingPreviewBarProps) {
    const toggleExtra = (extra: TrackingPreviewExtra) =>
        onChange({
            ...chosen,
            extras: chosen.extras.includes(extra) ? chosen.extras.filter((id) => id !== extra) : [...chosen.extras, extra],
        })

    const status = (
        <Row key="status" title="Order">
            {TRACKING_PREVIEW_STATUSES.map((option) => (
                <Chip key={option.id} label={option.label} isOn={shown.status === option.id} onClick={() => onChange({ ...chosen, status: option.id })} />
            ))}
        </Row>
    )
    const loyalty = (
        <Row key="loyalty" title="Card">
            {LOYALTY_PREVIEW_VIEWS.map((option) => (
                <Chip key={option.id} label={option.label} isOn={shown.loyalty === option.id} onClick={() => onChange({ ...chosen, loyalty: option.id })} />
            ))}
        </Row>
    )
    const extras = (
        <Row key="extras" title="Also">
            {TRACKING_PREVIEW_EXTRAS.map((option) => (
                <Chip key={option.id} label={option.label} isOn={shown.extras.includes(option.id)} onClick={() => toggleExtra(option.id)} />
            ))}
        </Row>
    )

    return (
        <div className="mx-auto mt-3 flex max-w-full flex-col gap-1.5 max-md:mt-2">
            {isLoyaltyFirst ? [loyalty, status, extras] : [status, loyalty, extras]}
        </div>
    )
}
