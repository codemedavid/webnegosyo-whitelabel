import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

const MAX_ORDER_HISTORY_PER_CUSTOMER = 25

type CustomerIdentifierType = 'phone' | 'email' | 'name'

interface CustomerIdentity {
  name: string
  phone: string
  email: string
}

export interface CustomerLookup extends CustomerIdentity {
  customerKey: string | null
  identifierType: CustomerIdentifierType | null
  identifierValue: string | null
}

export interface CustomerOrderSnapshot {
  localOrderRef: string
  orderId: string | null
  total: number
  orderTypeName: string | null
  paymentMethodName: string | null
  createdAt: string
}

export interface CustomerHistoryRecord extends CustomerIdentity {
  customerKey: string
  tenantId: string
  identifierType: CustomerIdentifierType
  identifierValue: string
  totalOrders: number
  totalSpent: number
  firstOrderAt: string
  lastOrderAt: string
  orders: CustomerOrderSnapshot[]
}

interface RegisterOrderParams {
  tenantId: string
  customerData: Record<string, string>
  orderId: string | null
  orderTypeName: string | null
  paymentMethodName: string | null
  total: number
}

interface CustomerHistoryStore {
  historyByKey: Record<string, CustomerHistoryRecord>
  registerOrder: (params: RegisterOrderParams) => CustomerHistoryRecord | null
  getCustomerHistory: (tenantId: string, customerData: Record<string, string>) => CustomerHistoryRecord | null
  getPastOrderCount: (tenantId: string, customerData: Record<string, string>) => number
}

function clean(value: string | undefined | null): string {
  return (value || '').trim()
}

function normalizeName(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ')
}

function normalizeEmail(value: string): string {
  return clean(value).toLowerCase()
}

function normalizePhone(value: string): string {
  return clean(value).replace(/\D+/g, '')
}

function pickFieldValue(
  customerData: Record<string, string>,
  exactKeys: string[],
  keyHints: string[]
): string {
  for (const key of exactKeys) {
    const value = clean(customerData[key])
    if (value) return value
  }

  const loweredHints = keyHints.map(h => h.toLowerCase())
  for (const [key, value] of Object.entries(customerData)) {
    const normalizedKey = key.toLowerCase()
    if (!loweredHints.some(hint => normalizedKey.includes(hint))) continue
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }

  return ''
}

function extractCustomerIdentity(customerData: Record<string, string>): CustomerIdentity {
  const phone = pickFieldValue(
    customerData,
    ['customer_phone', 'phone', 'mobile', 'contact_number', 'contact'],
    ['phone', 'mobile', 'contact']
  )
  const email = pickFieldValue(
    customerData,
    ['customer_email', 'email'],
    ['email']
  )
  const name = pickFieldValue(
    customerData,
    ['customer_name', 'name', 'full_name'],
    ['name']
  )

  return { name, phone, email }
}

export function resolveCustomerLookup(tenantId: string, customerData: Record<string, string>): CustomerLookup {
  const { name, phone, email } = extractCustomerIdentity(customerData)

  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone.length >= 7) {
    return {
      customerKey: `${tenantId}:phone:${normalizedPhone}`,
      identifierType: 'phone',
      identifierValue: normalizedPhone,
      name,
      phone,
      email,
    }
  }

  const normalizedEmail = normalizeEmail(email)
  if (normalizedEmail.includes('@')) {
    return {
      customerKey: `${tenantId}:email:${normalizedEmail}`,
      identifierType: 'email',
      identifierValue: normalizedEmail,
      name,
      phone,
      email,
    }
  }

  const normalizedName = normalizeName(name)
  if (normalizedName.length >= 2) {
    return {
      customerKey: `${tenantId}:name:${normalizedName}`,
      identifierType: 'name',
      identifierValue: normalizedName,
      name,
      phone,
      email,
    }
  }

  return {
    customerKey: null,
    identifierType: null,
    identifierValue: null,
    name,
    phone,
    email,
  }
}

export const useCustomerHistoryStore = create<CustomerHistoryStore>()(
  persist(
    (set, get) => ({
      historyByKey: {},

      registerOrder: ({ tenantId, customerData, orderId, orderTypeName, paymentMethodName, total }) => {
        const lookup = resolveCustomerLookup(tenantId, customerData)
        if (!lookup.customerKey || !lookup.identifierType || !lookup.identifierValue) return null

        const now = new Date().toISOString()
        const safeTotal = Number.isFinite(total) ? total : 0
        const existing = get().historyByKey[lookup.customerKey]

        const nextRecord: CustomerHistoryRecord = {
          customerKey: lookup.customerKey,
          tenantId,
          identifierType: lookup.identifierType,
          identifierValue: lookup.identifierValue,
          name: lookup.name || existing?.name || '',
          phone: lookup.phone || existing?.phone || '',
          email: lookup.email || existing?.email || '',
          totalOrders: (existing?.totalOrders || 0) + 1,
          totalSpent: (existing?.totalSpent || 0) + safeTotal,
          firstOrderAt: existing?.firstOrderAt || now,
          lastOrderAt: now,
          orders: [
            {
              localOrderRef: orderId || `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              orderId,
              total: safeTotal,
              orderTypeName,
              paymentMethodName,
              createdAt: now,
            },
            ...(existing?.orders || []),
          ].slice(0, MAX_ORDER_HISTORY_PER_CUSTOMER),
        }

        set(state => ({
          historyByKey: {
            ...state.historyByKey,
            [lookup.customerKey!]: nextRecord,
          },
        }))

        return nextRecord
      },

      getCustomerHistory: (tenantId, customerData) => {
        const lookup = resolveCustomerLookup(tenantId, customerData)
        if (!lookup.customerKey) return null
        return get().historyByKey[lookup.customerKey] || null
      },

      getPastOrderCount: (tenantId, customerData) => {
        const record = get().getCustomerHistory(tenantId, customerData)
        return record?.totalOrders || 0
      },
    }),
    {
      name: 'customer-history-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        historyByKey: state.historyByKey,
      }),
    }
  )
)

export const useCustomerHistoryHydrated = () => {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const unsub = useCustomerHistoryStore.persist.onFinishHydration(() => setHydrated(true))
    if (useCustomerHistoryStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [])

  return hydrated
}
