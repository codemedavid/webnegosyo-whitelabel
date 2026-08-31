# Superadmin MCP Authentication Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom superadmin MCP OAuth issuer with Supabase OAuth 2.1 while keeping the merchant MCP flow working and reducing superadmin authentication to one standard token verifier and one consent surface.

**Architecture:** Supabase Auth becomes the authorization server for `/api/mcp/mcp`; SmartMenu publishes protected-resource metadata, verifies Supabase JWTs, checks the current `app_users` role, and dispatches tools. The existing SmartMenu authorization server remains only for merchant MCP. A Supabase access-token hook binds OAuth tokens to the exact production MCP audience.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Auth OAuth 2.1, `@supabase/supabase-js`, `@supabase/ssr`, MCP Streamable HTTP, Jest 30.

---

## File Map

### Create

- `src/lib/mcp/supabase-oauth-config.ts` — canonical Supabase issuer, SmartMenu resource, consent path, and audience helpers.
- `src/lib/mcp/superadmin-auth.ts` — verify Supabase OAuth JWTs and resolve the current superadmin role into MCP `AuthInfo`.
- `src/lib/mcp/superadmin-consent.ts` — load and decide Supabase authorization requests behind a current-role gate.
- `src/app/superadmin/mcp/authorize/page.tsx` — minimal superadmin consent screen.
- `src/app/api/mcp/supabase/decision/route.ts` — approve or deny through Supabase, with a second role check.
- `supabase/migrations/20260831140000_superadmin_mcp_oauth_audience.sql` — bind Supabase OAuth access tokens to the SmartMenu MCP resource.
- `tests/unit/mcp-supabase-oauth-config.test.ts` — metadata/config contract.
- `tests/unit/mcp-superadmin-auth.test.ts` — token and role behavior.
- `tests/unit/mcp-superadmin-consent.test.ts` — consent role gate and decisions.
- `tests/unit/mcp-legacy-oauth-routes.test.ts` — prove the remaining local issuer rejects superadmin requests and defaults tokens to the merchant resource.
- `docs/runbooks/superadmin-mcp-oauth.md` — dashboard settings and cross-client smoke-test checklist.

### Modify

- `package.json`, `package-lock.json` — upgrade Supabase SDKs to versions containing the OAuth authorization UI API.
- `src/lib/mcp/oauth-metadata.ts` — point only the superadmin protected resource at Supabase; keep merchant metadata local.
- `src/lib/mcp/oauth-config.ts` — allow a standards-only Bearer challenge without the legacy local `authorization_uri` extension.
- `src/lib/mcp/request-auth.ts` — separately control the challenge scope and authorization URI while preserving merchant defaults.
- `src/app/.well-known/oauth-protected-resource/route.ts` — serve the new superadmin metadata through the existing route.
- `src/app/.well-known/oauth-protected-resource/[...path]/route.ts` — keep path-suffixed superadmin and merchant selection.
- `src/app/api/mcp/[transport]/route.ts` — require authentication for every method and use the Supabase verifier.
- `src/lib/mcp/register-tools.ts` — advertise OAuth without requesting the unsupported legacy `superadmin` OAuth scope.
- `src/lib/mcp/tool-discovery.ts` — accept resource-specific security schemes instead of hard-coding superadmin.
- `src/app/api/mcp/merchant/[transport]/route.ts` — pass the unchanged merchant OAuth security scheme explicitly.
- `src/middleware.ts` — allow the consent page to preserve `authorization_id` and perform its own login redirect.
- `src/app/api/mcp/oauth/authorize/route.ts` — remove the superadmin branch; retain tenant-admin authorization only.
- `src/app/api/mcp/oauth/token/route.ts` — make the remaining custom token endpoint merchant-only.
- `src/lib/mcp/oauth-metadata.ts` and local authorization-server routes — advertise only merchant scopes on the legacy issuer.
- `src/lib/mcp/mcp-path-well-known.ts`, `next.config.ts` — remove superadmin-only compatibility rewrites while preserving merchant routes.
- Existing `tests/unit/mcp-*.test.ts` files — update contracts and prove merchant behavior does not regress.

### Preserve

- `src/lib/mcp-auth.ts`, `src/lib/mcp/oauth-service.ts`, `src/lib/mcp/oauth-jwt.ts`, and the `mcp_oauth_*` tables remain because merchant MCP still consumes them.
- All MCP provisioning tools and business operations remain unchanged.
- Existing unrelated working-tree changes remain untouched.

---

### Task 1: Upgrade the Supabase SDK Boundary

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Record the pre-upgrade auth baseline**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-auth.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/superadmin-owner-role.test.tsx
```

Expected: all selected tests pass. If any fail, record them as pre-existing and do not hide them in the dependency commit.

- [ ] **Step 2: Upgrade to SDK versions containing `auth.oauth`**

Run:

```bash
npm install --save-exact @supabase/supabase-js@2.112.4 @supabase/ssr@0.12.5
```

Expected: `package.json` pins both versions and `package-lock.json` resolves `@supabase/auth-js@2.112.4`.

- [ ] **Step 3: Prove the required public methods are typed**

Run:

```bash
rg -n "getAuthorizationDetails|approveAuthorization|denyAuthorization" node_modules/@supabase/auth-js/dist/module
npx tsc --noEmit
```

Expected: all three OAuth methods are present. TypeScript reports no new error caused by the SDK update; unrelated pre-existing errors must be recorded separately.

- [ ] **Step 4: Re-run the auth baseline**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-auth.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/superadmin-owner-role.test.tsx
```

Expected: same result as Step 1.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade Supabase SDK for OAuth server UI"
```

---

### Task 2: Publish the Supabase Authorization Server and Resource Audience

**Files:**
- Create: `src/lib/mcp/supabase-oauth-config.ts`
- Create: `tests/unit/mcp-supabase-oauth-config.test.ts`
- Create: `supabase/migrations/20260831140000_superadmin_mcp_oauth_audience.sql`
- Modify: `src/lib/mcp/oauth-metadata.ts`
- Modify: `tests/unit/mcp-oauth-metadata.test.ts`
- Modify: `tests/unit/mcp-oauth-discovery.test.ts`

- [ ] **Step 1: Write the failing metadata contract**

Create `tests/unit/mcp-supabase-oauth-config.test.ts`:

```ts
import { afterEach, describe, expect, it } from '@jest/globals'
import {
  getSupabaseOAuthIssuer,
  getSuperadminMcpResource,
  isSuperadminMcpAudience,
} from '@/lib/mcp/supabase-oauth-config'
import { buildProtectedResourceMetadata } from '@/lib/mcp/oauth-metadata'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
})

