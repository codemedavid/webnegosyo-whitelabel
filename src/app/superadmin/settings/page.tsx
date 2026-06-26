import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  ShieldCheck,
  KeyRound,
  Tag,
} from 'lucide-react'
import { ChangePasswordForm } from '@/components/superadmin/change-password-form'
import { TagPresetsManager } from '@/components/superadmin/tag-presets'
import { PageHeader, Panel, SectionHeader } from '@/components/superadmin/ui/primitives'

interface EnvCheck {
  label: string
  envVar: string
  required: boolean
}

const envChecks: EnvCheck[] = [
  { label: 'Supabase URL', envVar: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
  { label: 'Supabase Anon Key', envVar: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
  { label: 'Supabase Service Role Key', envVar: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
  { label: 'Platform Root Domain', envVar: 'PLATFORM_ROOT_DOMAIN', required: true },
  { label: 'ImageKit URL Endpoint', envVar: 'NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT', required: true },
  { label: 'ImageKit Public Key', envVar: 'NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY', required: true },
  { label: 'ImageKit Private Key', envVar: 'IMAGEKIT_PRIVATE_KEY', required: true },
  { label: 'Mapbox Access Token', envVar: 'NEXT_PUBLIC_MAPBOX_TOKEN', required: false },
  { label: 'OpenRouter API Key (AI Menu)', envVar: 'OPENROUTER_API_KEY', required: false },
  { label: 'Sentry DSN', envVar: 'NEXT_PUBLIC_SENTRY_DSN', required: false },
]

const sections = [
  { id: 'security', label: 'Account & Security', icon: KeyRound },
  { id: 'taxonomy', label: 'Tag Presets', icon: Tag },
  { id: 'system', label: 'System Status', icon: Server },
]

function StatTile({
  label,
  value,
  tint,
}: {
  label: string
  value: number
  tint: 'emerald' | 'red' | 'amber'
}) {
  const tintClass =
    tint === 'emerald'
      ? 'text-emerald-400'
      : tint === 'red'
        ? 'text-red-400'
        : 'text-amber-400'
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className={`text-2xl font-bold tracking-tight ${value > 0 ? tintClass : 'text-white'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-white/45">
        {label}
      </p>
    </div>
  )
}

function SystemStatus() {
  const results = envChecks.map((check) => {
    const isSet = !!process.env[check.envVar]
    return { ...check, isSet }
  })

  const configured = results.filter((r) => r.isSet).length
  const requiredMissing = results.filter((r) => r.required && !r.isSet).length
  const optionalMissing = results.filter((r) => !r.required && !r.isSet).length

  return (
    <div id="system" className="scroll-mt-6 space-y-6">
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-white/[0.06] p-6">
          <SectionHeader
            icon={Server}
            title="Environment Configuration"
            subtitle="Status of required and optional environment variables"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-white/45">
                Environment
              </span>
            }
          />
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Configured" value={configured} tint="emerald" />
            <StatTile label="Required missing" value={requiredMissing} tint="red" />
            <StatTile label="Optional missing" value={optionalMissing} tint="amber" />
          </div>

          {requiredMissing > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-medium text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {requiredMissing} required variable{requiredMissing > 1 ? 's' : ''} missing — some
                platform features will not work until these are set.
              </span>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {results.map((check) => (
              <div
                key={check.envVar}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {check.isSet ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : check.required ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0">
                    <span className="block text-sm text-white">{check.label}</span>
                    <code className="block truncate text-[11px] text-white/40">{check.envVar}</code>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!check.required && (
                    <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/40 sm:inline">
                      Optional
                    </span>
                  )}
                  {check.isSet ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                      Set
                    </span>
                  ) : check.required ? (
                    <span className="inline-flex items-center rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                      Missing
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-white/45">
                      Not set
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {optionalMissing > 0 && (
            <p className="mt-3 text-xs text-white/45">
              {optionalMissing} optional variable{optionalMissing > 1 ? 's' : ''} not configured.
              Features depending on them will be unavailable.
            </p>
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="border-b border-white/[0.06] p-6">
          <SectionHeader
            icon={ShieldCheck}
            title="System Information"
            subtitle="Runtime environment details"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-white/45">
                Runtime
              </span>
            }
          />
        </div>

        <div className="grid gap-2 p-6 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/45">
              Node Environment
            </p>
            <p className="mt-2 text-sm font-medium text-white">{process.env.NODE_ENV}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/45">
              Platform Domain
            </p>
            <code className="mt-2 block truncate text-sm text-white/70">
              {process.env.PLATFORM_ROOT_DOMAIN || 'Not set'}
            </code>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/45">
              Vercel Environment
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {process.env.VERCEL_ENV || 'local'}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <Panel className="p-6">
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-64 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
      <div className="mt-6 space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-white/[0.06]" />
        ))}
      </div>
    </Panel>
  )
}

export default function SuperAdminSettingsPage() {
  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Settings' },
        ]}
      />

      <PageHeader
        eyebrow="Platform"
        title="Settings"
        subtitle="Manage your account, taxonomy, and platform configuration"
      />

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* In-page section navigation */}
        <nav
          aria-label="Settings sections"
          className="hidden lg:block"
        >
          <div className="sticky top-6 space-y-1">
            <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-widest text-white/35">
              On this page
            </p>
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm text-white/55 transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                >
                  <Icon className="h-4 w-4 shrink-0 text-white/40" />
                  {section.label}
                </a>
              )
            })}
          </div>
        </nav>

        <div className="min-w-0 space-y-8">
          <div id="security" className="scroll-mt-6">
            <ChangePasswordForm />
          </div>

          <div id="taxonomy" className="scroll-mt-6">
            <TagPresetsManager />
          </div>

          <Suspense fallback={<SettingsSkeleton />}>
            <SystemStatus />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
