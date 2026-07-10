'use client'

import { useMemo, useState } from 'react'
import { formatDistance } from 'date-fns'
import { Users, Search, ShoppingBag, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import type { Customer } from '@/types/database'

interface CustomersListProps {
  customers: Customer[]
  tenantSlug: string
}

type CustomerSort = 'recent' | 'top_spend' | 'frequent'

const SORT_OPTIONS: { value: CustomerSort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'top_spend', label: 'Top spenders' },
  { value: 'frequent', label: 'Most frequent' },
]

/** The best human-readable handle for a customer: name, then phone, then email. */
function displayLabel(customer: Customer): string {
  return customer.name || customer.phone_e164 || customer.email || 'Unknown customer'
}

/** Case-insensitive match of a query against a customer's name, phone, and email. */
function matchesQuery(customer: Customer, query: string): boolean {
  const haystack = [customer.name, customer.phone_e164, customer.email]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

function sortCustomers(customers: Customer[], sort: CustomerSort): Customer[] {
  const copy = [...customers]
  switch (sort) {
    case 'top_spend':
      return copy.sort((a, b) => b.total_spent - a.total_spent)
    case 'frequent':
      return copy.sort((a, b) => b.order_count - a.order_count)
    case 'recent':
    default:
      return copy.sort(
        (a, b) =>
          new Date(b.last_order_at ?? 0).getTime() - new Date(a.last_order_at ?? 0).getTime()
      )
  }
}

export function CustomersList({ customers }: CustomersListProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CustomerSort>('recent')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const visibleCustomers = useMemo(() => {
    const filtered = query.trim()
      ? customers.filter((customer) => matchesQuery(customer, query))
      : customers
    return sortCustomers(filtered, sort)
  }, [customers, query, sort])

  if (customers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No customers yet</h3>
          <p className="text-muted-foreground text-center">
            Customers are captured automatically from orders. As people order, your regulars will
            appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search customers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Search customers"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={sort === option.value ? 'default' : 'outline'}
              onClick={() => setSort(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <p className="text-sm text-muted-foreground">
        {visibleCustomers.length} {visibleCustomers.length === 1 ? 'customer' : 'customers'}
      </p>

      {/* No search results */}
      {visibleCustomers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No customers match “{query.trim()}”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleCustomers.map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              isExpanded={expandedId === customer.id}
              onToggle={() =>
                setExpandedId((current) => (current === customer.id ? null : customer.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface CustomerRowProps {
  customer: Customer
  isExpanded: boolean
  onToggle: () => void
}

function CustomerRow({ customer, isExpanded, onToggle }: CustomerRowProps) {
  const label = displayLabel(customer)
  const lastOrder = customer.last_order_at
    ? formatDistance(new Date(customer.last_order_at), new Date(), { addSuffix: true })
    : null

  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p data-testid="customer-name" className="truncate font-semibold">
            {label}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {customer.order_count} {customer.order_count === 1 ? 'order' : 'orders'}
            {lastOrder && <> · last {lastOrder}</>}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-semibold">{formatPrice(Number(customer.total_spent))}</p>
          <p className="text-xs text-muted-foreground">
            {formatPrice(Number(customer.average_order_value))} avg
          </p>
        </div>

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {isExpanded && (
        <CardContent data-testid={`customer-detail-${customer.id}`} className="border-t pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">Contact</h4>
              <dl className="space-y-1 text-sm">
                {customer.phone_e164 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium">{customer.phone_e164}</dd>
                  </div>
                )}
                {customer.email && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="truncate font-medium">{customer.email}</dd>
                  </div>
                )}
                {customer.channels_used.length > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Channels</dt>
                    <dd className="flex flex-wrap justify-end gap-1">
                      {customer.channels_used.map((channel) => (
                        <Badge key={channel} variant="secondary" className="text-xs">
                          {channel.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
                {customer.sms_consent && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">SMS updates</dt>
                    <dd className="font-medium text-green-700">Opted in</dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">Most ordered</h4>
              {customer.top_items.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShoppingBag className="h-4 w-4" /> No items recorded
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {customer.top_items.map((item) => (
                    <li key={item.name} className="flex justify-between gap-4">
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0 text-muted-foreground">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