describe('Supabase-owned superadmin MCP OAuth', () => {
  it('publishes the Supabase Auth issuer for the exact SmartMenu resource', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/'
    expect(getSupabaseOAuthIssuer()).toBe('https://project.supabase.co/auth/v1')
    expect(getSuperadminMcpResource('https://www.webnegosyo.com')).toBe(
      'https://www.webnegosyo.com/api/mcp/mcp',
    )
    expect(buildProtectedResourceMetadata('https://www.webnegosyo.com')).toEqual({
      resource: 'https://www.webnegosyo.com/api/mcp/mcp',
      authorization_servers: ['https://project.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
    })
  })

  it('accepts string or array audiences only when the MCP resource is present', () => {
    const resource = 'https://www.webnegosyo.com/api/mcp/mcp'
    expect(isSuperadminMcpAudience(resource, resource)).toBe(true)
    expect(isSuperadminMcpAudience(['authenticated', resource], resource)).toBe(true)
    expect(isSuperadminMcpAudience('authenticated', resource)).toBe(false)
  })

  it('fails closed when the Supabase URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(() => getSupabaseOAuthIssuer()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})
```

Update the superadmin cases in `tests/unit/mcp-oauth-metadata.test.ts` and `tests/unit/mcp-oauth-discovery.test.ts` to expect the Supabase issuer and no `scopes_supported`. Leave merchant assertions unchanged.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-supabase-oauth-config.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/mcp-oauth-discovery.test.ts
```

Expected: FAIL because `supabase-oauth-config.ts` does not exist and current metadata points to the SmartMenu origin.

- [ ] **Step 3: Add the canonical OAuth configuration module**

Create `src/lib/mcp/supabase-oauth-config.ts`:

```ts
export const SUPERADMIN_MCP_PATH = '/api/mcp/mcp'
export const SUPERADMIN_MCP_CONSENT_PATH = '/superadmin/mcp/authorize'
export const SUPERADMIN_INTERNAL_SCOPE = 'superadmin'

export function getSupabaseOAuthIssuer(): string {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!projectUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  return `${projectUrl}/auth/v1`
}

export function getSuperadminMcpResource(origin: string): string {
  return `${origin.replace(/\/$/, '')}${SUPERADMIN_MCP_PATH}`
}

export function isSuperadminMcpAudience(
  audience: unknown,
  resource: string,
): boolean {
  return typeof audience === 'string'
    ? audience === resource
    : Array.isArray(audience) && audience.some((item) => item === resource)
}
```

Modify the superadmin builder in `src/lib/mcp/oauth-metadata.ts`:

```ts
import { getSupabaseOAuthIssuer, getSuperadminMcpResource } from '@/lib/mcp/supabase-oauth-config'

export interface ProtectedResourceMetadata {
  resource: string
  authorization_servers: string[]
  bearer_methods_supported: string[]
  scopes_supported?: string[]
}

export function buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: getSuperadminMcpResource(origin),
    authorization_servers: [getSupabaseOAuthIssuer()],
    bearer_methods_supported: ['header'],
  }
}
```

Do not change `buildMerchantProtectedResourceMetadata`.

- [ ] **Step 4: Add the audience-binding migration**

Create `supabase/migrations/20260831140000_superadmin_mcp_oauth_audience.sql`:

```sql
create or replace function public.superadmin_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
begin
  claims := event->'claims';

  if claims->>'client_id' is not null then
    claims := jsonb_set(
      claims,
      '{aud}',
      to_jsonb('https://www.webnegosyo.com/api/mcp/mcp'::text)
    );
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.superadmin_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.superadmin_mcp_access_token_hook(jsonb)
  from authenticated, anon, public;
```

The hook changes only OAuth-issued tokens because they contain `client_id`; normal SmartMenu browser sessions retain their existing audience.

- [ ] **Step 5: Run the metadata tests to verify GREEN**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-supabase-oauth-config.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/mcp-oauth-discovery.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/supabase-oauth-config.ts src/lib/mcp/oauth-metadata.ts tests/unit/mcp-supabase-oauth-config.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/mcp-oauth-discovery.test.ts supabase/migrations/20260831140000_superadmin_mcp_oauth_audience.sql
git commit -m "feat: point superadmin MCP OAuth at Supabase"
```

---

### Task 3: Verify Supabase OAuth Tokens and the Current Superadmin Role

**Files:**
- Create: `src/lib/mcp/superadmin-auth.ts`
- Create: `tests/unit/mcp-superadmin-auth.test.ts`

- [ ] **Step 1: Write the failing verifier tests**

Create `tests/unit/mcp-superadmin-auth.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals'
import { createSuperadminTokenVerifier } from '@/lib/mcp/superadmin-auth'

const RESOURCE = 'https://www.webnegosyo.com/api/mcp/mcp'
const VALID_CLAIMS = { sub: 'user_1', client_id: 'client_1', aud: RESOURCE }

function request(): Request {
  return new Request(RESOURCE, { method: 'POST' })
}

function makeClient(options: {
  claims?: Record<string, unknown> | null
  claimsError?: unknown
  roleRow?: { role: string } | null
  roleError?: unknown
} = {}) {
  const getClaims = jest.fn(async () => ({
    data: options.claims === null ? null : { claims: options.claims ?? VALID_CLAIMS },
    error: options.claimsError ?? null,
  }))
  const maybeSingle = jest.fn(async () => ({
    data: options.roleRow === undefined ? { role: 'superadmin' } : options.roleRow,
    error: options.roleError ?? null,
  }))
  const query: any = {}
  query.select = jest.fn(() => query)
  query.eq = jest.fn(() => query)
  query.maybeSingle = maybeSingle
  const from = jest.fn(() => query)
  return { client: { auth: { getClaims }, from } as never, getClaims, from, query }
}

it('authorizes an audience-bound OAuth token for a current superadmin', async () => {
  const stub = makeClient()
  const verify = createSuperadminTokenVerifier(stub.client)

  await expect(verify(request(), 'jwt-token')).resolves.toMatchObject({
    token: 'jwt-token',
    clientId: 'client_1',
    scopes: ['superadmin'],
    extra: { userId: 'user_1', role: 'superadmin' },
  })
  expect(stub.from).toHaveBeenCalledWith('app_users')
  expect(stub.query.eq).toHaveBeenCalledWith('user_id', 'user_1')
})

it('rejects a missing token before JWT or database work', async () => {
  const stub = makeClient()
  await expect(createSuperadminTokenVerifier(stub.client)(request())).resolves.toBeUndefined()
  expect(stub.getClaims).not.toHaveBeenCalled()
  expect(stub.from).not.toHaveBeenCalled()
})

it.each([
  ['ordinary browser token', { claims: { sub: 'user_1', aud: RESOURCE } }],
  ['wrong audience', { claims: { ...VALID_CLAIMS, aud: 'authenticated' } }],
  ['expired or invalid token', { claims: null, claimsError: { message: 'expired' } }],
])('rejects %s with no database dispatch', async (_label, options) => {
  const stub = makeClient(options)
  await expect(
    createSuperadminTokenVerifier(stub.client)(request(), 'jwt-token'),
  ).resolves.toBeUndefined()
  expect(stub.from).not.toHaveBeenCalled()
})

it.each([null, { role: 'admin' }])(
  'returns authenticated-but-unscoped context for non-superadmin row %p',
  async (roleRow) => {
    const stub = makeClient({ roleRow })
    const auth = await createSuperadminTokenVerifier(stub.client)(request(), 'jwt-token')
    expect(auth).toMatchObject({ clientId: 'client_1', scopes: [] })
  },
)

it('fails closed when the role lookup errors', async () => {
  const stub = makeClient({ roleError: { message: 'db down' } })
  await expect(
    createSuperadminTokenVerifier(stub.client)(request(), 'jwt-token'),
  ).resolves.toBeUndefined()
})

it('never writes the bearer token to rejection logs', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  const stub = makeClient({ claims: null, claimsError: { message: 'invalid' } })
  await createSuperadminTokenVerifier(stub.client)(request(), 'jwt-token')
  expect(JSON.stringify(warn.mock.calls)).not.toContain('jwt-token')
  warn.mockRestore()
})
```

- [ ] **Step 2: Run the verifier test to verify RED**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-superadmin-auth.test.ts
```

Expected: FAIL because `createSuperadminTokenVerifier` does not exist.

- [ ] **Step 3: Implement the verifier**

Create `src/lib/mcp/superadmin-auth.ts`:

```ts
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { Database } from '@/types/database'
import {
  getSuperadminMcpResource,
  isSuperadminMcpAudience,
  SUPERADMIN_INTERNAL_SCOPE,
} from '@/lib/mcp/supabase-oauth-config'
import { getOrigin } from '@/lib/mcp/oauth-config'

type TokenVerifier = (req: Request, token?: string) => Promise<AuthInfo | undefined>

export function createSuperadminTokenVerifier(
  client: SupabaseClient<Database>,
): TokenVerifier {
  return async (req, token) => {
    const requestId = req.headers.get('x-request-id') ?? randomUUID()
    if (!token) return reject(requestId, 'missing_token')

    const { data, error } = await client.auth.getClaims(token)
    const claims = data?.claims as Record<string, unknown> | undefined
    if (error || !claims) return reject(requestId, 'invalid_token')

    const userId = typeof claims.sub === 'string' ? claims.sub : null
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : null
    const resource = getSuperadminMcpResource(getOrigin(req))
    if (!userId || !clientId || !isSuperadminMcpAudience(claims.aud, resource)) {
      return reject(requestId, 'invalid_claims')
    }

    const { data: roleRow, error: roleError } = await client
      .from('app_users')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (roleError) return reject(requestId, 'role_lookup_failed')
    const isSuperadmin = roleRow?.role === 'superadmin'

    return {
      token,
      clientId,
      scopes: isSuperadmin ? [SUPERADMIN_INTERNAL_SCOPE] : [],
      extra: { userId, role: roleRow?.role ?? null },
    }
  }
}

function reject(requestId: string, reason: string): undefined {
  console.warn('[SmartMenu superadmin MCP auth rejected]', { requestId, reason })
  return undefined
}
```

- [ ] **Step 4: Run the verifier test to verify GREEN**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-superadmin-auth.test.ts
```

Expected: PASS, including the no-token-in-logs assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/superadmin-auth.ts tests/unit/mcp-superadmin-auth.test.ts
git commit -m "feat: verify Supabase OAuth superadmin tokens"
```

---

### Task 4: Protect the Entire Superadmin MCP Transport

**Files:**
- Modify: `src/lib/mcp/oauth-config.ts`
- Modify: `src/lib/mcp/request-auth.ts`
- Modify: `src/app/api/mcp/[transport]/route.ts`
- Modify: `src/lib/mcp/register-tools.ts`
- Modify: `src/lib/mcp/tool-discovery.ts`
- Modify: `src/app/api/mcp/merchant/[transport]/route.ts`
- Modify: `tests/unit/mcp-request-auth.test.ts`
- Modify: `tests/unit/mcp-register-tools.test.ts`
- Modify: `tests/unit/mcp-register-merchant-tools.test.ts`
- Modify: `tests/unit/mcp-tool-discovery.test.ts`

- [ ] **Step 1: Write failing transport and tool-security tests**

Add a standards-only challenge case to `tests/unit/mcp-request-auth.test.ts`:

```ts
it('protects initialize and emits only the standard resource_metadata challenge', async () => {
  const handler = jest.fn(async () => new Response('unexpected'))
  const wrapped = withSmartMenuAuth(handler, async () => undefined, {
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
    required: true,
    requiredScope: 'superadmin',
    challengeScope: false,
    includeAuthorizationUri: false,
  })

  const response = await wrapped(jsonRpcRequest('initialize'), {})
  expect(response.status).toBe(401)
  const challenge = response.headers.get('WWW-Authenticate')!
  expect(challenge).toContain('resource_metadata=')
  expect(challenge).not.toContain('authorization_uri=')
  expect(challenge).not.toContain('scope=')
  expect(handler).not.toHaveBeenCalled()
})
```

In `tests/unit/mcp-tool-discovery.test.ts`, define and pass the resource schemes explicitly in both existing test cases:

```ts
const SUPERADMIN_SCHEMES = [{ type: 'oauth2' as const, scopes: [] }]

const secured = await withSmartMenuToolSecurity(response, SUPERADMIN_SCHEMES)
expect(data.result.tools[0].securitySchemes).toEqual(SUPERADMIN_SCHEMES)
```

In `tests/unit/mcp-register-tools.test.ts`, change the expected superadmin scheme to `{ type: 'oauth2', scopes: [] }` and add:

```ts
expect(challenge).not.toContain('authorization_uri=')
expect(challenge).not.toContain('scope=')
```

Keep the existing merchant assertions in `tests/unit/mcp-register-merchant-tools.test.ts`: its scheme remains `{ type: 'oauth2', scopes: ['tenant_admin'] }` and its local challenge still includes `authorization_uri`.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-request-auth.test.ts tests/unit/mcp-register-tools.test.ts tests/unit/mcp-register-merchant-tools.test.ts tests/unit/mcp-tool-discovery.test.ts
```

Expected: FAIL because the challenge controls and resource-specific discovery adapter do not exist.

- [ ] **Step 3: Make Bearer challenge fields optional**

Extend `buildBearerChallenge` in `src/lib/mcp/oauth-config.ts`:

```ts
export function buildBearerChallenge(options: {
  origin: string
  resourceMetadataPath: string
  error: string
  description: string
  scope?: string
  includeAuthorizationUri?: boolean
}): string {
  const params = [
    `resource_metadata="${options.origin}${options.resourceMetadataPath}"`,
    ...(options.includeAuthorizationUri === false
      ? []
      : [`authorization_uri="${options.origin}${OAUTH_PATHS.authorize}"`]),
    ...(options.scope ? [`scope="${options.scope}"`] : []),
    `error="${options.error}"`,
    `error_description="${options.description}"`,
  ]
  return `Bearer ${params.join(', ')}`
}
```

Extend `SmartMenuAuthOptions` with:

```ts
challengeScope?: string | false
includeAuthorizationUri?: boolean
```

At the top of `withSmartMenuAuth`, derive the challenge scope once:

```ts
const requiredScope = options.requiredScope ?? 'superadmin'
const challengeScope = options.challengeScope === false
  ? undefined
  : options.challengeScope ?? requiredScope
```

Pass `challengeScope` and `options.includeAuthorizationUri` after `resourceMetadataPath` in both existing `oauthErrorResponse(...)` calls. Extend that helper and its challenge call exactly as follows:

```ts
function oauthErrorResponse(
  status: 401 | 403,
  error: 'invalid_token' | 'insufficient_scope',
  description: string,
  origin: string,
  resourceMetadataPath: string,
  scope?: string,
  includeAuthorizationUri?: boolean,
): Response {
  const challenge = buildBearerChallenge({
    origin,
    resourceMetadataPath,
    error,
    description,
    scope,
    includeAuthorizationUri,
  })

  return Response.json(
    { error, error_description: description },
    { status, headers: { 'WWW-Authenticate': challenge, 'Cache-Control': 'no-store' } },
  )
}
```

- [ ] **Step 4: Switch only the superadmin route to Supabase auth**

In `src/app/api/mcp/[transport]/route.ts`, replace the old verifier and optional handshake configuration:

```ts
import { createSuperadminTokenVerifier } from '@/lib/mcp/superadmin-auth'
import { SUPERADMIN_INTERNAL_SCOPE } from '@/lib/mcp/supabase-oauth-config'

const authHandler = withSmartMenuAuth(
  handler as unknown as McpRouteHandler,
  createSuperadminTokenVerifier(adminClient),
  {
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
    requiredScope: SUPERADMIN_INTERNAL_SCOPE,
    required: true,
    challengeScope: false,
    includeAuthorizationUri: false,
  },
)
```

This makes `initialize`, `ping`, `tools/list`, and `tools/call` uniformly protected. Do not change the merchant route's `required: false` behavior in this task.

- [ ] **Step 5: Make tool discovery resource-specific**

Change `withSmartMenuToolSecurity` to accept schemes:

```ts
export type McpSecurityScheme = { type: 'oauth2'; scopes: string[] }

export async function withSmartMenuToolSecurity(
  response: Response,
  schemes: readonly McpSecurityScheme[],
): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = await response.json() as unknown
    addSecuritySchemes(payload, schemes)
    return copyResponse(response, JSON.stringify(payload))
  }
  if (!contentType.includes('text/event-stream')) return response

  const body = await response.text()
  const securedBody = body
    .split('\n')
    .map((line) => secureSseDataLine(line, schemes))
    .join('\n')

  return copyResponse(response, securedBody)
}

