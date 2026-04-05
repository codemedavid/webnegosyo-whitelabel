import { Card, CardContent } from '@/components/ui/card'

export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
              </div>
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          <div className="mt-4 flex gap-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <div className="h-8 w-96 animate-pulse rounded bg-muted" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </Card>
    </div>
  )
}
