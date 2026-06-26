import { NextResponse } from 'next/server'
import { getUploadAuthParams } from '@/lib/imagekit-server'

/**
 * Issue ImageKit client-upload authentication parameters.
 *
 * ImageKit requires a server-signed { token, expire, signature } for every
 * direct client upload (web + mobile). This endpoint returns those plus the
 * public key. It mirrors the trust level of the old Cloudinary unsigned upload
 * preset: anyone who can reach checkout can obtain upload credentials, so the
 * folder is still chosen client-side and deletion stays folder-scoped.
 *
 * Not cached — each call must return a fresh, single-use token.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const params = getUploadAuthParams()
  if (!params) {
    return NextResponse.json(
      { error: 'Image upload is not configured.' },
      { status: 503 },
    )
  }
  return NextResponse.json(params)
}