function secureSseDataLine(
  line: string,
  schemes: readonly McpSecurityScheme[],
): string {
  if (!line.startsWith('data: ')) return line
  try {
    const payload = JSON.parse(line.slice('data: '.length)) as unknown
    addSecuritySchemes(payload, schemes)
    return `data: ${JSON.stringify(payload)}`
  } catch {
    return line
  }
}

function addSecuritySchemes(
  payload: unknown,
  schemes: readonly McpSecurityScheme[],
): void {
  if (!isRecord(payload) || !isRecord(payload.result) || !Array.isArray(payload.result.tools)) return
  for (const tool of payload.result.tools) {
    if (isRecord(tool)) tool.securitySchemes = schemes
  }
}
```

Add these constants beside each route handler and pass them at the existing discovery adapter call:

```ts
// src/app/api/mcp/[transport]/route.ts
const TOOL_SECURITY_SCHEMES = [{ type: 'oauth2' as const, scopes: [] }]

const securedResponse = isToolDiscovery
  ? await withSmartMenuToolSecurity(response, TOOL_SECURITY_SCHEMES)
  : response
```

```ts
// src/app/api/mcp/merchant/[transport]/route.ts
const TOOL_SECURITY_SCHEMES = [{ type: 'oauth2' as const, scopes: [MERCHANT_OAUTH_SCOPE] }]

