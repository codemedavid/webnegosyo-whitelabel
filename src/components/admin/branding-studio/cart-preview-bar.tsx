'use client'

/** "Show" toggles under the Cart preview: sample dishes or the empty cart, drawer or page. */

interface CartPreviewBarProps {
    isEmpty: boolean
    onEmptyChange: (isEmpty: boolean) => void
    view: 'drawer' | 'page'
    onViewChange: (view: 'drawer' | 'page') => void
}

const chipClass = (isOn: boolean) =>
    `rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${
        isOn ? 'border-[#2A6FDB] bg-[#2A6FDB] text-white' : 'border-[#D8D2C6] bg-white text-[#5E574C]'
    }`

export function CartPreviewBar({ isEmpty, onEmptyChange, view, onViewChange }: CartPreviewBarProps) {
    return (
        <div className="mx-auto mt-3 flex items-center gap-1.5" role="group" aria-label="Show in preview">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">Show</span>
            {[false, true].map((option) => (
                <button key={String(option)} type="button" aria-pressed={isEmpty === option} onClick={() => onEmptyChange(option)} className={chipClass(isEmpty === option)}>
                    {option ? 'Empty cart' : 'With items'}
                </button>
            ))}
            <span aria-hidden="true" className="mx-1 text-[#D8D2C6]">|</span>
            {(['drawer', 'page'] as const).map((option) => (
                <button key={option} type="button" aria-pressed={view === option} onClick={() => onViewChange(option)} className={chipClass(view === option)}>
                    {option === 'drawer' ? 'Cart drawer' : 'Cart page'}
                </button>
            ))}
        </div>
    )
}
