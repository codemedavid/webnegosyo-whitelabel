/**
 * The slow half of onboarding: turn the buyer's answers into a finished store.
 *
 * Six steps, each recorded on the onboarding row as it runs so the progress
 * screen can show it live. A step that finished is never repeated: a retry
 * re-runs only what failed. One failed step does not stop the others — a menu
 * the AI could not read still leaves the store with its colors, payments and
 * hours, and the owner fixes the rest from the launch checklist.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { saveBrandingWithClient } from '@/lib/branding-write'
import { parseMenuWithAi } from '@/lib/menu-import/parse-menu-ai'
import { importParsedMenu } from '@/lib/menu-import/import-parsed-menu'
import { fetchImageAsDataUrl, fetchImageBuffer } from '@/lib/menu-import/fetch-image'
import { createPaymentMethod } from '@/lib/payment-methods-service'
import { invalidateTenantCache } from '@/lib/cache'
import { invalidateBundlesCache } from '@/lib/bundles-service'
import { invalidateCheckoutUpsellCache } from '@/lib/menu-engineering-service'
import { invalidateComplementaryPairsCache } from '@/lib/complementary-pairs-service'
import { extractBrandColorFromImage } from './logo-color'
import { STORE_LOOKS, buildLaunchBranding, buildLaunchDesign, toStoreLook } from './store-type'
import { applyLaunchHero, chooseLaunchDesign, launchHeroInput, readStoreFacts } from './design-step'
import { applyLaunchBoost } from './boost-autopilot'
import { launchStarterLoyalty } from './launch-loyalty'
import { draftLaunchCampaigns } from './launch-campaigns'
import { launchFromSetupLink } from './buyer-launch'
import type { OnboardingAnswers } from './answers'
import {
  ONBOARDING_BUILD_STEPS,
  buildOperatingHours,
  buildPaymentMethods,
  isBlockedByDependency,
  isStepSettled,
  matchBestSellers,
  orderTypeToggles,
  pickLaunchBrandColor,
  type OnboardingBuildStepId,
  type OnboardingSteps,
} from './plan'
import {
  claimOnboardingBuild,
  findOnboardingById,
  finishOnboardingBuild,
  withStep,
  writeOnboardingSteps,
  type OnboardingAssets,
} from './repository'
import { EMPTY_BUILD_SUMMARY, type LaunchBuildSummary } from './summary'

type AdminClient = SupabaseClient<Database>

const STORE_TIMEZONE = 'Asia/Manila'
/**
 * The menu read must give up before the route's 300s `maxDuration` kills the
 * function: a killed build leaves its step `running` until the stale window
 * passes, while a timed-out read is recorded as a failed step the buyer can
 * retry at once.
 */
const MENU_PARSE_DEADLINE_MS = 200_000

interface BuildContext {
  admin: AdminClient
  ctx: ProvisioningCtx
  tenantId: string
  answers: OnboardingAnswers
  assets: OnboardingAssets
}

interface StepOutcome {
  status: 'done' | 'skipped'
  detail: string
  summary: Partial<LaunchBuildSummary>
}

// ---------------------------------------------------------------- steps

async function brandingStep(build: BuildContext): Promise<StepOutcome> {
  const logoUrl = build.assets.logoUrl
  // The owner already saw (and maybe changed) this color in the wizard's live preview.
  const chosenColor = pickLaunchBrandColor(build.answers.brandColor, build.assets.logoColor)
  const brandColor = chosenColor ?? (logoUrl
    ? await fetchImageBuffer(logoUrl).then(({ buffer }) => extractBrandColorFromImage(buffer)).catch(() => null)
    : null)

  const patch = buildLaunchBranding({
    storeType: build.answers.storeType,
    storeName: build.answers.storeName,
    brandColor,
    // Imported menus carry no dish photos yet, so the design starts text-first.
    hasItemPhotos: false,
    tagline: build.answers.tagline || null,
    // Until the design step reads the menu: the owner's pick or the store type's look.
    look: toStoreLook(build.answers.look),
  })
  const result = await saveBrandingWithClient(build.admin, build.tenantId, patch)
  if (!result.success) throw new Error(result.error ?? 'Branding could not be saved')

  return {
    status: 'done',
    // Owners see this line: plain words, never a hex code.
    detail: build.answers.brandColor
      ? 'Your color is on every page'
      : brandColor ? 'Colors taken from your logo' : 'Colors chosen for your store type',
    summary: { brandColor },
  }
}

