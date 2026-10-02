import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-72" />
      </div>
      {[3, 4, 2].map((rows, group) => (
        <div key={group} className="space-y-2.5">
          <Skeleton className="h-4 w-28" />
          <div className="divide-y rounded-xl border">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-3.5 px-4 py-3.5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-64 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
