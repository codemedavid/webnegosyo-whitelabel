import { Card, CardContent } from '@/components/ui/card'

export default function TenantsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded bg-muted" />
      </div>

      <div className="h-10 w-full max-w-md animate-pulse rounded bg-muted" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                    <div className="mt-1 h-4 w-20 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-6 w-14 animate-pulse rounded-full bg-muted" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
