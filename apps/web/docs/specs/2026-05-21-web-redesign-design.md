# Web redesign — pixel-grid technical aesthetic

**Status:** approved by user 2026-05-21
**Branch:** `feat/web-redesign`
**Scope:** full scrap + rebuild of `apps/web` landing (`app/page.tsx`) and `app/dashboard/*`
**Phase alignment:** Phase 4 (web as read-only projection of execution graph). No server changes.

---

## 1. Vision

Replace the existing `apps/web` landing and dashboard with a pixel-grid technical aesthetic — dotted-grid background, dithered imagery, 1px hairline rules, monospace-heavy typography, coral accent. Inspired by the supermemory.ai rebuild ethos (Claude-driven, high iteration velocity, no agency churn). Keeps Orchentra's CLI-first identity (CLAUDE.md §6) and the Phase-4 contract that the web is a read-only projection of the same execution graph the CLI and MCP server hit.

This is a **UI-only refactor**. No new API endpoints, no auth changes, no schema changes. Existing projection endpoints in `apps/server` are untouched.

## 2. Goals

- Landing page that conveys Orchentra's three primitives (Operations, MCP, Graph) in five tight sections.
- Dashboard with a left-sidebar + main-canvas shell that scales to the four read paths shipped in Phase 3/4 (executions list, exec detail w/ graph, cross-execution diff, settings).
- Zero new runtime dependencies. Use the existing `framer-motion`, Tailwind 4, and Next 15 stack.
- Iteration velocity: small, focused components I can rewrite in a single session.

## 3. Non-goals

- Pricing page, blog, OSS pitch, cron demo, dashboard preview cards on landing (rejected in brainstorm — lean 5 sections).
- Mobile-first design. Desktop is the primary surface; mobile gets defensive responsive (single column) but is not designed-for.
- New API endpoints, auth flow changes, schema migrations.
- Theme picker on the web. Themes live in the TUI (CLAUDE.md §6).
- Welcome-scene leaf reintroduction (CLAUDE.md §6 — explicitly rejected).
- Rename of the binary to `orch` (CLAUDE.md §6 — explicitly rejected).
- A new package for ASCII / pixelization (deferred unless landing-effects budget reopens).

## 4. Brand + visual tokens

Pixel-grid technical. Dotted grid bg, dithered images, 1px lines, coral accent, mono-heavy.

| Token              | Value                                       | Use                                |
| ------------------ | ------------------------------------------- | ---------------------------------- |
| `--surface-0`      | `#0b0c0e`                                   | page bg                            |
| `--surface-1`      | `#111317`                                   | card / sidebar bg                  |
| `--surface-2`      | `#16181d`                                   | hover, inner card                  |
| `--text-0`         | `#e6e7ea`                                   | primary text                       |
| `--text-mute`      | `#7a7e87`                                   | secondary text                     |
| `--grid-dot`       | `#1a1d22`                                   | background grid dots               |
| `--hairline`       | `#23262d`                                   | 1px rules                          |
| `--accent-coral`   | `#ff6b5b`                                   | primary CTA, active sidebar marker |
| `--accent-coral-2` | `#ff8a7e`                                   | hover state                        |
| Mono stack         | `'JetBrains Mono', ui-monospace, monospace` | body, headlines, code              |
| Headline weight    | 600                                         | hero / section titles              |

Grid bg is a single SVG `<pattern>` of 1px dots at 8px pitch, fixed to viewport. Components draw on top with `--surface-1` cards bordered by 1px `--hairline` (no rounded corners > 2px).

## 5. Branch + repo touch list

**Branch:** `feat/web-redesign` (off `origin/main`).

**Scrap (delete):**

- `apps/web/components/marketing/*` (8 files: `Hero`, `FeatureGrid`, `HowItWorks`, `ConnectorGrid`, `CoralCTA`, `Footer`, `TopNav`, `Container`, `Reveal`, `Logo`, `SpikeMark`, `CodeWindow`, `index.ts`)
- `apps/web/components/dashboard/*` (20+ files — all of them)
- `apps/web/app/page.tsx` (replace; auth-check logic copied into new page)
- `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/[id]/page.tsx`, `apps/web/app/dashboard/diff/page.tsx`, `apps/web/app/dashboard/exec/page.tsx`

**Keep (reuse as-is):**

- `apps/web/app/lib/get-login-url.ts`
- `apps/web/app/onboarding/*`
- `apps/web/middleware.ts`
- `apps/web/stores/*`
- `apps/web/components/ui/{Badge,Button,Input}.tsx` (treat as primitives; restyle via tokens only)
- `apps/web/lib/hooks/*`

