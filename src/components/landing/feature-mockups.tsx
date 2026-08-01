import { CheckMark } from './court'
import { COURT, type JourneyMock } from './landing-theme'

/* The storefront is a light surface, so these depict it honestly: a phone in
   the customer's hand, showing the screen the upsell actually appears on. */

const SCREEN = '#FFFFFF'
const SCREEN_SOFT = '#F4F2EE'
const SCREEN_LINE = '#E3DFD8'
const SCREEN_INK = '#171512'
const SCREEN_MUTED = '#6E6960'
const ACCENT = '#E5002B'

/* ── Authored food marks. Flat two-tone vectors drawn for this page in one
      style, standing in for the merchant's own photography. ───────────────── */

type FoodMark = 'burger' | 'fries' | 'drink' | 'meal' | 'chicken' | 'rice' | 'cake'

function Food({ mark, className = '' }: { mark: FoodMark; className?: string }) {
  const shapes: Record<FoodMark, React.ReactNode> = {
    burger: (
      <>
        <path d="M8 20c0-6 5-10 12-10s12 4 12 10z" fill="#D9973F" />
        <rect x="7" y="20" width="26" height="4" rx="1.5" fill="#7BA83F" />
        <rect x="7" y="23.5" width="26" height="5" rx="1.5" fill="#8C4A25" />
        <path d="M8 28h24c0 4-4 6-12 6s-12-2-12-6z" fill="#C9862F" />
      </>
    ),
    fries: (
      <>
        <path d="M13 12l2 12M18 9l1 15M23 11l0 13M27 14l-2 10" stroke="#E9B23C" strokeWidth="4" strokeLinecap="round" />
        <path d="M10 20h20l-2.5 14h-15z" fill={ACCENT} />
        <rect x="11" y="23" width="18" height="4" fill="#FFFFFF" opacity="0.85" />
      </>
    ),
    drink: (
      <>
        <path d="M12 12h16l-2 22H14z" fill="#C8623A" />
        <path d="M12 12h16l-.6 6H12.6z" fill="#EFE7DA" />
        <path d="M24 8l-3 5" stroke="#F4F2EE" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="26" cy="7" r="2" fill="#F4F2EE" />
      </>
    ),
    meal: (
      <>
        <path d="M4 18c0-5 4-8 9-8s9 3 9 8z" fill="#D9973F" />
        <rect x="3" y="18" width="20" height="3.5" rx="1.2" fill="#7BA83F" />
        <path d="M4 21.5h18c0 3.5-3 5.5-9 5.5s-9-2-9-5.5z" fill="#C9862F" />
        <path d="M28 14l1 9M32 12l.5 11M36 15l-.5 8" stroke="#E9B23C" strokeWidth="3" strokeLinecap="round" />
        <path d="M26 20h13l-1.6 12H27.6z" fill={ACCENT} />
      </>
    ),
    chicken: (
      <>
        <path d="M14 10c7-3 14 2 13 9-1 6-7 9-12 7-6-2-7-13-1-16z" fill="#B8703A" />
        <path d="M14 26l-6 8" stroke="#EFE7DA" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
    rice: (
      <>
        <path d="M8 22c0-7 5-12 12-12s12 5 12 12z" fill="#F2EFE7" />
        <rect x="6" y="22" width="28" height="4" rx="2" fill="#CFC9BC" />
        <path d="M9 26h22l-2 7H11z" fill="#E4DFD3" />
      </>
    ),
    cake: (
      <>
        <path d="M9 20h22v13H9z" fill="#E8C7A8" />
        <path d="M9 20c3-4 7-4 11-1s8 3 11-1v5H9z" fill="#B0604A" />
        <rect x="19" y="10" width="2" height="6" fill="#F4F2EE" />
      </>
    ),
  }

  return (
    <span
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundColor: SCREEN_SOFT }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="h-[78%] w-[78%]" focusable="false">
        {shapes[mark]}
      </svg>
    </span>
  )
}

/** The phone the customer is actually holding, held courtside. */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    // Decorative: the adjacent copy already states everything the screen shows.
    <div className="w-full max-w-[310px]" aria-hidden>
      <div
        className="relative overflow-hidden rounded-[2.1rem] p-2.5"
        style={{
          backgroundColor: COURT.steel,
          border: '1px solid rgba(237,232,218,0.16)',
          boxShadow: '0 30px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div className="overflow-hidden rounded-[1.55rem]" style={{ backgroundColor: SCREEN }}>
          <div
            className="flex items-center justify-center py-2"
            style={{ borderBottom: `1px solid ${SCREEN_LINE}` }}
          >
            <span className="h-1 w-14 rounded-full" style={{ backgroundColor: SCREEN_LINE }} />
          </div>
          <div className="p-3.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 p-2.5"
      style={{ border: `1px solid ${SCREEN_LINE}`, borderRadius: 12 }}
    >
      {children}
    </div>
  )
}

