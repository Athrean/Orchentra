# @orchentra/web

Marketing landing + product surface for Orchentra. Next.js 15 + Supabase Auth + Drizzle ORM.

## Stack

- Next.js 15 (App Router) + React 19
- Supabase (Auth + Postgres + RLS) — free tier
- Drizzle ORM (postgres-js driver, lazy-init)
- Tailwind v4 — system-aware dark mode via `prefers-color-scheme`, charcoal shade tokens in `app/globals.css`
- shadcn/ui-style primitives under `components/pd/ui/*` (CVA + Radix)
- Sonner toasts, framer-motion (marketing only), lucide-react

## Layout

```
app/
  (marketing)/   — implicit; public landing at /
  (auth)/        — /login, /signup (force-dynamic)
  (app)/         — /investigate, /triage, /traces, /detections, /memory, /usage, /dashboard, /runs, /settings, /account (force-dynamic, gated)
  api/chat       — streaming agent endpoint (Vercel AI SDK) for the Cowork surface
  auth/callback  — OAuth code exchange
lib/
  supabase/      — browser / server / middleware clients + nav allowlist
  db/            — Drizzle schema + lazy typed client (queries only; migrations live in supabase/)
  validators/    — zod schemas for server-action boundaries
  crypto.ts      — AES-256-GCM helper for LLM keys at rest
  nav.ts         — single source of truth for product-shell routes (sidebar + middleware)
supabase/        — local stack config (config.toml) + migrations/ (SQL source of truth)
components/
  marketing-v2/  — landing-page sections (Hero, NavBar, …)
  pd/            — product surface (ui primitives, shell, account forms)
```

## Required env vars

Read from `../../.env.dev` via dotenv-cli wrapping `next dev/build/start`. Copy `.env.example` to `../../.env.dev` and fill the GitHub-App + secret values; the Supabase + DB values are pre-filled for the **local** stack.

| Var                             | Local stack default                                       | Remote (prod)                                                 |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `http://127.0.0.1:54321`                                  | Supabase → Project Settings → API                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local demo key (in `.env.example`)                        | Supabase → Project Settings → API (anon/public)               |
| `SUPABASE_SERVICE_ROLE_KEY`     | local demo key (in `.env.example`)                        | Supabase → Project Settings → API (service_role, server-only) |
| `WEB_DATABASE_URL`              | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Supabase → Connect → URI (transaction pooler, 6543)           |
| `LLM_KEY_ENCRYPTION_KEY`        | 64-char hex (`openssl rand -hex 32`)                      | same                                                          |
| `NEXT_PUBLIC_APP_URL`           | `http://localhost:3000`                                   | deployed domain                                               |

The local demo anon/service keys are the fixed values every `supabase start` prints — not secrets, safe to commit in `.env.example`.

## Database workflow

The DB schema is **Supabase-native SQL** under `supabase/migrations/*.sql` (RLS, triggers on `auth.users`, policies). Those files are the source of truth — Drizzle (`lib/db/schema.ts`) is only the typed query layer, not a migration generator. Requires Docker.

```bash
bun run db:start    # boot local Supabase stack in Docker (pg+auth+RLS+studio)
bun run db:reset    # drop local DB + reapply every migration (fresh, seeded)
bun run db:new x    # scaffold supabase/migrations/<ts>_x.sql to hand-write
bun run db:diff     # generate a migration from local schema drift
bun run db:status   # print local stack URLs + keys
bun run db:stop     # stop the local stack
```

Studio: `http://127.0.0.1:54323`. Inbucket (catches local auth emails): `http://127.0.0.1:54324`.

**Push to remote** (one-time link, then forward-only — never resets remote data):

```bash
bun run db:link     # link to the remote Supabase project (prompts for ref + db password)
bun run db:push     # apply pending migrations to the linked remote
bun run db:pull     # import the remote schema as a new local migration
```

`0000_init.sql` installs a trigger on `auth.users` that auto-creates a `profiles` row on first sign-in. For remote OAuth (GitHub/Google) configure providers in the Supabase dashboard → Authentication → Providers, with callback `https://<project-ref>.supabase.co/auth/v1/callback`.

## Commands

```bash
bun run dev        # localhost:3000 (loads ../../.env.dev; needs db:start running)
bun run build      # production build
bun run start      # serve the production build
bun run typecheck  # tsc --noEmit
bun run lint       # next lint
bun run test       # bun test (crypto round-trip etc.)
```

## What's live today

- **Marketing** — `/` (landing) with a login modal; redirects to `/dashboard` if authed.
- **Auth** — login modal + `/login`, `/signup` (email + GitHub + Google); `/auth/callback` exchanges the OAuth code and discovers existing GitHub App installs while the token is fresh.
- **Onboarding** — `/onboarding` wizard: welcome → install the Orchentra GitHub App → select repos. Resumable; skips the install step when an app is already installed on the user's account/org.
- **Dashboard** — `/dashboard` aggregates GitHub Actions runs for subscribed repos into stat tiles, executions + MTTR charts, and failing-workflows / quiet-repos sections, with an empty state when no repos are tracked.
- **Cowork** — `/investigate` + `/triage`: a streaming chat (`/api/chat`, Vercel AI SDK) with a model + effort picker, permission modes (ask / act), repo scope, file upload + voice input, a grounded system prompt, and GitHub write-back tools. `/triage` seeds the first turn from `?q=`.
- **Memory** — `/memory`: saved learnings, recurring failures, and episodes, so context does not have to be re-explained across runs.
- **Detections & Traces** — `/detections` charts execution signals over a selectable range; `/traces` + `/runs` read the execution graph as a projection.
- **Account** — `/account` (profile edit + LLM key paste with AES-256-GCM encryption), `/account/devices` (CLI install list).
- **UI** — system-aware dark mode (`prefers-color-scheme`) on a charcoal shade system (Canvas `#0a0a0a` ground, layered greys, `#212327` hairline dividers); light + dark share one `--color-pg-*` token set.

## What's not built yet

The `/graph` and `/evals` routes are still feature-landing placeholders, and cross-execution diff is not wired yet. The web now reads the canonical execution graph as a projection (`lib/graph/*` — brain, detections, runs) but does **not** redefine those tables; its own schema (`profiles`, `cli_installs`, `user_installations`, `repo_subscriptions`, `onboarding_state`, `user_memories`, …) stays scoped to Supabase Auth + RLS.

## Security notes

- Server actions go through `requireUserId()` which validates the Supabase session before touching Drizzle.
- LLM API keys are AES-256-GCM-encrypted with `LLM_KEY_ENCRYPTION_KEY`; ciphertext is the only thing stored. See `lib/crypto.ts` and `tests/crypto.test.ts`.
- RLS policies in `supabase/migrations/*.sql` enforce `auth.uid() = id` (profiles) and `auth.uid() = user_id` (cli_installs, user_installations, repo_subscriptions, onboarding_state) — defense-in-depth alongside the app-layer check.
- Service-role key is server-only (no `NEXT_PUBLIC_` prefix). No code path uses it yet; do not import it from a client module.