## 6. Landing (`apps/web/app/page.tsx`)

Five sections, top to bottom:

### 6.1 Hero

- Dithered SVG mascot (existing mascot vector, CSS dither filter via `<filter id="dither">`)
- Headline: "the DevOps runtime that remembers every execution"
- Subhead (1 line): "one operations registry. CLI, MCP, and a graph that survives the incident."
- Install line in a borderless terminal frame: `pnpm i -g @orchentra/cli`
- Primary CTA → `/login` (coral, sharp)
- Secondary → `/docs` (ghost, hairline border)

### 6.2 Live execution graph

- Full-bleed SVG, ~480px tall
- Sample CI-failure execution: webhook → operations → MCP fanout → node graph
- Stroke-dashoffset path animation, triggered on intersection observer (one-shot)
- Caption (small mono): "every CLI invocation, MCP tool call, and webhook lands on the same graph"

### 6.3 Feature triptych

- Three columns, equal width, hairline divider between
- Each: SVG icon-animation (24s loop, low motion), 3-word title, 2-sentence body
  - **Operations** — typed, schema-validated units of work
  - **MCP** — exposed to Claude Desktop, Cursor, Windsurf via stdio
  - **Graph** — every execution recorded as nodes; `why` audit ships against existing data

### 6.4 CLI demo

- Borderless terminal card, mono, dim chrome (pill tab "orchentra")
- Typewriter animation of `orchentra triage 2438` then mocked streaming output (4-5 lines)
- One-shot on intersection; pauses if user has `prefers-reduced-motion`

### 6.5 Footer

- Single hairline rule above
- Three columns: product (docs, github, mcp), resources (changelog, blog), legal (privacy, terms)
- Bottom strip: version pulled from `package.json` at build time, copyright, login link

### 6.6 New components

`apps/web/components/marketing-v2/`:

- `Hero.tsx`
- `ExecutionGraphDemo.tsx`
- `FeatureTriptych.tsx`
- `CliDemo.tsx`
- `Footer.tsx`
- `DitherGrid.tsx` (shared bg)
- `ASCIIType.tsx` (typewriter hook used by `CliDemo`)
- `index.ts`

## 7. Dashboard (`apps/web/app/dashboard/*`)

Left sidebar + main canvas. Sidebar persistent; main canvas swaps per route.

### 7.1 Routes

| Path                   | Purpose                            |
| ---------------------- | ---------------------------------- |
| `/dashboard`           | Executions list (default landing)  |
| `/dashboard/exec/[id]` | Single execution detail + graph    |
| `/dashboard/diff`      | Cross-execution diff (Phase 4)     |
| `/dashboard/settings`  | Org / LLM config (existing wiring) |

### 7.2 Sidebar nav (`SidebarNav.tsx`)

- Top: `orch` glyph + org name (truncated)
- Items: Executions, Graph, Diff, Settings — each with a 16px SVG icon
- Active item gets a 2px coral left-marker + `--surface-2` bg
- Bottom: user avatar (initial), logout

### 7.3 New components

`apps/web/components/dashboard-v2/`:

- `Shell.tsx` (sidebar + main grid container)
- `SidebarNav.tsx`
- `ExecutionsList.tsx` (replaces `IncidentsDashboard.tsx`; same data, new chrome)
- `ExecutionDetail.tsx` (folds `ExecutionHeader.tsx` + `IncidentDetailBody.tsx` into one deep module per CLAUDE.md §7)
- `GraphView.tsx` (re-implement w/ pixel-grid aesthetic; same data shape as current `GraphView.tsx`)
- `NodePanel.tsx` (slide-in from right on node click; replaces `NodeDetail.tsx`)
- `CrossExecDiff.tsx` (refresh of existing)
- `StatusPill.tsx` (small primitive for execution.status)
- `index.ts`

### 7.4 Data flow

- Server-side fetches in `app/dashboard/[id]/page.tsx` remain. New components consume identical shapes.
- `stores/*` reused as-is.
- No new fetch logic. No new endpoints.
- If a component currently depends on a deleted helper, port the helper into the new component (no shared `incidents.utils.ts` duplicated — fold relevant logic into the consumer).

## 8. Styling implementation

- Tailwind 4 already configured. Tokens added to `apps/web/app/globals.css` under `@theme` (Tailwind 4 syntax).
- DitherGrid component uses an inline SVG `<pattern>`; component is fixed-position `inset-0 -z-10`.
- No CSS-in-JS. No new style libraries.
- Components keep tailwind utility classes; tokens are accessed via `var(--…)` in arbitrary values where needed.