async function readMenuSources(build: BuildContext): Promise<{ text?: string; images: string[] }> {
  const images = await Promise.all((build.assets.menuImageUrls ?? []).map((url) => fetchImageAsDataUrl(url)))
  const text = build.answers.menuText?.trim() || undefined
  return { text, images }
}

async function markBestSellers(build: BuildContext, items: ReadonlyArray<{ id: string; name: string }>): Promise<string[]> {
  const ids = matchBestSellers(build.answers.bestSellers, items)
  if (ids.length === 0) return []
  const { error } = await build.admin.from('menu_items').update({ is_featured: true }).eq('tenant_id', build.tenantId).in('id', ids)
  if (error) throw new Error(`Best sellers could not be marked: ${error.message}`)
  const names = new Map(items.map((item) => [item.id, item.name]))
  return ids.map((id) => names.get(id) ?? '')
}

function bestSellerWarnings(hasFailed: boolean, marked: number, typed: number): string[] {
  if (hasFailed) return ['Your best sellers could not be marked; mark them as featured in your menu.']
  return marked < typed ? ['Some best sellers were not found on the menu; mark them as featured.'] : []
}

/** A fresh store's menu is small; this only bounds the read. */
const MAX_EXISTING_MENU_ROWS = 1000

async function readExistingMenuItems(build: BuildContext): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await build.admin
    .from('menu_items')
    .select('id, name')
    .eq('tenant_id', build.tenantId)
    .limit(MAX_EXISTING_MENU_ROWS)
  if (error) throw new Error(`Menu items could not be read: ${error.message}`)
  return (data ?? []) as Array<{ id: string; name: string }>
}

async function menuStep(build: BuildContext): Promise<StepOutcome> {
  // A build killed after the import but before the step was recorded leaves
  // the step `running`; the takeover would import the whole menu again. The
  // store was created empty by onboarding, so any dish means it was imported.
  const existingItems = await readExistingMenuItems(build)
  if (existingItems.length > 0) {
    const marked = await markBestSellers(build, existingItems).catch(() => [] as string[])
    return {
      status: 'done',
      detail: `${existingItems.length} items already on your menu`,
      summary: { bestSellerNames: marked },
    }
  }

  const sources = await readMenuSources(build)
  if (!sources.text && sources.images.length === 0) {
    return { status: 'skipped', detail: 'No menu was added', summary: { warnings: ['Add your menu items — none were uploaded.'] } }
  }

  const parsed = await parseMenuWithAi(sources, {
    fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(MENU_PARSE_DEADLINE_MS) }),
  })
  if (!parsed.ok) throw new Error(parsed.error)

  const imported = await importParsedMenu(build.admin, build.tenantId, parsed.data)
  if (imported.itemsCreated === 0) throw new Error('No menu items could be saved')

  // The items are saved now, so the step must end `done`: a failed step is
  // re-run on retry, and re-importing would duplicate the whole menu.
  const bestSellers = await markBestSellers(build, imported.createdItems).then(
    (names) => ({ names, hasFailed: false }),
    (error: unknown) => {
      console.error('[onboarding] best sellers could not be marked', { tenantId: build.tenantId, error: error instanceof Error ? error.message : error })
      return { names: [] as string[], hasFailed: true }
    },
  )
  const bestSellerNames = bestSellers.names
  const freeItems = imported.createdItems.filter((item) => !(item.price > 0)).length
  const warnings = [
    'Check your menu names and prices — our AI typed them in for you.',
    ...(freeItems > 0 ? [`${freeItems} ${freeItems === 1 ? 'item is' : 'items are'} ₱0. Set a price, or leave ${freeItems === 1 ? 'it' : 'them'} as a free inclusion. We never use ₱0 items in offers.`] : []),
    ...(imported.itemsFailed > 0 ? [`${imported.itemsFailed} items could not be saved; add them by hand.`] : []),
    ...bestSellerWarnings(bestSellers.hasFailed, bestSellerNames.length, build.answers.bestSellers.length),
  ]
  return {
    status: 'done',
    detail: `${imported.itemsCreated} items in ${imported.categoriesCreated + imported.categoriesSkipped} categories`,
    summary: {
      menu: { categories: imported.categoriesCreated + imported.categoriesSkipped, items: imported.itemsCreated, failed: imported.itemsFailed },
      bestSellerNames,
      warnings,
    },
  }
}

