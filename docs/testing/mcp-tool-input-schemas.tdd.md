# TDD Evidence — MCP tool input schemas (create_tenant uncallable via connector)

## Source plan
No `*.plan.md`. Journey derived from the bug report: the WebNegosyo MCP connector
errored and "could not access the `create_tenant` action", so no tenant was created
and no products were added.

## User journey
> As a superadmin using the WebNegosyo MCP connector (Claude/ChatGPT), I want to call
> `create_tenant` with the restaurant's name, slug, colors, and Messenger page id, so
> that the tenant is actually created and I can then populate its menu.

## Root cause
The MCP SDK (`@modelcontextprotocol/sdk` 1.26) derives each tool's client-visible
JSON schema by running the op's Zod `input` through `normalizeObjectSchema`. That
helper only recognizes **raw shapes** and **ZodObjects**; any other Zod type
normalizes to `undefined`, and the SDK then advertises an empty
`{ type: 'object', properties: {} }` (`EMPTY_OBJECT_JSON_SCHEMA`).

`src/lib/mcp/provisioning-ops.ts` was advertising:
- `create_tenant` → `z.record(...)` (ZodRecord)
- `add_category`, `add_menu_item`, `add_addon_library_entry`, `create_upsell_pair`,
  `create_bundle`, `configure_integration` → `z.object({tenantId}).and(...)` (ZodIntersection)
- `list_tenants` → `z.object({}).optional().or(...)` (ZodUnion)

All eight normalized to `undefined` → advertised as parameterless tools. The model
called `create_tenant` with `{}`, and deep validation (`tenantSchema`) rejected it →
the connector reported it "could not access" the action.

## Fix
Convert these envelopes to **passthrough `ZodObject`s** so the SDK advertises real
fields while still letting extra keys flow through to the service writers (which
remain the single source of truth for deep field validation):
- `tenantScoped()` now returns `z.object({ tenantId, ...extra }).passthrough()`.
- `create_tenant` uses a descriptive `createTenantEnvelope` (name, slug, colors,
  messenger_page_id + common optionals), `.passthrough()`.
- `list_tenants` uses `z.object({}).passthrough()`.

## Task report
| Step | Command | Result |
|------|---------|--------|
| RED  | `npx jest tests/unit/provisioning-ops.test.ts` | FAIL — 8 ops (incl. create_tenant) normalize to `undefined`; create_tenant advertises no fields |
| GREEN| `npx jest tests/unit/provisioning-ops.test.ts` | PASS — 14/14 |
| Regression | `npx jest provisioning-ops mcp-register-tools mcp-op-safety integrations-provisioning admin-service-provisioning` | PASS — 30/30 |
| End-to-end | manual SDK run (`normalizeObjectSchema` + `toJsonSchemaCompat`) | create_tenant advertises name/slug/primary_color/secondary_color/messenger_page_id/…; no op falls back to EMPTY |

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Every provisioning op advertises an object schema the SDK can expose (never the empty fallback) | `provisioning-ops.test.ts › advertised MCP input schemas › every op advertises an object schema…` | unit | PASS |
| 2 | `create_tenant` advertises its required fields (name, slug, primary_color, secondary_color) | `provisioning-ops.test.ts › advertised MCP input schemas › create_tenant advertises its required fields` | unit | PASS |
| 3 | Existing dispatch + tenantId-splitting + guardrail behavior preserved | remaining `provisioning-ops.test.ts` + `mcp-op-safety.test.ts` cases | unit | PASS |

## Known gaps / follow-up
- **Deploy required**: the MCP is live at `www.webnegosyo.com/api/mcp/mcp`. This is a
  code fix — it only reaches the connector after a production deploy. After deploying,
  reconnect/refresh the connector in Claude/ChatGPT so it re-fetches the tool list.
- The tenant-scoped ops (add_category, add_menu_item, …) advertise `tenantId` plus
  `additionalProperties: true`. The per-op field guidance still lives in the tool
  description; giving them explicit field schemas is a possible future enhancement.