const securedResponse = isToolDiscovery
  ? await withSmartMenuToolSecurity(response, TOOL_SECURITY_SCHEMES)
  : response
```

In `src/lib/mcp/register-tools.ts`, replace its superadmin coupling with:

```ts
import { buildBearerChallenge, OAUTH_PATHS } from '@/lib/mcp/oauth-config'
import { SUPERADMIN_INTERNAL_SCOPE } from '@/lib/mcp/supabase-oauth-config'

const OAUTH_SECURITY_SCHEMES = [{ type: 'oauth2' as const, scopes: [] }]

function authenticationRequired(): CallToolResult {
  return {
    content: [{ type: 'text', text: 'Authentication required.' }],
    isError: true,
    _meta: {
      'mcp/www_authenticate': [
        buildBearerChallenge({
          origin: SMARTMENU_ORIGIN,
          resourceMetadataPath: OAUTH_PATHS.protectedResourceMetadata,
          error: 'invalid_token',
          description: 'Authentication required',
          includeAuthorizationUri: false,
        }),
      ],
    },
  }
}
```

Replace `extra.authInfo?.scopes.includes(OAUTH_SCOPE)` with `extra.authInfo?.scopes.includes(SUPERADMIN_INTERNAL_SCOPE)`. Keep `src/lib/mcp/register-merchant-tools.ts` unchanged.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-request-auth.test.ts tests/unit/mcp-register-tools.test.ts tests/unit/mcp-register-merchant-tools.test.ts tests/unit/mcp-tool-discovery.test.ts tests/unit/mcp-superadmin-auth.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/oauth-config.ts src/lib/mcp/request-auth.ts src/app/api/mcp/\[transport\]/route.ts src/lib/mcp/register-tools.ts src/lib/mcp/tool-discovery.ts src/app/api/mcp/merchant/\[transport\]/route.ts tests/unit/mcp-request-auth.test.ts tests/unit/mcp-register-tools.test.ts tests/unit/mcp-register-merchant-tools.test.ts tests/unit/mcp-tool-discovery.test.ts
git commit -m "refactor: protect superadmin MCP with Supabase auth"
```

