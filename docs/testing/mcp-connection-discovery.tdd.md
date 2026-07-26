# MCP connection failures — OAuth discovery + transport CORS

Source plan: none. Journeys were derived during this TDD run from the reported
symptom "the MCP connection isn't always working, it's always showing an error;
we're not able to connect the MCP to GPT or other AI".

## Diagnosis

Production (`https://www.webnegosyo.com`) was healthy on every surface previously
verified: `/.well-known/oauth-{protected-resource,authorization-server}` returned
200, DCR returned 201, and `/api/mcp/mcp` returned 401 with a `WWW-Authenticate`
header carrying the `resource_metadata` hint. That is why **Claude connects**.

The failure is specific to clients that **construct the discovery URL themselves**
instead of following the `resource_metadata` hint. RFC 9728 §3.1 and RFC 8414 §3.1
require inserting the well-known segment *between host and resource path*:

```
resource:  https://www.webnegosyo.com/api/mcp/mcp
metadata:  https://www.webnegosyo.com/.well-known/oauth-protected-resource/api/mcp/mcp
```

Only the root path was served, so every path-suffixed probe 404'd:

| Probed URL (pre-fix) | Status |
|---|---|
| `/.well-known/oauth-protected-resource` | 200 |
| `/.well-known/oauth-protected-resource/api/mcp/mcp` | **404** |
| `/.well-known/oauth-authorization-server` | 200 |
| `/.well-known/oauth-authorization-server/api/mcp/mcp` | **404** |
| `/.well-known/openid-configuration` | **404** |
| `/.well-known/openid-configuration/api/mcp/mcp` | **404** |

