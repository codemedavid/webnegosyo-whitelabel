# Docs index

Where things are. Rules that code must follow do NOT live here: they are in `CLAUDE.md` (every change) and in the `CLAUDE.md` beside each feature's code (the root file has the table).

| Looking for | Go to |
|---|---|
| The rules for a feature (what must stay true) | The feature's own `CLAUDE.md`; table in the root `CLAUDE.md` |
| Which migrations are live, held or pending | `supabase/migration-status.json`, `npm run db:status` |
| Work that is planned or in progress | `docs/plans/` (one file or folder per feature, dated) |
| How to run a deploy or repair | `docs/runbooks/`, `docs/operations/`, a plan's own `RELEASE.md` |
| Evidence from finished work (test-first write-ups, probes) | `docs/testing/` (237 files; search by feature name, do not read through) |
| Past audits and reviews | `docs/audits/`, `docs/security-performance-audit-2026-10-04.md`, `docs/reviewing/` |
| App Store / release notes | `docs/releases/`, `docs/app-review-reply-2026-05.md` |
| The operator MCP server | `docs/smartmenu-mcp/`, `docs/runbooks/superadmin-mcp-oauth.md` |
| Older design notes kept for history | `docs/superpowers/`, `docs/custom-header-hero/`, the loose `*.md` files in this folder |

## Conventions

- **Plans** are named `YYYY-MM-DD-topic.md` and say at the top whether they are approved, built or shipped.
- **Evidence** (`docs/testing/*.tdd.md`) records what was proven and how. It is never the place a rule is first written down: if a rule matters, it is a test, a lint rule or a line in a `CLAUDE.md`.
- **Generated files** (`docs/generated/`) are written by scripts and checked by tests. Edit the source, then re-run the script.
- Lists of open weaknesses, probe output and anything naming a customer do not belong in the repository.
