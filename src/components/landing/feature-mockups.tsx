import { SMARTMENU, type JourneyMock } from './landing-theme'

/**
 * Miniature UI previews of the three upsell plays, drawn in the product's own
 * skin. Purely illustrative, so the whole card is hidden from assistive tech —
 * the copy beside it carries the information.
 */
export function FeatureMock({ variant }: { variant: JourneyMock }) {
  return (
    <div
      aria-hidden
      className="w-full max-w-[300px] rounded-2xl bg-white p-4 shadow-2xl"
      style={{ color: SMARTMENU.ink, border: `1px solid ${SMARTMENU.ink}14` }}
    >
      {variant === 'pairing' && <PairingMock />}
      {variant === 'upgrade' && <UpgradeMock />}
      {variant === 'bundle' && <BundleMock />}
    </div>
  )
}

function MockButton({ children, filled = true }: { children: React.ReactNode; filled?: boolean }) {
  return (
    <span
      className="font-display inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-[11px] font-bold"
      style={
        filled
          ? { backgroundColor: SMARTMENU.red, color: '#FFF7EE' }
          : { border: `1px solid ${SMARTMENU.ink}26`, color: SMARTMENU.cocoa }
      }
    >
      {children}
    </span>
  )
}

function PairingMock() {
  return (
    <div>
      <p className="font-display text-sm font-bold">Perfect with Cheesy Burger</p>
      <p className="text-[11px]" style={{ color: SMARTMENU.cocoa }}>
        Kumpletuhin ang order mo
      </p>
      <div className="mt-3 space-y-2">
        {[
          { name: 'Regular Fries', price: '₱59' },
          { name: 'Iced Tea', price: '₱39' },
        ].map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between rounded-xl p-2.5"
            style={{ backgroundColor: SMARTMENU.cream }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="h-9 w-9 rounded-lg"
                style={{ backgroundColor: `${SMARTMENU.amber}55` }}
              />
              <div>
                <p className="text-xs font-semibold">{item.name}</p>
                <p className="text-[11px]" style={{ color: SMARTMENU.red }}>
                  {item.price}
                </p>
              </div>
            </div>
            <MockButton>Add</MockButton>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpgradeMock() {
  return (
    <div>
      <p className="font-display text-sm font-bold">Make it a meal?</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div
          className="rounded-xl p-3"
          style={{ border: `1.5px solid ${SMARTMENU.ink}1F` }}
        >
          <span className="block h-12 rounded-lg" style={{ backgroundColor: `${SMARTMENU.ink}12` }} />
          <p className="mt-2 text-xs font-semibold">Ala Carte</p>
          <p className="text-[11px]" style={{ color: SMARTMENU.cocoa }}>
            ₱149
          </p>
        </div>
        <div
          className="relative rounded-xl p-3"
          style={{ border: `2px solid ${SMARTMENU.green}`, backgroundColor: `${SMARTMENU.green}0D` }}
        >
          <span
            className="font-display absolute -top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
            style={{ backgroundColor: SMARTMENU.green }}
          >
            +₱89
          </span>
          <span className="block h-12 rounded-lg" style={{ backgroundColor: `${SMARTMENU.amber}55` }} />
          <p className="mt-2 text-xs font-semibold">Meal</p>
          <p className="text-[11px]" style={{ color: SMARTMENU.green }}>
            May fries at drink na
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <MockButton>Ituloy</MockButton>
      </div>
    </div>
  )
}

function BundleMock() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold">Barkada Bundle</p>
        <span
          className="font-display rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
          style={{ backgroundColor: SMARTMENU.green }}
        >
          Save ₱120
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[SMARTMENU.amber, SMARTMENU.red, SMARTMENU.green, SMARTMENU.amber].map((tint, i) => (
          <span key={i} className="h-10 rounded-lg" style={{ backgroundColor: `${tint}40` }} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] line-through" style={{ color: SMARTMENU.cocoa }}>
            ₱719
          </p>
          <p className="text-sm font-bold" style={{ color: SMARTMENU.red }}>
            ₱599
          </p>
        </div>
        <MockButton>Add bundle</MockButton>
      </div>
    </div>
  )
}
