import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-5 w-60 mt-2" />
      </div>
      {/* Restaurant Info Card */}
      <Skeleton className="h-48 w-full rounded-lg" />
      {/* Branding Card */}
      <Skeleton className="h-96 w-full rounded-lg" />
      {/* Integration Cards */}
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}
