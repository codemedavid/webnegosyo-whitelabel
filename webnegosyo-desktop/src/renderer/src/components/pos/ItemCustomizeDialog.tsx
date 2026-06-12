import { useMemo, useState } from 'react'
import type { Addon, MenuItem, Variation, VariationOption } from '../../lib/menu-types'
import { computeUnitPrice } from '../../stores/cart-store'
import { formatPeso } from '../OrderCard'

interface ItemCustomizeDialogProps {
  item: MenuItem
  onClose: () => void
  onAdd: (line: {
    item: MenuItem
    selectedVariations: Record<string, VariationOption>
    selectedVariation?: Variation
    selectedAddons: Addon[]
    quantity: number
    specialInstructions?: string
  }) => void
}

function defaultVariationSelections(item: MenuItem): Record<string, VariationOption> {
  const selections: Record<string, VariationOption> = {}
  for (const type of item.variation_types ?? []) {
    const sorted = [...type.options].sort((a, b) => a.display_order - b.display_order)
    const preferred = sorted.find((o) => o.is_default) ?? (type.is_required ? sorted[0] : undefined)
    if (preferred) selections[type.id] = preferred
  }
  return selections
}

export function ItemCustomizeDialog({
  item,
  onClose,
  onAdd,
}: ItemCustomizeDialogProps): React.JSX.Element {
  const variationTypes = item.variation_types ?? []
  const legacyVariations = variationTypes.length === 0 ? (item.variations ?? []) : []
  const addons = item.addons ?? []

  const [selectedVariations, setSelectedVariations] = useState<Record<string, VariationOption>>(
    () => defaultVariationSelections(item)
  )
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>(
    () => legacyVariations.find((v) => v.is_default) ?? legacyVariations[0]
  )
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set())
  const [quantity, setQuantity] = useState(1)
  const [specialInstructions, setSpecialInstructions] = useState('')

  const selectedAddons = useMemo(
    () => addons.filter((a) => selectedAddonIds.has(a.id)),
    [addons, selectedAddonIds]
  )

  const unitPrice = computeUnitPrice(item, selectedVariations, selectedVariation, selectedAddons)

  const missingRequired = variationTypes.some((t) => t.is_required && !selectedVariations[t.id])

  const toggleAddon = (id: string): void => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdd = (): void => {
    if (missingRequired) return
    onAdd({
      item,
      selectedVariations,
      selectedVariation,
      selectedAddons,
      quantity,
      specialInstructions: specialInstructions.trim() || undefined,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pos-customize" onClick={(e) => e.stopPropagation()}>
        <h2>{item.name}</h2>
        {item.description && <p className="pos-customize-desc">{item.description}</p>}

        <div className="pos-customize-body">
          {variationTypes.map((type) => (
            <div className="pos-opt-group" key={type.id}>
              <div className="pos-opt-label">
                {type.name}
                {type.is_required && <span className="pos-req">required</span>}
              </div>
              <div className="pos-opt-list">
                {[...type.options]
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((opt) => {
                    const active = selectedVariations[type.id]?.id === opt.id
                    return (
                      <button
                        key={opt.id}
                        className={`pos-chip${active ? ' active' : ''}`}
                        onClick={() =>
                          setSelectedVariations((prev) => ({ ...prev, [type.id]: opt }))
                        }
                      >
                        {opt.name}
                        {opt.price_modifier !== 0 && (
                          <span className="pos-chip-price">
                            {opt.price_modifier > 0 ? '+' : ''}
                            {formatPeso(opt.price_modifier)}
                          </span>
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}

          {legacyVariations.length > 0 && (
            <div className="pos-opt-group">
              <div className="pos-opt-label">Variation</div>
              <div className="pos-opt-list">
                {legacyVariations.map((v) => {
                  const active = selectedVariation?.id === v.id
                  return (
                    <button
                      key={v.id}
                      className={`pos-chip${active ? ' active' : ''}`}
                      onClick={() => setSelectedVariation(v)}
                    >
                      {v.name}
                      {v.price_modifier !== 0 && (
                        <span className="pos-chip-price">
                          {v.price_modifier > 0 ? '+' : ''}
                          {formatPeso(v.price_modifier)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {addons.length > 0 && (
            <div className="pos-opt-group">
              <div className="pos-opt-label">Add-ons</div>
              <div className="pos-opt-list">
                {addons.map((a) => {
                  const active = selectedAddonIds.has(a.id)
                  return (
                    <button
                      key={a.id}
                      className={`pos-chip${active ? ' active' : ''}`}
                      onClick={() => toggleAddon(a.id)}
                    >
                      {a.name}
                      {a.price !== 0 && (
                        <span className="pos-chip-price">+{formatPeso(a.price)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="pos-opt-group">
            <div className="pos-opt-label">Notes</div>
            <input
              type="text"
              placeholder="Special instructions (optional)"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
            />
          </div>
        </div>

        <div className="pos-customize-foot">
          <div className="pos-qty">
            <button className="btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              −
            </button>
            <span>{quantity}</span>
            <button className="btn" onClick={() => setQuantity((q) => q + 1)}>
              +
            </button>
          </div>
          <button className="btn primary pos-add-btn" disabled={missingRequired} onClick={handleAdd}>
            Add · {formatPeso(unitPrice * quantity)}
          </button>
        </div>
      </div>
    </div>
  )
}
