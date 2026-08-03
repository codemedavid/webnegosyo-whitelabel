'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listVouchersAction, setVoucherActiveAction } from '@/app/actions/voucher-admin'
import type { Voucher } from '@/lib/vouchers/types'
import { VoucherForm } from './voucher-form'
import { VoucherCard } from './voucher-card'

interface VouchersManagementProps {
  tenantId: string
}

export function VouchersManagement({ tenantId }: VouchersManagementProps) {
  const [vouchers, setVouchers] = useState<readonly Voucher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editing, setEditing] = useState<Voucher | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    const result = await listVouchersAction(tenantId)
    if (!result.success) {
      toast.error(result.error ?? 'Could not load vouchers')
      setIsLoading(false)
      return
    }
    setVouchers(result.data ?? [])
    setIsLoading(false)
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  // Retired codes sink to the bottom: they are history, not choices.
  const ordered = useMemo(
    () => [...vouchers].sort((a, b) => Number(b.isActive) - Number(a.isActive)),
    [vouchers]
  )

  const handleToggleActive = async (voucher: Voucher) => {
    const result = await setVoucherActiveAction(tenantId, voucher.id, !voucher.isActive)
    if (!result.success) {
      toast.error(result.error ?? 'Could not update the voucher')
      return
    }
    toast.success(voucher.isActive ? `${voucher.code} retired` : `${voucher.code} is live`)
    await load()
  }

  const handleSaved = async () => {
    setEditing(null)
    setIsCreating(false)
    await load()
  }

  if (isCreating || editing) {
    return (
      <VoucherForm
        tenantId={tenantId}
        voucher={editing}
        onSaved={handleSaved}
        onCancel={() => {
          setEditing(null)
          setIsCreating(false)
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New voucher
        </Button>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <Ticket className="h-8 w-8 mx-auto text-gray-400" />
          <p className="mt-3 font-medium text-gray-900">No vouchers yet</p>
          <p className="mt-1 text-sm text-gray-600">
            Create a code and customers can enter it at checkout.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((voucher) => (
            <VoucherCard
              key={voucher.id}
              voucher={voucher}
              onEdit={() => setEditing(voucher)}
              onToggleActive={() => handleToggleActive(voucher)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