## 9. Server impact

Zero. Projection endpoints already shipped in Phase 4 (PRs #235–#240). Confirm:

- `GET /api/executions` — list
- `GET /api/executions/:id` — detail incl. nodes
- `GET /api/executions/:id/graph` — graph projection
- `GET /api/diff/:a/:b` — cross-execution diff
- `GET /api/me` — session check

If any of these endpoints have changed shape since Phase 4 landed, treat that as an out-of-scope discovery and call it out — do not modify the server.

## 10. Testing strategy

Per CLAUDE.md §4.4 (goal-driven execution):

| Goal                                 | Verification                                                      |
| ------------------------------------ | ----------------------------------------------------------------- |
| Landing renders all 5 sections       | `pnpm dev` + browser smoke; visit `/` unauthenticated             |
| Auth gate still redirects to onboard | Set `orchentra_session` cookie; visit `/`; expect redirect        |
| Dashboard shell renders w/ data      | Login flow; visit `/dashboard`; see executions list               |
| Exec detail + graph render           | Visit `/dashboard/exec/<known-id>`; SVG graph paints              |
| Cross-exec diff renders              | Visit `/dashboard/diff?a=<id>&b=<id>`; diff paints                |
| Typecheck + lint clean               | `pnpm -F @orchentra/web typecheck && pnpm -F @orchentra/web lint` |
| `prefers-reduced-motion` honored     | DevTools rendering panel → reduced motion; CLI demo pauses        |

No new unit tests. UI-only refactor; behavior preserved through reused data shapes and existing server routes. If a component grows non-trivial logic (sort/filter, pagination state), revisit and add focused tests.

## 11. Performance budget

- Landing first-paint ≤ 1.5s on cold network (no client-side hydration cost for static sections).
- Lighthouse mobile performance ≥ 90 (per supermemory thread anchor).
- No new client-side JS deps. Framer-motion already in graph; reuse it.
- Images: SVG mascot inline (no network round-trip).

## 12. Decomposition for implementation

Tracer-bullet vertical slices (CLAUDE.md §3 — `to-issues` skill convention). One slice = one branch-internal commit, all four layers (tokens → component → page wire → smoke).

1. **Tokens + DitherGrid + globals.css** — pixel-grid bg renders on a stub `/` page
2. **Hero** — replace `app/page.tsx`; mascot, headline, install line, CTAs
3. **ExecutionGraphDemo** — full-bleed animated SVG section
4. **FeatureTriptych** — 3-col with mini icon-animations
5. **CliDemo** — terminal card with typewriter
6. **Footer** — and delete old `components/marketing/*`
7. **Shell + SidebarNav** — dashboard layout skeleton, `/dashboard` route uses it
8. **ExecutionsList** — port data from current `IncidentsDashboard.tsx`
9. **ExecutionDetail + GraphView + NodePanel** — exec detail page
10. **CrossExecDiff** — diff route
11. **Settings route** — minimal pass; wire to existing org/LLM config
12. **Delete old `components/dashboard/*`**; final typecheck + lint + browser sweep

Each slice is independently revertable. Commit cadence: 12+ atomic commits on this branch (CLAUDE.md §5).

## 13. Cleanup of `.claude/skills`

`.claude/skills` in the repo root is not git-tracked (verified via `git check-ignore`). No "trash" to remove. The brainstorm task list reflects this — design skills (`hallmark`, `ui-ux-pro-max:ui-ux-pro-max`) will be invoked during implementation; nothing is deleted.

## 14. Risks + mitigations

| Risk                                                         | Mitigation                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Existing dashboard components consumed by `app/onboarding/*` | Audit before deletion; if true, port the specific component(s) into `dashboard-v2/` and update imports. |
| `framer-motion` v12 + React 19 SSR quirks                    | Use `'use client'` only on components that need motion. Static sections stay RSC.                       |
| Existing projection endpoints drifted from spec              | Verify shapes against `apps/server/src/routes/*` before wiring; if drift exists, surface and stop.      |
| Pre-commit hook fails on first commit (lint/typecheck)       | Per CLAUDE.md §5: fix the underlying issue. Never `--no-verify`.                                        |
| Mascot SVG asset missing                                     | Search `apps/web/public/`; if absent, port from CLI source or commission a placeholder dithered glyph.  |

## 15. Open questions

None. Brainstorm resolved scope, aesthetic, sections, dashboard shape, and effects budget.

---

**Next step after spec approval:** invoke `superpowers:writing-plans` to produce the implementation plan that walks slices §12.1–§12.12.
