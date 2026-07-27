'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Table, proportional, pixel } from '@astryxdesign/core/Table'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import {
  EMPTY_UNIT_DRAFT,
  buildUnitInput,
  unitToDraft,
  type UnitDraft,
} from '@/lib/inventory/inventory-form'
import {
  createInventoryUnitAction,
  updateInventoryUnitAction,
  deleteInventoryUnitAction,
} from '@/app/actions/inventory'
import type { InventoryUnitRow, InventoryUnitDimension } from '@/types/database'

/** Astryx's Table constrains its rows to `Record<string, unknown>`. */
type UnitRow = InventoryUnitRow & Record<string, unknown>

const DIMENSIONS: InventoryUnitDimension[] = ['weight', 'volume', 'count']

interface UnitsTabProps {
  tenantId: string
  tenantSlug: string
  units: InventoryUnitRow[]
  onChange: (next: InventoryUnitRow[]) => void
}

/** Units of measure — the conversion table every recipe cost depends on. */
export function UnitsTab({ tenantId, tenantSlug, units, onChange }: UnitsTabProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_UNIT_DRAFT)
  const [isSaving, setIsSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_UNIT_DRAFT)
    setIsOpen(true)
  }

  const openEdit = (unit: InventoryUnitRow) => {
    setEditingId(unit.id)
    setDraft(unitToDraft(unit))
    setIsOpen(true)
  }

  const handleSave = async () => {
    let input
    try {
      input = buildUnitInput(draft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setIsSaving(true)
    try {
      const result = editingId
        ? await updateInventoryUnitAction(editingId, tenantId, tenantSlug, input)
        : await createInventoryUnitAction(tenantId, tenantSlug, input)

      if (!result.success) {
        toast.error(result.error ?? 'Failed to save unit')
        return
      }

      const saved = result.data
      onChange(editingId ? units.map((u) => (u.id === editingId ? saved : u)) : [...units, saved])
      toast.success(editingId ? 'Unit updated' : 'Unit added')
      setIsOpen(false)
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (unit: InventoryUnitRow) => {
    if (!confirm(`Delete "${unit.name}"? Ingredients using it must be reassigned.`)) return
    const result = await deleteInventoryUnitAction(unit.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete unit')
      return
    }
    onChange(units.filter((u) => u.id !== unit.id))
    toast.success('Unit deleted')
    router.refresh()
  }

  const columns = [
    {
      key: 'name',
      header: 'Unit',
      width: proportional(2),
      renderCell: (unit: UnitRow) => (
        <HStack gap={1.5} vAlign="center">
          <Text type="body" weight="semibold">{`${unit.name} (${unit.abbreviation})`}</Text>
          {unit.is_base && <Badge variant="info" label="Base" />}
        </HStack>
      ),
    },
    {
      key: 'dimension',
      header: 'Measures',
      width: proportional(1),
      renderCell: (unit: UnitRow) => <Badge variant="neutral" label={unit.dimension} />,
    },
    {
      key: 'to_base_factor',
      header: 'Conversion',
      width: proportional(1),
      renderCell: (unit: UnitRow) => (
        <Text type="body" color="secondary">
          {`1 ${unit.abbreviation} = ${unit.to_base_factor} base`}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: pixel(120),
      align: 'end' as const,
      renderCell: (unit: UnitRow) => (
        <HStack gap={1} justify="end">
          <Button
            label={`Edit ${unit.name}`}
            isIconOnly
            size="sm"
            variant="ghost"
            onClick={() => openEdit(unit)}
            icon={<Pencil size={16} />}
          />
          <Button
            label={`Delete ${unit.name}`}
            isIconOnly
            size="sm"
            variant="ghost"
            onClick={() => handleDelete(unit)}
            icon={<Trash2 size={16} />}
          />
        </HStack>
      ),
    },
  ]

  return (
    <VStack gap={4}>
      <HStack justify="end">
        <Button label="New Unit" variant="primary" onClick={openCreate} icon={<Plus size={16} />} />
      </HStack>

      {units.length === 0 ? (
        <Banner
          status="info"
          title="No units yet"
          description="Units of measure (grams, ml, pieces) let recipes convert ingredient quantities to cost."
        />
      ) : (
        <Table
          data={units as UnitRow[]}
          columns={columns}
          idKey="id"
          density="balanced"
          dividers="rows"
          hasHover
        />
      )}

      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} width={520} purpose="form">
        <DialogHeader
          title={editingId ? 'Edit Unit' : 'New Unit'}
          subtitle="How this unit converts to its base"
          onOpenChange={setIsOpen}
        />

        <VStack gap={3} padding={4}>
          <HStack gap={3}>
            <TextInput
              label="Name"
              placeholder="e.g., Gram"
              value={draft.name}
              onChange={(value) => setDraft((d) => ({ ...d, name: value }))}
              isRequired
            />
            <TextInput
              label="Abbreviation"
              placeholder="e.g., g"
              value={draft.abbreviation}
              onChange={(value) => setDraft((d) => ({ ...d, abbreviation: value }))}
              isRequired
            />
          </HStack>

          <HStack gap={3}>
            <Selector
              label="Dimension"
              value={draft.dimension}
              onChange={(value) =>
                setDraft((d) => ({ ...d, dimension: value as InventoryUnitDimension }))
              }
              options={DIMENSIONS.map((dimension) => ({ value: dimension, label: dimension }))}
            />
            <NumberInput
              label="Conversion to base"
              value={draft.to_base_factor === '' ? null : Number(draft.to_base_factor)}
              onChange={(value) => setDraft((d) => ({ ...d, to_base_factor: String(value) }))}
              min={0}
              placeholder="1"
            />
          </HStack>

          <CheckboxInput
            label="Base unit for its dimension"
            value={draft.is_base}
            onChange={(checked) => setDraft((d) => ({ ...d, is_base: checked }))}
          />

          <HStack gap={2} justify="end">
            <Button
              label="Cancel"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              isDisabled={isSaving}
            />
            <Button
              label={editingId ? 'Save Changes' : 'Add Unit'}
              variant="primary"
              onClick={handleSave}
              isLoading={isSaving}
            />
          </HStack>
        </VStack>
      </Dialog>
    </VStack>
  )
}
