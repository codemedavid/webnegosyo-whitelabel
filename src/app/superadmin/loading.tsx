import {
  DashboardKpiSkeleton,
  PlatformTrendSkeleton,
  FeatureAdoptionSkeleton,
  RecentRestaurantsSkeleton,
} from '@/components/superadmin/dashboard/skeletons'

export default function SuperAdminLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="h-7 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="mt-4 h-8 w-36 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>

      {/* Overview: KPIs + trend + adoption */}
      <DashboardKpiSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PlatformTrendSkeleton />
        </div>
        <FeatureAdoptionSkeleton />
      </div>

      {/* Directory: recent restaurants + side rail */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentRestaurantsSkeleton />
        </div>
        <div className="space-y-6">
          <div className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
          <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
        </div>
      </div>
    </div>
  )
}
