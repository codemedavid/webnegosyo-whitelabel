/**
 * Response headers for every path, wired in `next.config.ts`. Pure data, imported
 * by a relative path there, so no `@/` aliases and no runtime dependencies.
 *
 * Not set here, on purpose:
 * - Frame rules: the middleware adds `X-Frame-Options` + an enforcing
 *   `frame-ancestors` CSP to protected pages only; storefronts stay embeddable
 *   on merchants' own sites. A separate Report-Only header cannot conflict with
 *   that enforcing one.
 * - `Strict-Transport-Security`: Vercel already sends `max-age=63072000`.
 */

const MAPS = ['https://*.apple-mapkit.com', 'https://*.ls.apple.com', 'https://api.mapbox.com', 'https://*.tiles.mapbox.com', 'https://events.mapbox.com']
const IMAGE_HOSTS = [
  'https://media.webnegosyo.com',
  'https://ik.imagekit.io',
  'https://res.cloudinary.com',
  'https://images.unsplash.com',
  'https://img.youtube.com',
  'https://api.loyverse.com',
]
const EMBED_HOSTS = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.loom.com',
  'https://drive.google.com',
  // The "Find us" map preset's Embed block.
  'https://www.google.com',
]
const VERCEL_TOOLBAR = ['https://vercel.live']

/**
 * A baseline taken from the sources the code actually uses. Report-Only: a miss
 * here shows up as a report and breaks nothing. `'unsafe-inline'` covers the
 * inline Meta pixel bootstrap, Next's inline bootstrap and theme styles; a nonce
 * is the step before this could ever be enforced. Merchant-supplied hero/welcome
 * media may be any https host, hence `https:` on images and media. No
 * `form-action`: the MCP consent form redirects to whichever client asked. Owner
 * "Embed" blocks are srcdoc frames, which inherit this policy, so they report too.
 */
const DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'script-src': ["'self'", "'unsafe-inline'", 'https://connect.facebook.net', 'https://cdn.apple-mapkit.com', ...VERCEL_TOOLBAR],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://api.mapbox.com'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https:',
    ...IMAGE_HOSTS,
    'https://www.facebook.com',
    'https://snapshot.apple-mapkit.com',
    ...MAPS,
  ],
  'media-src': ["'self'", 'blob:', 'https:', 'https://media.webnegosyo.com', 'https://ik.imagekit.io', 'https://res.cloudinary.com', 'https://videos.pexels.com'],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.convex.cloud',
    'wss://*.convex.cloud',
    'https://*.convex.site',
    'https://media.webnegosyo.com',
    'https://*.r2.cloudflarestorage.com',
    'https://upload.imagekit.io',
    'https://ik.imagekit.io',
    'https://res.cloudinary.com',
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://www.facebook.com',
    'https://connect.facebook.net',
    'https://maps-api.apple.com',
    ...MAPS,
    ...VERCEL_TOOLBAR,
  ],
  'frame-src': [
    "'self'",
    ...EMBED_HOSTS,
    'https://www.facebook.com',
    ...VERCEL_TOOLBAR,
  ],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
}

export function buildContentSecurityPolicy(reportUri?: string): string {
  const parts = Object.entries(DIRECTIVES).map(([name, sources]) => `${name} ${sources.join(' ')}`)
  return [...parts, ...(reportUri ? [`report-uri ${reportUri}`] : [])].join('; ')
}

/**
 * Storefront address fields use geolocation, the admin scanner and proof photos
 * the camera, the owner assistant's voice note the microphone. Only what nothing
 * here touches is turned off.
 */
const PERMISSIONS_POLICY = [
  'geolocation=(self)',
  'camera=(self)',
  'microphone=(self)',
  'usb=()',
  'serial=()',
  'browsing-topics=()',
].join(', ')

export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  { key: 'Content-Security-Policy-Report-Only', value: buildContentSecurityPolicy(process.env.CSP_REPORT_URI) },
]
