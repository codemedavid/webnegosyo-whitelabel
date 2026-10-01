/**
 * Apple Wallet web service (`webServiceURL` in every pass):
 *   POST/DELETE v1/devices/{device}/registrations/{passType}/{serial}
 *   GET         v1/devices/{device}/registrations/{passType}?passesUpdatedSince=
 *   GET         v1/passes/{passType}/{serial}
 *   POST        v1/log
 *
 * Routing and auth rules live in `apple-ws-route.ts` / `apple-ws-handler.ts`;
 * this file only adapts Next.js to them.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { loadWalletConfig } from '@/lib/loyalty/wallet-pass/config'
import { parseAppleWebServiceRoute } from '@/lib/loyalty/wallet-pass/apple-ws-route'
import { handleAppleWebService, type AppleWsDeps } from '@/lib/loyalty/wallet-pass/apple-ws-handler'
import { buildSignedPkpass, PKPASS_CONTENT_TYPE } from '@/lib/loyalty/wallet-pass/apple-pkpass'
import { PLATFORM_LOGO_PATH, refreshPass } from '@/lib/loyalty/wallet-pass/pass-service'
import {
  findPassById,
  findPassBySerial,
  listUpdatedSerials,
  registerAppleDevice,
  unregisterAppleDevice,
} from '@/lib/loyalty/wallet-pass/pass-repository'

export const runtime = 'nodejs'

const WS_LIMIT = { maxRequests: 120, windowMs: 60_000 }

interface RouteContext {
  params: Promise<{ path: string[] }>
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function handle(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  if (!checkRateLimit(`wallet-ws:${ip}`, WS_LIMIT).allowed) return new NextResponse(null, { status: 429 })

  const config = loadWalletConfig()
  const apple = config.apple
  if (!apple) return new NextResponse(null, { status: 404 })

  const { path } = await context.params
  const route = parseAppleWebServiceRoute(request.method, path)
  if (route.kind === 'unknown') return new NextResponse(null, { status: 404 })

  const admin = createAdminClient()
  const deps: AppleWsDeps = {
    passTypeIdentifier: apple.passTypeIdentifier,
    authSecret: apple.authSecret,
    findPass: async (serial) => {
      const row = await findPassBySerial(admin, serial)
      return row ? { id: row.id, serial: row.serial_number, contentUpdatedAt: row.content_updated_at } : null
    },
    register: (passId, deviceId, pushToken) => registerAppleDevice(admin, { passId, deviceId, pushToken }),
    unregister: (passId, deviceId) => unregisterAppleDevice(admin, passId, deviceId),
    listUpdated: (deviceId, since) => listUpdatedSerials(admin, deviceId, since),
    buildLatest: async (passId) => {
      const row = await findPassById(admin, passId)
      if (!row) return null
      const refreshed = await refreshPass(admin, row, config.publicBaseUrl)
      if (!refreshed) return null
      const pkpass = await buildSignedPkpass(refreshed.rendered.content, apple, `${config.publicBaseUrl}${PLATFORM_LOGO_PATH}`)
      return { pkpass, updatedAt: refreshed.updatedAt }
    },
    log: (lines) => console.warn('[wallet-pass] device log:', lines.join(' | ')),
  }

  try {
    const hasBody = request.method === 'POST'
    const response = await handleAppleWebService(route, {
      authorization: request.headers.get('authorization'),
      body: hasBody ? await readJson(request) : null,
      ifModifiedSince: request.headers.get('if-modified-since'),
      passesUpdatedSince: request.nextUrl.searchParams.get('passesUpdatedSince'),
    }, deps)

    if ('pkpass' in response) {
      return new NextResponse(new Uint8Array(response.pkpass), {
        status: 200,
        headers: { 'Content-Type': PKPASS_CONTENT_TYPE, 'Last-Modified': response.lastModified, 'Cache-Control': 'no-store' },
      })
    }
    if ('json' in response) return NextResponse.json(response.json, { headers: { 'Cache-Control': 'no-store' } })
    return new NextResponse(null, { status: response.status })
  } catch (error) {
    console.error('[wallet-pass] web service error:', error instanceof Error ? error.message : error)
    return new NextResponse(null, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
export const DELETE = handle