---

### Task 5: Add the Minimal Superadmin Consent Surface

**Files:**
- Create: `src/lib/mcp/superadmin-consent.ts`
- Create: `src/app/superadmin/mcp/authorize/page.tsx`
- Create: `src/app/api/mcp/supabase/decision/route.ts`
- Create: `tests/unit/mcp-superadmin-consent.test.ts`
- Modify: `src/middleware.ts`
- Modify: `tests/unit/mcp-route-isolation.test.ts`

- [ ] **Step 1: Write failing consent-service tests**

Create `tests/unit/mcp-superadmin-consent.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals'
import {
  decideSuperadminConsent,
  loadSuperadminConsent,
} from '@/lib/mcp/superadmin-consent'

function consentClient(options: {
  user?: { id: string } | null
  role?: string | null
  roleError?: unknown
  details?: unknown
  detailsError?: unknown
} = {}) {
  const query: any = {}
  query.select = jest.fn(() => query)
  query.eq = jest.fn(() => query)
  query.maybeSingle = jest.fn(async () => ({
    data: options.role === null ? null : { role: options.role ?? 'superadmin' },
    error: options.roleError ?? null,
  }))
  const details = options.details ?? {
    authorization_id: 'auth_1',
    client: { name: 'ChatGPT' },
    redirect_uri: 'https://chatgpt.com/callback',
    scope: 'openid',
  }
  const client: any = {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: options.user === null ? null : options.user ?? { id: 'user_1' } } })),
      oauth: {
        getAuthorizationDetails: jest.fn(async () => ({ data: details, error: options.detailsError ?? null })),
        approveAuthorization: jest.fn(async () => ({ data: { redirect_url: 'https://chatgpt.com/approved' }, error: null })),
        denyAuthorization: jest.fn(async () => ({ data: { redirect_url: 'https://chatgpt.com/denied' }, error: null })),
      },
    },
    from: jest.fn(() => query),
  }
  return client
}

const clientWithoutUser = () => consentClient({ user: null })
const clientForRole = (role: string) => consentClient({ role })
const clientForSuperadmin = () => consentClient()

it('redirects an anonymous visitor to superadmin login with authorization_id preserved', async () => {
  const result = await loadSuperadminConsent(clientWithoutUser(), 'auth_1')
  expect(result).toEqual({
    kind: 'login',
    href: '/superadmin/login?redirect=%2Fsuperadmin%2Fmcp%2Fauthorize%3Fauthorization_id%3Dauth_1',
  })
})

it('refuses consent details to a signed-in non-superadmin', async () => {
  await expect(loadSuperadminConsent(clientForRole('admin'), 'auth_1')).resolves.toEqual({
    kind: 'forbidden',
  })
})

it('returns client and scopes to a signed-in superadmin', async () => {
  await expect(loadSuperadminConsent(clientForSuperadmin(), 'auth_1')).resolves.toMatchObject({
    kind: 'consent',
    authorizationId: 'auth_1',
    clientName: 'ChatGPT',
    scopes: ['openid'],
  })
})

it.each(['approve', 'deny'] as const)('rechecks the role before %s', async (decision) => {
  const stub = clientForRole('admin')
  await expect(decideSuperadminConsent(stub, 'auth_1', decision)).resolves.toEqual({
    kind: 'forbidden',
  })
  expect(stub.auth.oauth.approveAuthorization).not.toHaveBeenCalled()
  expect(stub.auth.oauth.denyAuthorization).not.toHaveBeenCalled()
})

it('rejects a missing authorization ID without calling Supabase OAuth', async () => {
  const client = clientForSuperadmin()
  await expect(loadSuperadminConsent(client, '')).resolves.toEqual({
    kind: 'error', message: 'Missing authorization request.',
  })
  expect(client.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
})

it('returns a safe error for an invalid or expired request', async () => {
  const client = consentClient({ details: null, detailsError: { message: 'expired' } })
  await expect(loadSuperadminConsent(client, 'auth_1')).resolves.toEqual({
    kind: 'error', message: 'Invalid or expired authorization request.',
  })
})

it('uses Supabase redirect when authorization was already decided', async () => {
  const client = consentClient({ details: { redirect_url: 'https://chatgpt.com/already-decided' } })
  await expect(loadSuperadminConsent(client, 'auth_1')).resolves.toEqual({
    kind: 'redirect', href: 'https://chatgpt.com/already-decided',
  })
})

it.each([
  ['approve', 'https://chatgpt.com/approved'],
  ['deny', 'https://chatgpt.com/denied'],
] as const)('returns the Supabase redirect after %s', async (decision, href) => {
  await expect(decideSuperadminConsent(clientForSuperadmin(), 'auth_1', decision))
    .resolves.toEqual({ kind: 'redirect', href })
})
```

- [ ] **Step 2: Run the consent tests to verify RED**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-superadmin-consent.test.ts
```

Expected: FAIL because the consent service does not exist.

- [ ] **Step 3: Implement the consent service**

Create `src/lib/mcp/superadmin-consent.ts` with these exported result types and functions:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SUPERADMIN_MCP_CONSENT_PATH } from '@/lib/mcp/supabase-oauth-config'

type Client = SupabaseClient<Database>
export type ConsentDecision = 'approve' | 'deny'
export type ConsentView =
  | { kind: 'login'; href: string }
  | { kind: 'forbidden' }
  | { kind: 'redirect'; href: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'consent'
      authorizationId: string
      clientName: string
      redirectUri: string
      scopes: string[]
    }

async function currentSuperadmin(client: Client) {
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { user: null, allowed: false }
  const { data, error } = await client
    .from('app_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  return { user, allowed: !error && data?.role === 'superadmin' }
}

export async function loadSuperadminConsent(
  client: Client,
  authorizationId: string,
): Promise<ConsentView> {
  if (!authorizationId) return { kind: 'error', message: 'Missing authorization request.' }
  const identity = await currentSuperadmin(client)
  if (!identity.user) {
    const target = `${SUPERADMIN_MCP_CONSENT_PATH}?authorization_id=${encodeURIComponent(authorizationId)}`
    return { kind: 'login', href: `/superadmin/login?redirect=${encodeURIComponent(target)}` }
  }
  if (!identity.allowed) return { kind: 'forbidden' }

  const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) return { kind: 'error', message: 'Invalid or expired authorization request.' }
  if (!('authorization_id' in data)) return { kind: 'redirect', href: data.redirect_url }
  return {
    kind: 'consent',
    authorizationId,
    clientName: data.client.name,
    redirectUri: data.redirect_uri,
    scopes: data.scope?.split(/\s+/).filter(Boolean) ?? [],
  }
}

export async function decideSuperadminConsent(
  client: Client,
  authorizationId: string,
  decision: ConsentDecision,
) {
  if (!authorizationId) return { kind: 'error' as const, message: 'Missing authorization request.' }
  const identity = await currentSuperadmin(client)
  if (!identity.user || !identity.allowed) return { kind: 'forbidden' as const }
  const result = decision === 'approve'
    ? await client.auth.oauth.approveAuthorization(authorizationId)
    : await client.auth.oauth.denyAuthorization(authorizationId)
  if (result.error || !result.data) {
    return { kind: 'error' as const, message: 'Authorization decision failed.' }
  }
  return { kind: 'redirect' as const, href: result.data.redirect_url }
}
```

