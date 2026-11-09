// `{store_address}`: where a customer sends their own rider. Server-safe.

interface StoreAddressFields {
  restaurant_address?: string | null
}

interface BranchAddressFields {
  address?: string | null
}

const clean = (value: string | null | undefined): string => (typeof value === 'string' ? value.trim() : '')

/** The order's branch address, else the store's pickup address, else blank (which drops the token). */
export function storeAddressToken(store: StoreAddressFields | null | undefined, branch: BranchAddressFields | null | undefined): string {
  return clean(branch?.address) || clean(store?.restaurant_address)
}