/**
 * Cosmetic: the branding step already saved a working look, so a failure here
 * keeps that look and never fails the build (a failed build skips go-live).
 */
async function designStep(build: BuildContext): Promise<StepOutcome> {
  try {
    const facts = await readStoreFacts(build.admin, build.tenantId)
    const choice = await chooseLaunchDesign(build.answers, facts)
    const result = await saveBrandingWithClient(build.admin, build.tenantId, buildLaunchDesign(build.answers.storeType, choice))
    if (!result.success) throw new Error(result.error ?? 'Design could not be saved')
    const isHeroSaved = await applyLaunchHero(build.admin, build.tenantId, choice.hero, launchHeroInput(build.answers, facts)).then(
      () => true,
      (error: unknown) => {
        console.error('[onboarding] launch hero not saved', { tenantId: build.tenantId, message: error instanceof Error ? error.message : String(error) })
        return false
      },
    )
    return {
      status: 'done',
      detail: `${STORE_LOOKS[choice.look].label} layout`,
      summary: {
        design: { look: choice.look, ...(isHeroSaved ? { hero: choice.hero } : {}), reason: choice.reason, source: choice.source },
        ...(isHeroSaved ? {} : { warnings: ['Your hero banner could not be set up. Add one in Hero Builder.'] }),
      },
    }
  } catch (error) {
    console.error('[onboarding] design step kept the starting look', { tenantId: build.tenantId, message: error instanceof Error ? error.message : String(error) })
    return {
      status: 'done',
      detail: 'Kept your starting layout',
      summary: { warnings: ['We kept your starting layout. Pick another in Branding anytime.'] },
    }
  }
}

async function addPaymentMethods(build: BuildContext): Promise<string[]> {
  const { data, error } = await build.admin.from('payment_methods').select('name').eq('tenant_id', build.tenantId)
  if (error) throw new Error(`Payment methods could not be read: ${error.message}`)
  const existing = new Set((data ?? []).map((row) => (row as { name: string }).name.toLowerCase()))

  const plans = buildPaymentMethods(build.answers.payments)
  for (const plan of plans) {
    if (existing.has(plan.name.toLowerCase())) continue
    await createPaymentMethod(build.tenantId, plan.name, plan.details, undefined, true, [], plan.requirePaymentProof, plan.skipPaymentDetails, build.ctx)
  }
  return plans.map((plan) => plan.name)
}

async function storeSetupStep(build: BuildContext): Promise<StepOutcome> {
  const paymentMethods = await addPaymentMethods(build)

  const toggles = orderTypeToggles(build.answers.orderTypes)
  for (const [type, isEnabled] of Object.entries(toggles)) {
    const { error } = await build.admin.from('order_types').update({ is_enabled: isEnabled }).eq('tenant_id', build.tenantId).eq('type', type)
    if (error) throw new Error(`Order types could not be saved: ${error.message}`)
  }

  const { error } = await build.admin
    .from('tenants')
    .update({
      operating_hours: buildOperatingHours(build.answers.hours),
      enforce_operating_hours: build.answers.hours.stopOrdersWhenClosed,
      timezone: STORE_TIMEZONE,
    } as never)
    .eq('id', build.tenantId)
  if (error) throw new Error(`Opening hours could not be saved: ${error.message}`)

  return { status: 'done', detail: `${paymentMethods.join(', ')} · ${build.answers.hours.open}–${build.answers.hours.close}`, summary: { paymentMethods } }
}

async function readFeaturedIds(build: BuildContext): Promise<string[]> {
  const { data, error } = await build.admin.from('menu_items').select('id').eq('tenant_id', build.tenantId).eq('is_featured', true)
  if (error) throw new Error(`Best sellers could not be read: ${error.message}`)
  return (data ?? []).map((row) => (row as { id: string }).id)
}

