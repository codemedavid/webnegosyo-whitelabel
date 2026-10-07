import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadBufferToImageKit } from '@/lib/imagekit-server'
import { detectImageMime, type DetectedImageMime } from '@/lib/imagekit-signature'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { findOnboardingForToken } from '@/lib/onboarding/access'
import { updateOnboardingAssets, type OnboardingAssets } from '@/lib/onboarding/repository'
import { MAX_MENU_PHOTOS } from '@/lib/onboarding/answers'

/**
 * /api/onboarding/[token]/upload — the wizard's logo and menu photos.
 *
 *   POST (multipart: file, kind=logo|menu)  upload, remember on the set-up
 *   DELETE { kind: 'menu', index }          forget one menu photo
 *
 * Same discipline as payment-proof uploads: bytes are sniffed (JPEG/PNG/WEBP
 * only), the server picks folder and file name, ImageKit never overwrites.
 * The stored URLs are the only images the build later fetches, so a buyer can
 * never point the server at an arbitrary address.
 */
export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 4 * 1024 * 1024
const MULTIPART_OVERHEAD_BYTES = 64 * 1024
const UPLOAD_RATE_LIMIT = { limit: 30, windowSec: 600 }
const NO_STORE = { 'Cache-Control': 'no-store' }

const EXTENSIONS: Readonly<Record<DetectedImageMime, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

type RouteContext = { params: Promise<{ token: string }> }
type UploadKind = 'logo' | 'menu'

function respond(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

async function resolve(context: RouteContext) {
  const { token } = await context.params
  const admin = createAdminClient()
  const onboarding = await findOnboardingForToken(admin, token)
  return onboarding ? { admin, onboarding } : null
}

function withUpload(assets: OnboardingAssets, kind: UploadKind, url: string): OnboardingAssets | null {
  if (kind === 'logo') return { ...assets, logoUrl: url }
  const menu = assets.menuImageUrls ?? []
  if (menu.length >= MAX_MENU_PHOTOS) return null
  return { ...assets, menuImageUrls: [...menu, url] }
}

async function readImage(request: NextRequest): Promise<{ kind: UploadKind; bytes: Uint8Array; mime: DetectedImageMime } | NextResponse> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return respond({ error: 'That photo is too large (max 4MB).' }, 413)
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return respond({ error: 'Expected a photo upload.' }, 400)
  }
  const kind = form.get('kind')
  if (kind !== 'logo' && kind !== 'menu') return respond({ error: 'Unknown upload.' }, 400)
  const file = form.get('file')
  if (!file || typeof file === 'string' || file.size === 0) return respond({ error: 'No photo was attached.' }, 400)
  if (file.size > MAX_FILE_BYTES) return respond({ error: 'That photo is too large (max 4MB).' }, 413)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = detectImageMime(bytes)
  if (!mime) return respond({ error: 'Please upload a PNG, JPG or WEBP image.' }, 415)
  return { kind, bytes, mime }
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ip = getClientIP(request)
  if (ip) {
    const rate = await checkRateLimit(`onboarding-upload:${ip}`, UPLOAD_RATE_LIMIT)
    if (!rate.allowed) return respond({ error: 'Too many uploads. Please wait a moment.' }, 429)
  }

  const found = await resolve(context).catch(() => null)
  if (!found) return respond({ error: 'This set-up link is not valid.' }, 404)
  if (found.onboarding.status !== 'awaiting_details') return respond({ error: 'Your store is already being built.' }, 409)

  const image = await readImage(request)
  if (image instanceof NextResponse) return image
  if (image.kind === 'menu' && (found.onboarding.assets.menuImageUrls?.length ?? 0) >= MAX_MENU_PHOTOS) {
    return respond({ error: `Up to ${MAX_MENU_PHOTOS} menu photos.` }, 409)
  }

  try {
    const uploaded = await uploadBufferToImageKit(image.bytes, {
      folder: `onboarding/${found.onboarding.id}`,
      fileName: `${image.kind}-${randomUUID()}.${EXTENSIONS[image.mime]}`,
      mimeType: image.mime,
    })
    // Applied to the row as it is NOW, so a parallel upload is never erased.
    const assets = await updateOnboardingAssets(found.admin, found.onboarding.id, (current) => withUpload(current, image.kind, uploaded.url))
    if (!assets) return respond({ error: `Up to ${MAX_MENU_PHOTOS} menu photos.` }, 409)
    return respond({ success: true, assets })
  } catch (error) {
    console.error('[onboarding/upload] failed', error instanceof Error ? error.message : error)
    return respond({ error: 'We could not upload that photo. Please try again.' }, 502)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const found = await resolve(context).catch(() => null)
  if (!found) return respond({ error: 'This set-up link is not valid.' }, 404)

  const body = (await request.json().catch(() => null)) as { kind?: unknown; index?: unknown } | null
  const menu = found.onboarding.assets.menuImageUrls ?? []
  const index = typeof body?.index === 'number' ? body.index : -1
  const isMenuPhoto = body?.kind === 'menu' && Number.isInteger(index) && index >= 0 && index < menu.length
  const isLogo = body?.kind === 'logo'
  if (!isMenuPhoto && !isLogo) return respond({ error: 'Nothing to remove.' }, 400)

  // Remove the photo the buyer saw at that index, from the row as it is now.
  const removedUrl = menu[index]
  const withoutPhoto = (current: OnboardingAssets): OnboardingAssets => isLogo
    ? { ...current, logoUrl: null }
    : { ...current, menuImageUrls: (current.menuImageUrls ?? []).filter((url) => url !== removedUrl) }
  try {
    const assets = await updateOnboardingAssets(found.admin, found.onboarding.id, withoutPhoto)
    return respond({ success: true, assets })
  } catch (error) {
    console.error('[onboarding/upload] remove failed', error instanceof Error ? error.message : error)
    return respond({ error: 'Could not remove the photo. Please refresh and try again.' }, 409)
  }
}
