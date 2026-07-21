# SmartMenu MCP

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets a superadmin drive tenant provisioning — create a tenant, build its menu (categories, items, addon library, upsells, bundles), set branding, and configure integrations — from **any MCP-capable AI** (Claude or ChatGPT), with no browser session.

It is hosted **inside this Next.js app** at `/api/mcp/[transport]` (Streamable HTTP), so one Bearer-keyed URL works for both Claude remote connectors and ChatGPT custom connectors.

## Endpoint

```
https://<your-platform-domain>/api/mcp/mcp
```

Auth is a single `Authorization: Bearer <key>` header. The key is a superadmin-minted API key (`smk_live_…`). Only its SHA-256 hash is stored server-side; an invalid, absent, or revoked key returns **401**.

## 1. Mint a key

```bash
node scripts/mint-mcp-key.mjs "Angelo's laptop – Claude"
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (read from `.env.local`). The plaintext key is printed **once** — store it in a password manager. It cannot be recovered; mint a new one if lost.

Revoke a key at any time:

```sql
UPDATE mcp_api_keys SET revoked_at = now() WHERE id = '<key-id>';
```

## 2. Connect Claude

**Claude web/desktop → Settings → Connectors → Add custom connector:**

- **Name:** SmartMenu
- **URL:** `https://<your-platform-domain>/api/mcp/mcp`
- **Authentication:** Bearer token → paste the `smk_live_…` key

Claude Code (CLI):

```bash
claude mcp add --transport http smartmenu https://<your-platform-domain>/api/mcp/mcp \
  --header "Authorization: Bearer smk_live_…"
```

## 3. Connect ChatGPT

**ChatGPT → Settings → Connectors → Create → Custom connector (MCP):**

- **MCP Server URL:** `https://<your-platform-domain>/api/mcp/mcp`
- **Authentication:** Bearer / Access token → paste the `smk_live_…` key

## Tools

Every tool is dispatched through the shared provisioning-ops registry (`src/lib/mcp/provisioning-ops.ts`), validated with Zod, and executed with a service-role client. Writers are the same ones the web admin uses — the MCP path just injects a `ProvisioningCtx` so cookie auth is skipped (the Bearer key already proves superadmin authority).

| Tool | What it does | Key input |
|---|---|---|
| `create_tenant` | Create a white-labeled tenant | `name, slug, primary_color, secondary_color, messenger_page_id` |
| `add_category` | Add a menu category | `tenantId, name, order` |
| `add_menu_item` | Add a menu item (variations/addons) | `tenantId, name, price, category_id` |
| `add_addon_library_entry` | Reusable shared addon group | `tenantId, …` |
| `create_upsell_pair` | Complementary / upgrade pair | `tenantId, …` |
| `create_bundle` | Fixed or discount bundle | `tenantId, …` |
| `add_payment_method` | Payment method + order-type links | `tenantId, name` |
| `update_branding` | Colors, templates, hero, footer | `tenantId, tenantSlug, branding{…}` |
| `configure_integration` | Lalamove, distance delivery, feature flags, Convex | `tenantId, …tenant fields` |
| `list_tenants` | List tenants | — |
| `get_tenant` | Fetch a tenant by slug | `slug` |

Deep field validation lives in the underlying service writers (single source of truth); each tool's advertised schema guards the envelope shape.

## Architecture

```
AI (Claude/ChatGPT)
   │  Authorization: Bearer smk_live_…
   ▼
/api/mcp/[transport]/route.ts   ── withMcpAuth → createMcpTokenVerifier → verifyMcpKey (hash lookup) → 401 on failure
   │  createMcpHandler(registerProvisioningTools(server, ctx))
   ▼
registerProvisioningTools        ── one MCP tool per op, tools/call → executeOp
   ▼
provisioning-ops registry        ── validate envelope → dispatch to service writer(ctx)
   ▼
service writers (+ ProvisioningCtx: service-role client, bypasses RLS)
   ▼
Supabase
```

## Security notes

- Keys are `superadmin`-scoped. Anyone holding a key can create/modify any tenant — treat it like a root credential.
- The `mcp_api_keys` table is RLS-protected (superadmin-only); the service-role client used by the server bypasses RLS by design, gated by the Bearer check.
- Rotate keys periodically; revoke immediately if a key may be exposed.
- The endpoint requires HTTPS in production. Do not paste keys into shared chats or logs.
