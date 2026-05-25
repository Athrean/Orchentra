# @orchentra/web

Marketing landing + product surface for Orchentra. Next.js 15 + Supabase Auth + Drizzle ORM.

## Stack

- Next.js 15 (App Router) + React 19
- Supabase (Auth + Postgres + RLS) — free tier
- Drizzle ORM (postgres-js driver, lazy-init)
- Tailwind v4
- shadcn/ui-style primitives under `components/pd/ui/*` (CVA + Radix)
- Sonner toasts, framer-motion (marketing only), lucide-react

## Layout

```
app/
  (marketing)/   — implicit; public landing at /
  (auth)/        — /login, /signup (force-dynamic)
  (app)/         — /dashboard, /account, /account/devices (force-dynamic, gated)
  auth/callback  — OAuth code exchange
lib/
  supabase/      — browser / server / middleware clients + nav allowlist
  db/            — Drizzle schema (profiles + cli_installs) + lazy client + SQL migrations
  validators/    — zod schemas for server-action boundaries
  crypto.ts      — AES-256-GCM helper for LLM keys at rest
  nav.ts         — single source of truth for product-shell routes (sidebar + middleware)
components/
  marketing-v2/  — landing-page sections (Hero, NavBar, …)
  pd/            — product surface (ui primitives, shell, account forms)
```

## Required env vars

Read from `../../.env.dev` via dotenv-cli wrapping `next dev/build/start`.

| Var                             | Where to find                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon/public)                               |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase → Project Settings → API (service_role). Server-only, never bundled. |
| `DATABASE_URL`                  | Supabase → Connect → URI (use the **transaction pooler**, port 6543)          |
| `LLM_KEY_ENCRYPTION_KEY`        | 64-char hex (run `openssl rand -hex 32`). Encrypts LLM API keys at rest.      |
| `NEXT_PUBLIC_APP_URL`           | `http://localhost:3000` in dev; deployed domain in prod                       |

## First-time Supabase setup

1. Create a project on supabase.com (free tier is fine).
2. Apply the schema:
   - Supabase dashboard → SQL Editor → paste `lib/db/migrations/001_init.sql` → run.
   - Or from a terminal: `psql "$DATABASE_URL" -f lib/db/migrations/001_init.sql`.
3. Configure auth providers:
   - Authentication → URL Configuration:
     - Site URL: `http://localhost:3000` (dev) or your domain (prod).
     - Redirect URLs allowlist: `http://localhost:3000/**` (dev) + `https://yourdomain.com/**` (prod).
   - Authentication → Providers → GitHub:
     - Use your existing Orchentra GitHub App's Client ID + Client Secret (GitHub Apps support user OAuth since 2019).
     - Add `https://<project-ref>.supabase.co/auth/v1/callback` to your GitHub App's Callback URLs.
     - In the GitHub App's Permissions, set **Account permissions → Email addresses: Read-only** (Supabase needs the email to create the user row).
   - Authentication → Providers → Google: enable + paste Client ID + Secret from a Google Cloud OAuth client. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.

The `001_init.sql` migration installs a trigger on `auth.users` that auto-creates a `profiles` row on first sign-in.

## Commands

```bash
bun run dev        # localhost:3000 (loads ../../.env.dev)
bun run build      # production build
bun run start      # serve the production build
bun run typecheck  # tsc --noEmit
bun run lint       # next lint
bun run test       # bun test (crypto round-trip etc.)
```

## What's live today

- **Marketing** — `/` (landing); redirects to `/dashboard` if authed.
- **Auth** — `/login`, `/signup` with email + GitHub + Google; `/auth/callback` exchanges the OAuth code.
- **Product shell** — `/dashboard` (overview stub), `/account` (profile edit + LLM key paste with AES-256-GCM encryption), `/account/devices` (CLI install list).

## What's not built yet

The execution graph surfaces (`/executions`, `/repos`, `/chat`, `/pipelines`, `/graphs`, `/actions`) are not in this slice. The execution graph is owned by `packages/db` + `apps/server`; the web will read it as a projection in a follow-up slice. The current schema here (`profiles` + `cli_installs`) is scoped to Supabase Auth and intentionally does **not** redefine the canonical graph tables.

## Security notes

- Server actions go through `requireUserId()` which validates the Supabase session before touching Drizzle.
- LLM API keys are AES-256-GCM-encrypted with `LLM_KEY_ENCRYPTION_KEY`; ciphertext is the only thing stored. See `lib/crypto.ts` and `tests/crypto.test.ts`.
- RLS policies in `001_init.sql` enforce `auth.uid() = id` (profiles) and `auth.uid() = user_id` (cli_installs) — defense-in-depth alongside the app-layer check.
- Service-role key is server-only (no `NEXT_PUBLIC_` prefix). No code path uses it yet; do not import it from a client module.
