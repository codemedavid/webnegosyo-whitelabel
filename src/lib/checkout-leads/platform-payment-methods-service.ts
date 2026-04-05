import { createAdminClient } from '@/lib/supabase/admin'
import type { PlatformPaymentMethod } from '@/types/database'

export async function getActivePlatformPaymentMethods(): Promise<PlatformPaymentMethod[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('platform_payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('Failed to fetch platform payment methods:', error)
    return []
  }
  return (data ?? []) as PlatformPaymentMethod[]
}

export async function getAllPlatformPaymentMethods(): Promise<PlatformPaymentMethod[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('platform_payment_methods')
    .select('*')
    .order('order_index', { ascending: true })

  if (error) {
    console.error('Failed to fetch platform payment methods:', error)
    return []
  }
  return (data ?? []) as PlatformPaymentMethod[]
}

export async function createPlatformPaymentMethod(input: {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details?: string
  qr_code_url?: string
}): Promise<{ data: PlatformPaymentMethod | null; error: string | null }> {
  const supabase = createAdminClient()

  // Get next order_index
  const { data: last } = await supabase
    .from('platform_payment_methods')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .single()

  const nextIndex = (last?.order_index ?? -1) + 1

  const { data, error } = await supabase
    .from('platform_payment_methods')
    .insert({
      name: input.name,
      type: input.type,
      details: input.details ?? null,
      qr_code_url: input.qr_code_url ?? null,
      order_index: nextIndex,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as PlatformPaymentMethod, error: null }
}

export async function updatePlatformPaymentMethod(
  id: string,
  input: {
    name?: string
    type?: 'qr_code' | 'bank_transfer' | 'other'
    details?: string
    qr_code_url?: string | null
    is_active?: boolean
  }
): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('platform_payment_methods')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function deletePlatformPaymentMethod(id: string): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('platform_payment_methods')
    .delete()
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function reorderPlatformPaymentMethods(
  orderedIds: string[]
): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('platform_payment_methods')
      .update({ order_index: index, updated_at: new Date().toISOString() })
      .eq('id', id)
  )

  const results = await Promise.all(updates)
  const firstError = results.find((r) => r.error)
  return { error: firstError?.error?.message ?? null }
}