- [ ] **Step 4: Implement the page and POST route**

Create `src/app/superadmin/mcp/authorize/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadSuperadminConsent } from '@/lib/mcp/superadmin-consent'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ authorization_id?: string }>
}

export default async function SuperadminMcpAuthorizePage({ searchParams }: Props) {
  const { authorization_id: authorizationId = '' } = await searchParams
  const view = await loadSuperadminConsent(await createClient(), authorizationId)
  if (view.kind === 'login' || view.kind === 'redirect') redirect(view.href)

  if (view.kind === 'forbidden' || view.kind === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-xl font-semibold">Connection unavailable</h1>
          <p className="mt-2 text-sm text-white/60">
            {view.kind === 'forbidden'
              ? 'This account cannot authorize the superadmin MCP connection.'
              : view.message}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">SmartMenu MCP</p>
        <h1 className="mt-3 text-2xl font-semibold">Authorize {view.clientName}</h1>
        <p className="mt-2 text-sm text-white/60">
          This gives the client access to SmartMenu superadmin tools.
        </p>
        <dl className="mt-6 space-y-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          <div><dt className="text-white/45">Returns to</dt><dd className="mt-1 break-all">{new URL(view.redirectUri).host}</dd></div>
          <div><dt className="text-white/45">Requested scopes</dt><dd className="mt-1">{view.scopes.join(', ') || 'No named scopes'}</dd></div>
        </dl>
        <form action="/api/mcp/supabase/decision" method="post" className="mt-6 flex gap-3">
          <input type="hidden" name="authorization_id" value={view.authorizationId} />
          <button className="flex-1 rounded-lg border border-white/15 px-4 py-2 text-sm" name="decision" value="deny">Deny</button>
          <button className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black" name="decision" value="approve">Approve</button>
        </form>
      </section>
    </main>
  )
}
```

`src/app/api/mcp/supabase/decision/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decideSuperadminConsent } from '@/lib/mcp/superadmin-consent'

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData()
  const authorizationId = form.get('authorization_id')
  const rawDecision = form.get('decision')
  if (typeof authorizationId !== 'string' || (rawDecision !== 'approve' && rawDecision !== 'deny')) {
    return Response.json({ error: 'Invalid authorization decision.' }, { status: 400 })
  }

  const result = await decideSuperadminConsent(
    await createClient(),
    authorizationId,
    rawDecision,
  )
  if (result.kind === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (result.kind === 'error') return Response.json({ error: result.message }, { status: 400 })
  return NextResponse.redirect(result.href, 303)
}
```

Add the exact clause below to the `isPublicRoute` expression in `src/middleware.ts` so the page—not middleware—owns the preserving login redirect. The page still verifies its user and role:

```ts
pathname === '/superadmin/mcp/authorize' ||
```

Add this case to `tests/unit/mcp-route-isolation.test.ts`:

```ts
expect(isMcpProtocolRoute('/api/mcp/supabase/decision')).toBe(true)
```

- [ ] **Step 5: Run consent and route-isolation tests to verify GREEN**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-superadmin-consent.test.ts tests/unit/mcp-route-isolation.test.ts
npx tsc --noEmit
```

Expected: focused tests pass and the new Supabase OAuth APIs typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/superadmin-consent.ts src/app/superadmin/mcp/authorize/page.tsx src/app/api/mcp/supabase/decision/route.ts src/middleware.ts tests/unit/mcp-superadmin-consent.test.ts tests/unit/mcp-route-isolation.test.ts
git commit -m "feat: add superadmin MCP OAuth consent"
```

---

### Task 6: Retire the Legacy Superadmin OAuth Branch Without Touching Merchant Auth

**Files:**
- Modify: `src/app/api/mcp/oauth/authorize/route.ts`
- Modify: `src/app/api/mcp/oauth/token/route.ts`
- Modify: `src/lib/mcp/oauth-metadata.ts`
- Modify: `src/lib/mcp/mcp-path-well-known.ts`
- Modify: `next.config.ts`
- Modify: `tests/unit/mcp-merchant-oauth.test.ts`
- Modify: `tests/unit/mcp-oauth-metadata.test.ts`
- Modify: `tests/unit/mcp-oauth-discovery.test.ts`
- Modify: `tests/unit/mcp-connect-url.test.ts`
- Create: `tests/unit/mcp-legacy-oauth-routes.test.ts`

- [ ] **Step 1: Write failing cutover and merchant-preservation tests**

Create `tests/unit/mcp-legacy-oauth-routes.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals'
import { buildAuthorizationServerMetadata } from '@/lib/mcp/oauth-metadata'
import { isSupportedMerchantScope } from '@/app/api/mcp/oauth/authorize/route'
import { resolveMerchantTokenAudience } from '@/app/api/mcp/oauth/token/route'

describe('remaining SmartMenu OAuth issuer', () => {
  it('advertises merchant authority only', () => {
    expect(buildAuthorizationServerMetadata('https://www.webnegosyo.com').scopes_supported)
      .toEqual(['tenant_admin', 'offline_access'])
  })

  it('rejects the retired superadmin scope', () => {
    expect(isSupportedMerchantScope('superadmin')).toBe(false)
    expect(isSupportedMerchantScope('tenant_admin offline_access')).toBe(true)
  })

  it('defaults a resource-less token exchange to the merchant resource', () => {
    expect(resolveMerchantTokenAudience('https://www.webnegosyo.com', undefined)).toBe(
      'https://www.webnegosyo.com/api/mcp/merchant/mcp',
    )
    expect(resolveMerchantTokenAudience(
      'https://www.webnegosyo.com',
      'https://www.webnegosyo.com/api/mcp/mcp',
    )).toBeNull()
  })
})
```

