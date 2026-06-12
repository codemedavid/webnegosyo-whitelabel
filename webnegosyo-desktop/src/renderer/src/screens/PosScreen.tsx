import { useEffect, useMemo, useState } from 'react'
import { fetchCategories, fetchMenuItems } from '../lib/supabase-queries'
import type { Category, MenuItem } from '../lib/menu-types'
import { useAuthStore } from '../stores/auth-store'
import { useCartStore } from '../stores/cart-store'
import { ItemCustomizeDialog } from '../components/pos/ItemCustomizeDialog'
import { CheckoutDialog } from '../components/pos/CheckoutDialog'
import { formatPeso } from '../components/OrderCard'

function itemNeedsCustomization(item: MenuItem): boolean {
  return (
    (item.variation_types?.length ?? 0) > 0 ||
    (item.variations?.length ?? 0) > 0 ||
    (item.addons?.length ?? 0) > 0
  )
}

interface PosScreenProps {
  onToast: (message: string, isError?: boolean) => void
}

export function PosScreen({ onToast }: PosScreenProps): React.JSX.Element {
  const { tenantId } = useAuthStore()
  const { lines, addLine, setQuantity, removeLine, clear, total, itemCount } = useCartStore()

  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [customizing, setCustomizing] = useState<MenuItem | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    Promise.all([fetchCategories(tenantId), fetchMenuItems(tenantId)])
      .then(([cats, menu]) => {
        setCategories(cats)
        setItems(menu)
      })
      .catch((err) => onToast(err instanceof Error ? err.message : 'Failed to load menu', true))
      .finally(() => setLoading(false))
  }, [tenantId, onToast])

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesCategory = activeCategoryId === 'all' || item.category_id === activeCategoryId
      const matchesSearch = !term || item.name.toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [items, activeCategoryId, search])

  const handleItemClick = (item: MenuItem): void => {
    if (itemNeedsCustomization(item)) {
      setCustomizing(item)
    } else {
      addLine({
        item,
        selectedVariations: {},
        selectedVariation: undefined,
        selectedAddons: [],
        quantity: 1,
      })
    }
  }

  const cartTotal = total()
  const cartCount = itemCount()

  return (
    <div className="pos">
      <div className="pos-menu">
        <div className="pos-toolbar">
          <input
            className="pos-search"
            type="text"
            placeholder="Search menu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="pos-cats">
          <button
            className={`pos-cat${activeCategoryId === 'all' ? ' active' : ''}`}
            onClick={() => setActiveCategoryId('all')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`pos-cat${activeCategoryId === cat.id ? ' active' : ''}`}
              onClick={() => setActiveCategoryId(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="pos-grid">
          {loading && <span className="live-label">Loading menu…</span>}
          {!loading && visibleItems.length === 0 && (
            <span className="live-label">No items found</span>
          )}
          {visibleItems.map((item) => {
            const price = item.discounted_price ?? item.price
            return (
              <button key={item.id} className="pos-tile" onClick={() => handleItemClick(item)}>
                {item.image_url && (
                  <div
                    className="pos-tile-img"
                    style={{ backgroundImage: `url(${item.image_url})` }}
                  />
                )}
                <div className="pos-tile-name">{item.name}</div>
                <div className="pos-tile-price">{formatPeso(price)}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="pos-cart">
        <div className="pos-cart-head">
          <span>Current Sale</span>
          {lines.length > 0 && (
            <button className="btn ghost" onClick={clear}>
              Clear
            </button>
          )}
        </div>

        <div className="pos-cart-body">
          {lines.length === 0 && <span className="live-label">No items yet. Tap a product.</span>}
          {lines.map((line) => (
            <div className="pos-cart-line" key={line.lineId}>
              <div className="pos-cart-line-top">
                <span className="pos-cart-line-name">{line.item.name}</span>
                <span>{formatPeso(line.subtotal)}</span>
              </div>
              {Object.values(line.selectedVariations).map((opt) => (
                <div className="pos-cart-line-sub" key={opt.id}>
                  {opt.name}
                </div>
              ))}
              {line.selectedVariation && (
                <div className="pos-cart-line-sub">{line.selectedVariation.name}</div>
              )}
              {line.selectedAddons.map((a) => (
                <div className="pos-cart-line-sub" key={a.id}>
                  + {a.name}
                </div>
              ))}
              {line.specialInstructions && (
                <div className="pos-cart-line-sub">“{line.specialInstructions}”</div>
              )}
              <div className="pos-cart-line-controls">
                <div className="pos-qty">
                  <button className="btn" onClick={() => setQuantity(line.lineId, line.quantity - 1)}>
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button className="btn" onClick={() => setQuantity(line.lineId, line.quantity + 1)}>
                    +
                  </button>
                </div>
                <button className="btn ghost" onClick={() => removeLine(line.lineId)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pos-cart-foot">
          <div className="total-row">
            <span>Total</span>
            <span>{formatPeso(cartTotal)}</span>
          </div>
          <button
            className="btn primary pos-charge"
            disabled={lines.length === 0}
            onClick={() => setCheckingOut(true)}
          >
            Charge · {cartCount} item{cartCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      {customizing && (
        <ItemCustomizeDialog
          item={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={(line) => {
            addLine(line)
            setCustomizing(null)
          }}
        />
      )}

      {checkingOut && (
        <CheckoutDialog onClose={() => setCheckingOut(false)} onToast={onToast} />
      )}
    </div>
  )
}