function AddButton() {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: ACCENT }}
      aria-hidden
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
        <path d="M12 5v14M5 12h14" strokeLinecap="square" />
      </svg>
    </span>
  )
}

function PairingMock() {
  const suggestions = [
    { mark: 'fries' as const, name: 'Regular Fries', price: '₱59' },
    { mark: 'drink' as const, name: 'Iced Tea 16oz', price: '₱45' },
  ]

  return (
    <Phone>
      <p className="text-[13.5px] font-bold" style={{ color: SCREEN_INK }}>
        Perfect with Cheeseburger
      </p>
      <p className="mt-0.5 text-[11.5px]" style={{ color: SCREEN_MUTED }}>
        Complete your order
      </p>
      <div className="mt-3 space-y-2">
        {suggestions.map((item) => (
          <Row key={item.name}>
            <Food mark={item.mark} className="h-10 w-10 shrink-0 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold" style={{ color: SCREEN_INK }}>
                {item.name}
              </span>
              <span className="block text-[11.5px]" style={{ color: SCREEN_MUTED }}>
                {item.price}
              </span>
            </span>
            <AddButton />
          </Row>
        ))}
      </div>
    </Phone>
  )
}

function UpgradeMock() {
  return (
    <Phone>
      <p className="text-[13.5px] font-bold" style={{ color: SCREEN_INK }}>
        Make it a meal?
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl p-2.5" style={{ border: `1px solid ${SCREEN_LINE}` }}>
          <Food mark="burger" className="h-14 w-full rounded-lg" />
          <p className="mt-2 text-[11.5px] font-semibold" style={{ color: SCREEN_INK }}>
            Ala Carte
          </p>
          <p className="text-[11.5px]" style={{ color: SCREEN_MUTED }}>
            ₱149
          </p>
        </div>
        <div className="relative rounded-xl p-2.5" style={{ border: `2px solid ${ACCENT}` }}>
          <span
            className="absolute -top-2.5 right-2 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: ACCENT }}
          >
            +₱89
          </span>
          <Food mark="meal" className="h-14 w-full rounded-lg" />
          <p
            className="mt-2 flex items-center gap-1 text-[11.5px] font-semibold"
            style={{ color: SCREEN_INK }}
          >
            <CheckMark size={11} className="shrink-0" />
            Meal
          </p>
          <p className="text-[11.5px]" style={{ color: SCREEN_MUTED }}>
            ₱238
          </p>
        </div>
      </div>
      <div
        className="mt-3 py-2.5 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] text-white"
        style={{ backgroundColor: ACCENT, borderRadius: 10 }}
      >
        Add to cart — ₱238
      </div>
    </Phone>
  )
}

function BundleMock() {
  return (
    <Phone>
      <div className="relative rounded-xl p-3" style={{ border: `1px solid ${SCREEN_LINE}` }}>
        <span
          className="absolute right-2.5 top-2.5 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: '#0F8A3E', color: '#FFFFFF' }}
        >
          Save ₱120
        </span>
        <p className="pr-[4.5rem] text-[13.5px] font-bold" style={{ color: SCREEN_INK }}>
          Barkada Bundle
        </p>
        <p className="mt-0.5 text-[11.5px]" style={{ color: SCREEN_MUTED }}>
          4 items · para sa 3–4 tao
        </p>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {(['chicken', 'rice', 'drink', 'cake'] as const).map((mark) => (
            <Food key={mark} mark={mark} className="h-11 w-full rounded-lg" />
          ))}
        </div>
        <div className="mt-3.5 flex items-center justify-between">
          <span className="flex items-baseline gap-2">
            <span className="text-base font-bold" style={{ color: SCREEN_INK }}>
              ₱699
            </span>
            <span className="text-[11.5px] line-through" style={{ color: SCREEN_MUTED }}>
              ₱819
            </span>
          </span>
          <span
            className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: ACCENT, borderRadius: 8 }}
          >
            Add bundle
          </span>
        </div>
      </div>
    </Phone>
  )
}

const MOCKS: Record<JourneyMock, () => React.JSX.Element> = {
  pairing: PairingMock,
  upgrade: UpgradeMock,
  bundle: BundleMock,
}

export function FeatureMock({ variant }: { variant: JourneyMock }) {
  const Mock = MOCKS[variant]
  return <Mock />
}