Replace the superadmin MCP-path cases in `tests/unit/mcp-oauth-discovery.test.ts` with:

```ts
it('no longer rewrites superadmin MCP-path authorization-server or JWKS probes', () => {
  expect(rewriteMcpPathWellKnown('/api/mcp/mcp/.well-known/oauth-authorization-server')).toBeNull()
  expect(rewriteMcpPathWellKnown('/api/mcp/mcp/.well-known/jwks.json')).toBeNull()
})

it('preserves merchant MCP-path discovery rewrites', () => {
  expect(rewriteMcpPathWellKnown('/api/mcp/merchant/mcp/.well-known/oauth-authorization-server'))
    .toBe('/.well-known/oauth-authorization-server')
})
```

In `tests/unit/mcp-merchant-oauth.test.ts`, delete the two cases named “persists tenant_id null on a superadmin authorization code” and “keeps tenant_id null across superadmin token issuance”; those cases describe a route authority that no longer exists. Retain all tenant-binding cases.

- [ ] **Step 2: Run the legacy/merchant tests to verify RED**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-legacy-oauth-routes.test.ts tests/unit/mcp-merchant-oauth.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/mcp-oauth-discovery.test.ts tests/unit/mcp-connect-url.test.ts
```

Expected: FAIL because the local issuer still advertises and accepts `superadmin`, and the superadmin compatibility rewrites remain.

- [ ] **Step 3: Make the custom authorization server merchant-only**

In `src/app/api/mcp/oauth/authorize/route.ts`, remove the `OAUTH_SCOPE` import and replace the scope/resource/role branch with the following exact boundary. Keep the existing client registration, redirect URI, PKCE, code issuance, and error-response code around it:

```ts
export function isSupportedMerchantScope(scope: string): boolean {
  const requested = scope.split(/\s+/).filter(Boolean)
  const allowed = new Set([MERCHANT_OAUTH_SCOPE, OAUTH_OFFLINE_SCOPE])
  return requested.includes(MERCHANT_OAUTH_SCOPE) && requested.every((item) => allowed.has(item))
}

// Inside GET:
const scope = params.get('scope') ?? MERCHANT_OAUTH_SCOPE

if (!isSupportedMerchantScope(scope)) {
  return redirectError(validatedRedirectUri, 'invalid_scope', 'Unsupported or missing OAuth scope', state)
}

const origin = getOrigin(req)
const expectedResource = `${origin}${MERCHANT_OAUTH_PATHS.mcp}`
if (resource && resource !== expectedResource) {
  return redirectError(validatedRedirectUri, 'invalid_target', 'resource does not match the SmartMenu merchant MCP endpoint', state)
}

const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
let tenantId: string | null = null
if (user) {
  const { data: roleRow } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const appUser = roleRow as { role: string; tenant_id: string | null } | null
  const mcpEnabled = appUser?.tenant_id ? await isTenantMcpEnabled(appUser.tenant_id) : false
  if (isMerchantAuthorized(appUser, mcpEnabled)) tenantId = appUser!.tenant_id
}

if (!user || !tenantId) {
  const returnTo = `${url.pathname}${url.search}`
  const loginUrl = new URL('/login', url.origin)
  loginUrl.searchParams.set('redirect', returnTo)
  if (user) loginUrl.searchParams.set('unauthorized', '1')
  return Response.redirect(loginUrl.toString(), 302)
}
```

In `src/app/api/mcp/oauth/token/route.ts`, remove the `OAUTH_PATHS` import, add this helper, and use it in `POST` before building `tokenOpts`:

```ts
export function resolveMerchantTokenAudience(
  origin: string,
  resource: string | undefined,
): string | null {
  const merchantAudience = `${origin}${MERCHANT_OAUTH_PATHS.mcp}`
  return !resource || resource === merchantAudience ? merchantAudience : null
}

// Inside POST:
const audience = resolveMerchantTokenAudience(origin, params.resource)
if (!audience) {
  return oauthError('invalid_target', 'resource does not match the SmartMenu merchant MCP endpoint', 400)
}
```

Keep both authorization-code and refresh-token calls unchanged; they now always receive the merchant audience from this boundary.

In `buildAuthorizationServerMetadata`, publish only:

```ts
scopes_supported: [MERCHANT_OAUTH_SCOPE, OAUTH_OFFLINE_SCOPE]
```

Do not delete `oauth-service.ts`, `oauth-jwt.ts`, the local JWKS route, registration route, or OAuth tables.

- [ ] **Step 4: Remove only superadmin compatibility rewrites**

Replace the matcher and function body in `src/lib/mcp/mcp-path-well-known.ts` with:

```ts
const MERCHANT_MCP_PATH_WELL_KNOWN =
  /^\/api\/mcp\/merchant(?:\/mcp)?\/\.well-known\/(oauth-authorization-server|openid-configuration|oauth-protected-resource|jwks\.json)(\/.*)?$/

export function rewriteMcpPathWellKnown(pathname: string): string | null {
  const match = pathname.match(MERCHANT_MCP_PATH_WELL_KNOWN)
  if (!match) return null
  const document = match[1]
  if (document === 'oauth-protected-resource') {
    return '/.well-known/oauth-protected-resource/api/mcp/merchant'
  }
  if (document === 'jwks.json') return '/.well-known/jwks.json'
  return `/.well-known/${document}`
}
```

Replace the MCP portion of `next.config.ts`'s `rewrites()` result with only these entries:

```ts
{
  source: '/api/mcp/merchant/mcp/.well-known/oauth-authorization-server',
  destination: '/.well-known/oauth-authorization-server',
},
{
  source: '/api/mcp/merchant/mcp/.well-known/openid-configuration',
  destination: '/.well-known/openid-configuration',
},
{
  source: '/api/mcp/merchant/mcp/.well-known/oauth-protected-resource',
  destination: '/.well-known/oauth-protected-resource/api/mcp/merchant',
},
{
  source: '/api/mcp/merchant/mcp/.well-known/jwks.json',
  destination: '/.well-known/jwks.json',
},
{
  source: '/api/mcp/merchant/.well-known/oauth-authorization-server/:path*',
  destination: '/.well-known/oauth-authorization-server',
},
{
  source: '/api/mcp/merchant/.well-known/openid-configuration/:path*',
  destination: '/.well-known/openid-configuration',
},
{
  source: '/api/mcp/merchant/.well-known/oauth-protected-resource/:path*',
  destination: '/.well-known/oauth-protected-resource/api/mcp/merchant',
},
```

The standard superadmin discovery routes that remain are:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/api/mcp/mcp`