Secondary defect: `/api/mcp/mcp` answered `OPTIONS` with a bare `204` carrying no
`Access-Control-*` headers (Next's implicit handler), so any browser-hosted MCP
client failed preflight before its first JSON-RPC message. Discovery metadata
already sent CORS; the transport did not.

Third issue — **operator configuration, not a code defect**: the apex host
307-redirects to `www`. Many MCP clients do not follow redirects on `POST`.
The connect URL must be `https://www.webnegosyo.com/api/mcp/mcp`.

## User journeys

1. As an operator connecting ChatGPT (or any spec-compliant MCP client), I want
   OAuth discovery to succeed at the RFC 9728 path-suffixed URL, so the connector
   finds the authorization server instead of erroring.
2. As an operator using a browser-based MCP client, I want the MCP endpoint to
   answer CORS preflight, so the connection isn't blocked before it starts.

## Task report

### Task 1 — Serve discovery metadata at the spec path-suffixed URLs

Extracted `buildProtectedResourceMetadata` / `buildAuthorizationServerMetadata`
into `src/lib/mcp/oauth-metadata.ts` so one document can be served from several
URLs without duplication, then added `[...path]` catch-all routes for both OAuth
documents plus root and path-suffixed `/.well-known/openid-configuration`.

- RED: `npx jest tests/unit/mcp-oauth-discovery.test.ts` →
  `Cannot find module '../../src/app/.well-known/oauth-protected-resource/[...path]/route'`
- GREEN: same command → `Tests: 6 passed`
- Guaranteed: the path-suffixed document is byte-identical to the root document,
  so a client cannot get a different answer depending on which URL it probes.

### Task 2 — CORS on the MCP transport

Added `src/lib/mcp/cors.ts` (`MCP_CORS_HEADERS`, `withCorsHeaders`,
`corsPreflightResponse`) and wired it into `src/app/api/mcp/[transport]/route.ts`:
an explicit `OPTIONS` export plus a wrapper that echoes CORS on every response.
`mcp-session-id` and `WWW-Authenticate` are exposed so a browser client can read
its session and follow the 401 discovery hint.

- RED: `npx jest tests/unit/mcp-cors.test.ts` → `Cannot find module '@/lib/mcp/cors'`
- GREEN: same command → `Tests: 3 passed`
- Guaranteed: the wrapper preserves status, statusText, and pre-existing headers
  (verified specifically against a 401 carrying `WWW-Authenticate`), and streams
  the body through unbuffered.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Path-suffixed protected-resource metadata (RFC 9728 §3.1) is identical to the root document | `mcp-oauth-discovery.test.ts:serves the same metadata at the path-suffixed URL as at the root URL` | unit | PASS | `npx jest tests/unit/mcp-oauth-discovery.test.ts` |
| 2 | Path-suffixed authorization-server metadata (RFC 8414 §3.1) is identical to the root document | `mcp-oauth-discovery.test.ts:serves the same metadata at the path-suffixed URL as at the root URL` | unit | PASS | same |
| 3 | OIDC discovery serves the AS metadata at root and path-suffixed URLs | `mcp-oauth-discovery.test.ts:serves the authorization-server metadata at the root and path-suffixed OIDC URLs` | unit | PASS | same |
| 4 | CORS allows the headers an MCP client sends (authorization, content-type, mcp-protocol-version, mcp-session-id) | `mcp-cors.test.ts:allows the headers an MCP client actually sends` | unit | PASS | `npx jest tests/unit/mcp-cors.test.ts` |
| 5 | `mcp-session-id` and `WWW-Authenticate` are exposed to the client | `mcp-cors.test.ts:exposes mcp-session-id…` / `…exposes WWW-Authenticate…` | unit | PASS | same |
| 6 | All Streamable HTTP methods (GET/POST/DELETE/OPTIONS) are allowed | `mcp-cors.test.ts:allows the methods the Streamable HTTP transport uses` | unit | PASS | same |
| 7 | Adding CORS preserves status and existing headers, including a 401's `WWW-Authenticate` | `mcp-cors.test.ts:adds CORS headers while preserving status and existing headers` | unit | PASS | same |
| 8 | Preflight answers 204 with the full CORS header set | `mcp-cors.test.ts:answers preflight with 204 and the full CORS header set` | unit | PASS | same |

## Integration verification (route wiring, live dev server)

Route handlers are the surface unit tests cannot cover, so they were exercised
against `npm run dev` on `localhost:3000`:

```
/.well-known/oauth-protected-resource                    200
/.well-known/oauth-protected-resource/api/mcp/mcp        200   (was 404)
/.well-known/oauth-authorization-server                  200
/.well-known/oauth-authorization-server/api/mcp/mcp      200   (was 404)
/.well-known/openid-configuration                        200   (was 404)
/.well-known/openid-configuration/api/mcp/mcp            200   (was 404)
```

`OPTIONS /api/mcp/mcp` → `204` with `access-control-allow-origin: *`,
`allow-methods: GET, POST, DELETE, OPTIONS`,
`expose-headers: mcp-session-id, WWW-Authenticate`.

`POST /api/mcp/mcp` unauthenticated → `401` with **both** the CORS headers and
the original `www-authenticate: Bearer error="invalid_token", …
resource_metadata="…"`, confirming the wrapper does not clobber the discovery hint.

## Coverage and known gaps

`npx jest tests/unit/mcp-cors.test.ts tests/unit/mcp-oauth-discovery.test.ts --coverage`
over the two new modules: **100% statements / branches / functions / lines**.

Full unit suite: **196 suites, 2333 tests, all passing.** `tsc --noEmit` and
`eslint` report zero errors for every file touched here (pre-existing type errors
in unrelated test files are untouched).

Known gaps:

- An **authenticated** `tools/list` through the new CORS wrapper was not executed
  end to end; doing so requires minting a temporary key into the production
  `mcp_api_keys` table. The 401 path proves status/header/body passthrough, and
  `disableSse: true` means responses are plain JSON rather than streams, so the
  residual risk is low — but it is not zero until a real connector reconnects.
- The apex→`www` redirect is unchanged and intentional. It is a documentation
  concern, not a code fix.

## Merge evidence

- RED checkpoint: `03de641` — *test: add reproducers for MCP discovery 404s and missing transport CORS*
- GREEN checkpoint: `6e6709f` — *fix: serve MCP OAuth discovery at spec path-suffixed URLs and add transport CORS*
- Refactor: none required; the extraction into `oauth-metadata.ts` was part of the
  GREEN commit because it is what makes the multi-URL serving non-duplicative.

## Operator note — after deploying

MCP clients cache `tools/list` and discovery results at connect time. An existing
broken connector will not heal on its own: **remove and re-add the connector** so
it re-runs discovery. Connect URL is `https://www.webnegosyo.com/api/mcp/mcp`
(the `www` host — the apex 307-redirects and many clients will not follow it on POST).