function boostDetail(live: number, waiting: number): string {
  const parts = [
    live > 0 ? `${live} ${live === 1 ? 'upsell' : 'upsells'} live` : null,
    waiting > 0 ? `${waiting} ${waiting === 1 ? 'combo' : 'combos'} for your OK` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

async function boostStep(build: BuildContext): Promise<StepOutcome> {
  const result = await applyLaunchBoost(build.ctx, build.tenantId, { bestSellerIds: await readFeaturedIds(build) })
  if (result.applied.length === 0 && result.awaitingApproval.length === 0) {
    return { status: 'skipped', detail: 'Not enough menu items for offers yet', summary: {} }
  }
  return {
    status: 'done',
    detail: boostDetail(result.applied.length, result.awaitingApproval.length),
    summary: {
      offers: result.applied.map(({ kind, title }) => ({ kind, title })),
      offersAwaitingApproval: result.awaitingApproval.map(({ kind, title }) => ({ kind, title })),
    },
  }
}

async function loyaltyStep(build: BuildContext): Promise<StepOutcome> {
  const result = await launchStarterLoyalty(build.admin, build.tenantId, {
    storeName: build.answers.storeName,
    bestSellerIds: await readFeaturedIds(build),
  })
  if (result.status === 'skipped') return { status: 'skipped', detail: result.reason, summary: {} }
  return {
    status: 'done',
    detail: `${result.threshold} orders → ${result.rewardLabel}`,
    summary: { loyalty: { rewardLabel: result.rewardLabel, threshold: result.threshold, minSpend: result.minSpend } },
  }
}

/**
 * Cosmetic like the design step: drafts send nothing, so a failure here only
 * costs the owner some ready-made texts and never blocks go-live.
 */
async function campaignsStep(build: BuildContext, summary: LaunchBuildSummary): Promise<StepOutcome> {
  try {
    const result = await draftLaunchCampaigns(build.admin as unknown as SupabaseClient, build.tenantId, {
      rewardLabel: summary.loyalty?.rewardLabel ?? null,
      threshold: summary.loyalty?.threshold ?? null,
    })
    return { status: 'done', detail: `${result.drafted} texts ready to turn on`, summary: { campaigns: { drafted: result.drafted } } }
  } catch (error) {
    console.error('[onboarding] text campaigns not drafted', { tenantId: build.tenantId, message: error instanceof Error ? error.message : String(error) })
    return { status: 'skipped', detail: 'Add text campaigns from the app anytime', summary: {} }
  }
}

const STEP_RUNNERS: Record<OnboardingBuildStepId, (build: BuildContext, summary: LaunchBuildSummary) => Promise<StepOutcome>> = {
  branding: brandingStep,
  menu: menuStep,
  design: designStep,
  store_setup: storeSetupStep,
  boost: boostStep,
  loyalty: loyaltyStep,
  campaigns: campaignsStep,
}

// --------------------------------------------------------------- runner

function mergeSummary(summary: LaunchBuildSummary, patch: Partial<LaunchBuildSummary>): LaunchBuildSummary {
  return { ...summary, ...patch, warnings: [...summary.warnings, ...(patch.warnings ?? [])] }
}

/** What the buyer sees for a failed step. The real cause goes to the log and to staff. */
const FRIENDLY_STEP_ERRORS: Record<OnboardingBuildStepId, string> = {
  branding: 'Your colors could not be applied. Retry, or pick them in Branding.',
  menu: 'We could not read your menu automatically. Retry, or add items from your dashboard.',
  design: 'Your store layout could not be applied. Retry, or pick one in Branding.',
  store_setup: 'Payments, hours or order types could not be saved. Retry, or set them in Settings.',
  boost: 'Combos and upsells could not be created. Retry, or add them in Boost Sales.',
  loyalty: 'The stamp card could not be started. Retry, or set it up in Loyalty.',
  campaigns: 'Your text messages could not be saved. Retry, or add them from the app.',
}

function technicalError(stepId: OnboardingBuildStepId, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[onboarding] build step failed', { stepId, message })
  return message.length > 200 ? `${message.slice(0, 200)}…` : message
}

async function runSteps(build: BuildContext, onboardingId: string, initial: OnboardingSteps, summary: LaunchBuildSummary) {
  let steps = initial
  let current = summary
  const failures: string[] = []

  for (const { id, label } of ONBOARDING_BUILD_STEPS) {
    if (isStepSettled(steps, id)) continue
    if (isBlockedByDependency(steps, id)) {
      steps = withStep(steps, id, { status: 'pending', detail: 'Waiting for your menu' })
      continue
    }
    steps = withStep(steps, id, { status: 'running', detail: label })
    await writeOnboardingSteps(build.admin, onboardingId, steps)
    try {
      const outcome = await STEP_RUNNERS[id](build, current)
      steps = withStep(steps, id, { status: outcome.status, detail: outcome.detail })
      current = mergeSummary(current, outcome.summary)
    } catch (error) {
      steps = withStep(steps, id, { status: 'failed', detail: FRIENDLY_STEP_ERRORS[id] })
      failures.push(`${label}: ${technicalError(id, error)}`)
    }
    await writeOnboardingSteps(build.admin, onboardingId, steps)
  }
  return { steps, summary: current, failures }
}

async function refreshStoreCaches(admin: AdminClient, tenantId: string): Promise<void> {
  // Boost writers leave cache refresh to their callers (the Boost actions do it).
  await Promise.all([
    invalidateBundlesCache(tenantId),
    invalidateCheckoutUpsellCache(tenantId),
    invalidateComplementaryPairsCache(tenantId),
  ]).catch((error: unknown) => console.warn('[onboarding] offer cache refresh failed', error))
  try {
    const { data } = await admin.from('tenants').select('slug').eq('id', tenantId).single()
    if (data?.slug) await invalidateTenantCache(data.slug, tenantId)
  } catch (error) {
    // Outside a request scope the Next cache purge can refuse; the store is
    // in pre-launch and publishing purges again, so this is only best effort.
    console.warn('[onboarding] cache refresh after build skipped', error instanceof Error ? error.message : error)
  }
}

/**
 * The set-up link goes out only after payment, so a finished build opens the
 * store by itself: the owner should land on a store that takes orders, not an
 * "Opening soon" banner. It goes through the SAME rules as the buyer's Go live
 * (paid lead, nothing blocking a checkout: menu, a way to pay, an order type),
 * read from the FINISHED row. A refusal leaves the store closed and the reveal
 * shows what to fix; it never fails the build.
 */
async function openStoreWhenReady(admin: AdminClient, onboardingId: string): Promise<void> {
  try {
    const finished = await findOnboardingById(admin, onboardingId)
    if (!finished) return
    const result = await launchFromSetupLink(admin, finished)
    if (!result.ok) console.warn('[onboarding] store left closed after build', { onboardingId, reason: result.error })
  } catch (error) {
    console.error('[onboarding] auto go-live failed', { onboardingId, message: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Build (or finish building) one store. Safe to call twice: the second call
 * loses the claim and returns. Never throws for a step — failures are recorded
 * on the row for the progress screen and the retry button.
 */
export async function runOnboardingBuild(admin: AdminClient, onboardingId: string): Promise<void> {
  const onboarding = await findOnboardingById(admin, onboardingId)
  if (!onboarding?.tenantId || !onboarding.answers) return
  if (!(await claimOnboardingBuild(admin, onboarding.id, onboarding.attempts))) return

  const build: BuildContext = {
    admin,
    ctx: { client: admin },
    tenantId: onboarding.tenantId,
    answers: onboarding.answers,
    assets: onboarding.assets,
  }

  try {
    // A retry keeps what earlier attempts found: settled steps (the only ones
    // that add warnings) never run twice, so nothing is duplicated.
    const startSummary = onboarding.summary ?? EMPTY_BUILD_SUMMARY
    const { summary, failures } = await runSteps(build, onboarding.id, onboarding.steps, startSummary)
    await finishOnboardingBuild(admin, onboarding.id, failures.length === 0
      ? { status: 'ready', summary }
      : { status: 'failed', error: failures.join(' · '), summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[onboarding] build crashed', { onboardingId, message })
    await finishOnboardingBuild(admin, onboarding.id, { status: 'failed', error: 'The build stopped unexpectedly. Press retry.', summary: onboarding.summary ?? EMPTY_BUILD_SUMMARY })
      .catch(() => undefined)
  }
  await openStoreWhenReady(admin, onboarding.id)
  await refreshStoreCaches(admin, onboarding.tenantId)
}