- [ ] **Step 5: Run legacy/merchant tests to verify GREEN**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-legacy-oauth-routes.test.ts tests/unit/mcp-merchant-oauth.test.ts tests/unit/mcp-merchant-auth.test.ts tests/unit/mcp-merchant-discovery.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/mcp-oauth-discovery.test.ts tests/unit/mcp-connect-url.test.ts
```

Expected: PASS. Merchant keys, OAuth, tenant binding, and discovery remain unchanged except that the local issuer no longer claims superadmin authority.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp/oauth/authorize/route.ts src/app/api/mcp/oauth/token/route.ts src/lib/mcp/oauth-metadata.ts src/lib/mcp/mcp-path-well-known.ts next.config.ts tests/unit/mcp-legacy-oauth-routes.test.ts tests/unit/mcp-merchant-oauth.test.ts tests/unit/mcp-oauth-metadata.test.ts tests/unit/mcp-oauth-discovery.test.ts tests/unit/mcp-connect-url.test.ts
git commit -m "refactor: retire legacy superadmin OAuth issuer"
```

---

### Task 7: Document the Production Cutover and Run Contract Checks

**Files:**
- Create: `docs/runbooks/superadmin-mcp-oauth.md`
- Modify only if verification reveals a standards violation: files from Tasks 2–6, with a new failing regression test first.

- [ ] **Step 1: Write the production runbook**

Create `docs/runbooks/superadmin-mcp-oauth.md` with these exact settings:

```md
# Superadmin MCP OAuth Operations

## Supabase dashboard

1. Authentication > OAuth Server: enable OAuth 2.1 server.
2. Enable Dynamic Client Registration.
3. Set Authorization Path to `/superadmin/mcp/authorize`.
4. Authentication > Signing Keys: use an asymmetric signing key (RS256 or ES256).
5. Authentication > Hooks: enable the Postgres Custom Access Token hook
   `public.superadmin_mcp_access_token_hook`.
6. Authentication > URL Configuration: production Site URL is
   `https://www.webnegosyo.com`.

## Public contract probes

- Supabase authorization metadata returns 200.
- SmartMenu protected-resource metadata names the exact resource and Supabase issuer.
- An unauthenticated MCP initialize request returns 401 with `resource_metadata`.
- The challenge contains neither a local `authorization_uri` nor a custom scope.
- A normal SmartMenu browser JWT is rejected by MCP.
- Removing `app_users.role = superadmin` causes the next MCP request to return 403.

## Client smoke test

For ChatGPT, Claude, and Grok: remove the old connection, add
`https://www.webnegosyo.com/api/mcp/mcp`, complete browser login and consent,
list tools, and call one read-only tool (`list_tenants`). Record date, client,
result, and request ID. No client-specific headers or server URL variants are allowed.
```

- [ ] **Step 2: Run the complete local MCP regression suite**

Run:

```bash
npm test -- --runInBand tests/unit/mcp-*.test.ts
npx tsc --noEmit
npm run lint -- src/lib/mcp src/app/api/mcp src/app/superadmin/mcp tests/unit/mcp-*.test.ts
```

Expected: all MCP tests pass; typecheck and lint introduce no new failures.

- [ ] **Step 3: Commit the operational runbook**

```bash
git add docs/runbooks/superadmin-mcp-oauth.md
git commit -m "docs: add superadmin MCP OAuth runbook"
```

---

## Deployment Checkpoint (Requires Production Authority)

The implementation executor stops here unless the user separately authorizes production deployment and the required Supabase/Vercel credentials are available. The access-token hook intentionally binds tokens to the production resource, so a preview-origin end-to-end OAuth test is not valid. A preview deployment may test rendering and unauthenticated `401` behavior only.

- [ ] Apply `supabase/migrations/20260831140000_superadmin_mcp_oauth_audience.sql` through the normal migration workflow.
- [ ] Deploy the application to production.
- [ ] Enable the Supabase OAuth Server settings listed in the runbook. Until this is done, the live Supabase discovery response remains `404 feature_disabled`.
- [ ] Probe the production standards contract:

```bash
curl -i https://www.webnegosyo.com/.well-known/oauth-protected-resource
curl -i https://www.webnegosyo.com/.well-known/oauth-protected-resource/api/mcp/mcp
curl -i https://www.webnegosyo.com/api/mcp/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
```

Expected:

- both metadata responses are `200` and name the Supabase issuer;
- initialize is `401`;
- `WWW-Authenticate` contains `resource_metadata` only, with no token or client-specific authorization URL.

- [ ] Perform ChatGPT, Claude, and Grok smoke tests:

For each client:

1. Delete any cached SmartMenu connector and old credential.
2. Add exactly `https://www.webnegosyo.com/api/mcp/mcp`.
3. Confirm the browser reaches the existing superadmin login, then the consent card.
4. Approve and confirm the client reconnects.
5. List tools.
6. Call `list_tenants` only.
7. Record the result in the runbook's verification log.

Expected: all three clients use the same flow and no client-specific server behavior is added.

- [ ] Verify immediate role revocation:

Using a test superadmin connection:

1. Change the test account role away from `superadmin`.
2. Repeat `list_tenants` without reconnecting.
3. Confirm HTTP `403` and no tool execution.
4. Restore the test account role.

Expected: the already-issued token no longer grants MCP access. Record each production result and request ID in the runbook verification log in a follow-up evidence commit.

---

## Final Verification Checklist

- [ ] The superadmin protected resource points only to the Supabase Auth issuer.
- [ ] Supabase owns dynamic registration, authorization codes, access tokens, refresh tokens, rotation, and JWKS.
- [ ] SmartMenu accepts only Supabase OAuth tokens carrying both `client_id` and the exact MCP audience.
- [ ] Current database role is checked on every request.
- [ ] Missing/invalid token returns `401`; valid non-superadmin returns `403`.
- [ ] All MCP methods, including initialize and tools/list, require authentication.
- [ ] Tool security metadata does not request the retired custom `superadmin` OAuth scope.
- [ ] No superadmin API key or local OAuth token authenticates `/api/mcp/mcp`.
- [ ] Merchant key and OAuth behavior remains covered and passing.
- [ ] Logs contain request ID and reason only, never credentials.
- [ ] ChatGPT, Claude, and Grok pass the same deployed smoke test.
