/**
 * "Your first week" — what a new merchant does after the automated set-up:
 * get the SmartMenu app on their phone, learn it from SmartMenu University,
 * and finish the few things a robot cannot do for them (food photos, staff
 * logins, the first real order).
 *
 * Pure, so the buyer's ready screen and the admin launch page show the same
 * plan. Lesson links are only offered for lessons that are actually
 * published: a renamed or unpublished lesson drops its link instead of
 * sending a brand-new merchant to a 404.
 */

import { mobileDownloads } from '@/lib/downloads'

export const STARTER_COURSE_SLUG = 'getting-started'

export interface AppDownloadLink {
  platform: 'ios' | 'android'
  label: string
  href: string
  /** Shown under the button, e.g. how to install an APK. */
  note: string | null
}

export interface LessonLink {
  title: string
  href: string
}

export type FirstWeekStepId = 'app' | 'pos' | 'printer' | 'photos' | 'staff' | 'first_order'

export interface FirstWeekStep {
  id: FirstWeekStepId
  title: string
  why: string
  lessons: LessonLink[]
  /** Where in the dashboard the merchant does it; null for app-only steps. */
  action: { label: string; href: string } | null
  isOptional: boolean
}

export interface FirstWeekPlan {
  appDownloads: AppDownloadLink[]
  steps: FirstWeekStep[]
  /** The whole starter course, or the University home when it could not be read. */
  courseHref: string
  courseLessonCount: number | null
}

export interface FirstWeekInput {
  /** Origin of the platform host ('' when already on it): University pages are never served on a store's own domain. */
  platformOrigin: string
  tenantSlug: string
  /** Published lessons of the starter course, slug → title; null when the course could not be read. */
  lessons: ReadonlyMap<string, string> | null
}

interface StepTemplate {
  id: FirstWeekStepId
  title: string
  why: string
  lessonSlugs: string[]
  adminPath: string | null
  actionLabel: string | null
  isOptional: boolean
}

const STEP_TEMPLATES: readonly StepTemplate[] = [
  {
    id: 'app',
    title: 'Get the SmartMenu app on your phone',
    why: 'New orders ring on your phone, even when this page is closed. Log in with the same email and password.',
    lessonSlugs: ['downloading-the-app', 'getting-started-sa-smartmenu-app'],
    adminPath: null,
    actionLabel: null,
    isOptional: false,
  },
  {
    id: 'pos',
    title: 'Ring up a practice sale on the POS',
    why: 'Walk-in orders go through the app too, so every sale lands in one report. The POS works even before launch.',
    lessonSlugs: ['introduction-sa-pos-walk-in-orders'],
    adminPath: null,
    actionLabel: null,
    isOptional: false,
  },
  {
    id: 'printer',
    title: 'Connect your receipt printer',
    why: 'Order chits print by themselves the moment an order comes in.',
    lessonSlugs: ['connecting-sa-printer'],
    adminPath: null,
    actionLabel: null,
    isOptional: true,
  },
  {
    id: 'photos',
    title: 'Add photos to your best sellers',
    why: 'We read your menu, but we cannot take food photos for you. Items with a photo sell noticeably more.',
    lessonSlugs: ['adding-images-ng-items-managing-your-products'],
    adminPath: '/menu',
    actionLabel: 'Open my menu',
    isOptional: false,
  },
  {
    id: 'staff',
    title: 'Give your staff their own login',
    why: 'Staff take orders without your password, and every sale shows who rang it up.',
    lessonSlugs: ['creating-accounts-para-sa-staffs-mo'],
    adminPath: '/staff',
    actionLabel: 'Add staff',
    isOptional: true,
  },
  {
    id: 'first_order',
    title: 'Take your first online order',
    why: 'Once you are live, post your store link on Facebook and in your bio. The first order is the one that makes it real.',
    lessonSlugs: ['first-order-sa-smartmenu'],
    adminPath: null,
    actionLabel: null,
    isOptional: false,
  },
]

const APK_NOTE = 'Direct download. If your phone asks, allow installs from your browser.'

interface PlatformUrlEnv {
  NEXT_PUBLIC_APP_URL?: string
  NEXT_PUBLIC_SITE_URL?: string
  PLATFORM_ROOT_DOMAIN?: string
  [name: string]: string | undefined
}

export function resolvePlatformOrigin(env: PlatformUrlEnv = process.env): string {
  const base = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? (env.PLATFORM_ROOT_DOMAIN ? `https://${env.PLATFORM_ROOT_DOMAIN}` : '')
  return base.replace(/\/+$/, '')
}

export function listAppDownloads(): AppDownloadLink[] {
  return mobileDownloads
    .filter((download) => download.available && !!download.href)
    .map((download) => ({
      platform: download.platform,
      label: download.platform === 'ios' ? 'App Store (iPhone & iPad)' : 'Android',
      href: download.href as string,
      note: download.kind === 'apk' ? APK_NOTE : null,
    }))
}

function lessonLinks(input: FirstWeekInput, slugs: string[]): LessonLink[] {
  const { lessons, platformOrigin } = input
  if (!lessons) return []
  return slugs.flatMap((slug) => {
    const title = lessons.get(slug)
    return title ? [{ title, href: `${platformOrigin}/university/${STARTER_COURSE_SLUG}/${slug}` }] : []
  })
}

export function buildFirstWeekPlan(input: FirstWeekInput): FirstWeekPlan {
  const steps = STEP_TEMPLATES.map((template) => ({
    id: template.id,
    title: template.title,
    why: template.why,
    lessons: lessonLinks(input, template.lessonSlugs),
    action: template.adminPath && template.actionLabel
      ? { label: template.actionLabel, href: `/${input.tenantSlug}/admin${template.adminPath}` }
      : null,
    isOptional: template.isOptional,
  }))

  const hasCourse = !!input.lessons && input.lessons.size > 0
  return {
    appDownloads: listAppDownloads(),
    steps,
    courseHref: hasCourse ? `${input.platformOrigin}/university/${STARTER_COURSE_SLUG}` : `${input.platformOrigin}/university`,
    courseLessonCount: hasCourse ? input.lessons?.size ?? null : null,
  }
}
