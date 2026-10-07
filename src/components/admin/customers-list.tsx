'use client'

import { useMemo, useState } from 'react'
import { formatDistance } from 'date-fns'
import { Users, Search, ShoppingBag, ChevronDown, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import {
  computeCustomerInsights,
  CUSTOMER_STATUS_LABEL,
  type CustomerStatus,
} from '@/lib/customer-insights'
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

/** Columns in the table — the expanded detail row spans all of them. */
const COLUMN_COUNT = 8

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
        <Card className="gap-0 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Orders
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                    Last order
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                    Frequency
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                    Favourite
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Lifetime value
                  </th>
                  <th scope="col" className="w-10 px-2 py-3">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
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
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

interface CustomerRowProps {
  customer: Customer
  isExpanded: boolean
  onToggle: () => void
}

/** Badge tone per engagement status — green thrives, amber warns, grey has gone quiet. */
const STATUS_CLASS: Record<CustomerStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  at_risk: 'bg-amber-50 text-amber-800 border-amber-200',
  lapsed: 'bg-muted text-muted-foreground',
}

function CustomerRow({ customer, isExpanded, onToggle }: CustomerRowProps) {
  const label = displayLabel(customer)
  // Under a real name, show how to reach them; a nameless row is already labelled by contact.
  const contact = customer.name ? customer.phone_e164 || customer.email : null
  const lastOrder = customer.last_order_at
    ? formatDistance(new Date(customer.last_order_at), new Date(), { addSuffix: true })
    : null
  const insights = useMemo(() => computeCustomerInsights(customer), [customer])
  const detailId = `customer-detail-${customer.id}`

  return (
    <>
      {/* The whole row toggles. The button is the keyboard/screen-reader affordance;
          its click bubbles up to this single handler. */}
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer border-b transition-colors hover:bg-muted/50',
          isExpanded && 'bg-muted/30'
        )}
      >
        <td className="max-w-[16rem] px-4 py-3">
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={detailId}
            className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span data-testid="customer-name" className="block truncate font-medium">
              {label}
            </span>
            {contact && (
              <span className="block truncate text-xs text-muted-foreground">{contact}</span>
            )}
          </button>
        </td>

        <td className="hidden whitespace-nowrap px-4 py-3 sm:table-cell">
          <Badge variant="outline" className={cn('text-[10px]', STATUS_CLASS[insights.status])}>
            {CUSTOMER_STATUS_LABEL[insights.status]}
          </Badge>
        </td>

        <td
          data-testid={`customer-orders-${customer.id}`}
          className="whitespace-nowrap px-4 py-3 text-right tabular-nums"
        >
          {customer.order_count}
        </td>

        {/* Relative to "now", which can tick over between the server render and hydration. */}
        <td
          className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell"
          suppressHydrationWarning
        >
          {lastOrder ?? '—'}
        </td>

        <td
          data-testid={`customer-frequency-${customer.id}`}
          className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell"
        >
          {insights.frequencyLabel}
        </td>

        <td className="hidden max-w-[14rem] px-4 py-3 text-muted-foreground lg:table-cell">
          {insights.favoriteItem ? (
            <span
              data-testid={`customer-favorite-${customer.id}`}
              className="flex min-w-0 items-center gap-1"
            >
              <span className="truncate">{insights.favoriteItem.name}</span>
              <span className="shrink-0">×{insights.favoriteItem.quantity}</span>
            </span>
          ) : (
            '—'
          )}
        </td>

        <td
          data-testid={`customer-ltv-${customer.id}`}
          className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums"
        >
          {formatPrice(insights.lifetimeValue)}
        </td>

        <td className="px-2 py-3">
          <ChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isExpanded && 'rotate-180'
            )}
          />
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b bg-muted/20">
          <td id={detailId} data-testid={detailId} colSpan={COLUMN_COUNT} className="px-4 py-4">
            <CustomerDetail customer={customer} lastOrder={lastOrder} />
          </td>
        </tr>
      )}
    </>
  )
}

interface CustomerDetailProps {
  customer: Customer
  lastOrder: string | null
}

function CustomerDetail({ customer, lastOrder }: CustomerDetailProps) {
  const insights = useMemo(() => computeCustomerInsights(customer), [customer])

  return (
    <div className="grid gap-4 sm:grid-cols-3">
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
        <h4 className="mb-2 text-sm font-medium text-muted-foreground">Value & frequency</h4>
        <dl className="space-y-1 text-sm">
          {/* The Last order column is hidden below md, so the detail carries it there. */}
          {lastOrder && (
            <div className="flex justify-between gap-4 md:hidden">
              <dt className="text-muted-foreground">Last order</dt>
              <dd className="font-medium">{lastOrder}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Average order</dt>
            <dd className="font-medium">{formatPrice(Number(customer.average_order_value))}</dd>
          </div>
          {insights.ordersPerMonth > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Order frequency</dt>
              <dd className="font-medium">{insights.ordersPerMonth} / month</dd>
            </div>
          )}
          {insights.ordersPerMonth > 0 && (
            <div
              data-testid={`customer-projected-ltv-${customer.id}`}
              className="flex justify-between gap-4"
            >
              <dt className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Projected 12-mo value
              </dt>
              <dd className="font-medium">{formatPrice(insights.projectedLtv)}</dd>
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
  )
}
