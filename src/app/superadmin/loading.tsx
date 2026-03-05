import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function SuperAdminLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-36 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-14 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
