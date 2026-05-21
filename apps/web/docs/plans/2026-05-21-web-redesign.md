# Web Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/web` landing page + dashboard with a pixel-grid technical aesthetic (dotted-grid bg, dithered imagery, 1px hairlines, mono-heavy typography, coral accent) without touching the server.

**Architecture:** Twelve tracer-bullet vertical slices on branch `feat/web-redesign`. Each slice adds tokens/components/page wires for one section, then deletes its predecessor. Old `components/{marketing,dashboard}/*` stay live until their replacement renders end-to-end (slice 6 deletes old marketing; slice 12 deletes old dashboard). Existing data hooks (`useIncidents`, `useExecutionGraph`, `useMe`) are reused as-is — names in components shift to spec terminology (`Executions*`, `NodePanel`) but underlying fetches don't change. Tokens added under `@theme` in `globals.css`, namespaced with `--pg-*` to avoid colliding with the existing `--color-*` tokens consumed by `app/onboarding/*` and the existing `ui/{Badge,Button,Input}.tsx` primitives.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind 4 (`@theme`), framer-motion 12, lucide-react, TanStack Query, Zustand. No new runtime deps.

**Spec source:** `apps/web/docs/specs/2026-05-21-web-redesign-design.md` (commit `b3dab90`).

---

## Pre-flight (one-time, before Task 1)

- [ ] **Step 1: Verify branch**

```bash
git status
git branch --show-current
```

Expected: clean tree, branch `feat/web-redesign`.

- [ ] **Step 2: Verify dev server boots on current code**

```bash
pnpm -F @orchentra/web dev
```

Expected: server up on `http://localhost:3000`. Confirm `/` renders the old marketing page (sanity baseline). Kill the server (`ctrl+c`) before Task 1.

- [ ] **Step 3: Verify projection endpoints exist (spec §9)**

```bash
grep -rE "router\.(get|GET)\(['\"]\/api\/(executions|me|diff)" apps/server/src/routes/
```

Expected: at least one match per endpoint. If `GET /api/executions`, `GET /api/executions/:id/graph`, or `GET /api/diff/:a/:b` is missing, **stop** — surface to user per spec §9 risk. (Spec is clear: do not modify the server in this plan.)

- [ ] **Step 4: Search for mascot SVG**

```bash
find apps/web/public apps/cli/src -iname '*mascot*' -o -iname '*orch*.svg' 2>/dev/null
```

If nothing found, plan to inline a placeholder dithered glyph in Task 2 (spec §14 risk).

---

## Task 1: Pixel-grid tokens + `DitherGrid` background

**Slice goal:** Stub `/` page renders the dotted-grid bg over `--pg-surface-0`. Old marketing chrome temporarily removed.

**Files:**

- Modify: `apps/web/app/globals.css` (append tokens under existing `@theme`)
- Create: `apps/web/components/marketing-v2/DitherGrid.tsx`
- Create: `apps/web/components/marketing-v2/index.ts`
- Modify: `apps/web/app/page.tsx` (temporary stub — finished in Task 2)

- [ ] **Step 1: Add pixel-grid tokens to `globals.css`**

Append inside the existing `@theme { … }` block (just before its closing `}`):

```css
/* ── Pixel-grid web redesign (apps/web/docs/specs/2026-05-21-web-redesign-design.md §4) ── */
--color-pg-surface-0: #0b0c0e;
--color-pg-surface-1: #111317;
--color-pg-surface-2: #16181d;
--color-pg-text-0: #e6e7ea;
--color-pg-text-mute: #7a7e87;
--color-pg-grid-dot: #1a1d22;
--color-pg-hairline: #23262d;
--color-pg-accent-coral: #ff6b5b;
--color-pg-accent-coral-2: #ff8a7e;
```

- [ ] **Step 2: Create `DitherGrid.tsx`**

```tsx
// apps/web/components/marketing-v2/DitherGrid.tsx
export function DitherGrid() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="pg-dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.75" fill="var(--color-pg-grid-dot)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="var(--color-pg-surface-0)" />
      <rect width="100%" height="100%" fill="url(#pg-dots)" />
    </svg>
  )
}
```

- [ ] **Step 3: Create barrel `index.ts`**

```ts
// apps/web/components/marketing-v2/index.ts
export { DitherGrid } from './DitherGrid'
```

- [ ] **Step 4: Replace `app/page.tsx` with stub**

```tsx
// apps/web/app/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DitherGrid } from '../components/marketing-v2'
import { getApiBase, getLoginUrl } from './lib/get-login-url'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')

  let authed = false
  if (session?.value) {
    const apiBase = getApiBase()
    try {
      const res = await fetch(`${apiBase}/api/me`, {
        headers: { Cookie: `orchentra_session=${session.value}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as { org?: { id?: string } }
        authed = Boolean(data.org?.id)
      }
    } catch {
      // Network error — fall through to marketing
    }
  }
  if (authed) redirect('/onboarding')

  const _loginUrl = getLoginUrl()
  void _loginUrl // wired in Task 2

  return (
    <main className="relative min-h-screen text-[var(--color-pg-text-0)] font-mono">
      <DitherGrid />
      <div className="mx-auto max-w-6xl px-6 py-20">stub — slice 1</div>
    </main>
  )
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm -F @orchentra/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Browser smoke**

```bash
pnpm -F @orchentra/web dev
```

Visit `http://localhost:3000` unauthenticated. Expected: black bg with subtle dotted grid; "stub — slice 1" mono text top-left of a centered column. Kill server.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/page.tsx apps/web/components/marketing-v2/
git commit -m "feat(web): add pixel-grid tokens + DitherGrid bg"
```

---

## Task 2: Hero section (replaces stub on `/`)

**Slice goal:** `/` renders the dithered-mascot + headline + install-line + dual CTAs over the grid.

**Files:**

- Create: `apps/web/components/marketing-v2/Hero.tsx`
- Modify: `apps/web/components/marketing-v2/index.ts`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Create `Hero.tsx`**

```tsx
// apps/web/components/marketing-v2/Hero.tsx
import Link from 'next/link'

export function Hero({ loginHref }: { loginHref: string }) {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-10 px-6 pt-24 pb-20 md:flex-row md:items-center md:justify-between md:pt-32">
      <div className="max-w-2xl">
        <h1 className="text-[2.5rem] font-semibold leading-[1.1] tracking-tight text-[var(--color-pg-text-0)] md:text-[3.25rem]">
          the DevOps runtime that remembers every execution
        </h1>
        <p className="mt-5 text-base text-[var(--color-pg-text-mute)] md:text-lg">
          one operations registry. CLI, MCP, and a graph that survives the incident.
        </p>

        <div
          className="mt-8 inline-flex items-center gap-3 border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] px-4 py-3 text-sm"
          aria-label="install command"
        >
          <span className="text-[var(--color-pg-text-mute)]">$</span>
          <code className="text-[var(--color-pg-text-0)]">pnpm i -g @orchentra/cli</code>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Link
            href={loginHref}
            className="border border-[var(--color-pg-accent-coral)] bg-[var(--color-pg-accent-coral)] px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[var(--color-pg-accent-coral-2)] hover:border-[var(--color-pg-accent-coral-2)]"
          >
            sign in
          </Link>
          <Link
            href="/docs"
            className="border border-[var(--color-pg-hairline)] px-5 py-2.5 text-sm text-[var(--color-pg-text-0)] transition-colors hover:border-[var(--color-pg-text-mute)]"
          >
            docs
          </Link>
        </div>
      </div>

      <DitheredMascot />
    </section>
  )
}

function DitheredMascot() {
  return (
    <svg
      viewBox="0 0 200 200"
      className="h-48 w-48 shrink-0 text-[var(--color-pg-accent-coral)] md:h-64 md:w-64"
      aria-hidden="true"
    >
      <defs>
        <pattern id="pg-mascot-dither" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.9" fill="currentColor" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#pg-mascot-dither)" opacity="0.9" />
      <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="80" cy="92" r="4" fill="var(--color-pg-surface-0)" />
      <circle cx="120" cy="92" r="4" fill="var(--color-pg-surface-0)" />
      <path
        d="M 80 120 Q 100 130 120 120"
        stroke="var(--color-pg-surface-0)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
```

- [ ] **Step 2: Re-export from barrel**

```ts
// apps/web/components/marketing-v2/index.ts
export { DitherGrid } from './DitherGrid'
export { Hero } from './Hero'
```

- [ ] **Step 3: Wire `Hero` into `app/page.tsx`**

Replace the `<div className="mx-auto max-w-6xl px-6 py-20">stub — slice 1</div>` line with:

```tsx
<Hero loginHref={loginUrl} />
```

And change `const _loginUrl = getLoginUrl()` back to `const loginUrl = getLoginUrl()`. Remove the `void _loginUrl` line. Update the `marketing-v2` import to include `Hero`:

```tsx
import { DitherGrid, Hero } from '../components/marketing-v2'
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -F @orchentra/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Browser smoke**

`pnpm -F @orchentra/web dev` → visit `/`. Expected: mascot dithered glyph right-side on desktop, headline left-side, install-line in surface-1 card, coral primary CTA + ghost docs link. Resize to 600px — should stack vertically. Kill server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/marketing-v2/Hero.tsx apps/web/components/marketing-v2/index.ts apps/web/app/page.tsx
git commit -m "feat(web): add Hero section to landing"
```

---

## Task 3: `ExecutionGraphDemo` section

**Slice goal:** Second landing section paints a full-bleed sample-execution SVG with a one-shot stroke-dashoffset animation on intersection.

**Files:**

- Create: `apps/web/components/marketing-v2/ExecutionGraphDemo.tsx`
- Modify: `apps/web/components/marketing-v2/index.ts`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Create `ExecutionGraphDemo.tsx`**

```tsx
// apps/web/components/marketing-v2/ExecutionGraphDemo.tsx
'use client'

import { useEffect, useRef, useState } from 'react'

export function ExecutionGraphDemo() {
  const ref = useRef<SVGSVGElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.25 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const animate = visible && !reduced

  return (
    <section className="border-y border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <svg
          ref={ref}
          viewBox="0 0 960 320"
          className="block h-[480px] w-full"
          role="img"
          aria-label="sample execution graph"
        >
          {/* hairline grid */}
          <g stroke="var(--color-pg-hairline)" strokeWidth="1">
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 120} y1={0} x2={i * 120} y2={320} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={`h-${i}`} x1={0} y1={i * 64} x2={960} y2={i * 64} />
            ))}
          </g>

          {/* nodes */}
          {NODES.map((n) => (
            <g key={n.id}>
              <rect
                x={n.x - 64}
                y={n.y - 16}
                width={128}
                height={32}
                fill="var(--color-pg-surface-2)"
                stroke="var(--color-pg-hairline)"
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize="11"
                fontFamily="ui-monospace"
                fill="var(--color-pg-text-0)"
              >
                {n.label}
              </text>
            </g>
          ))}

          {/* edges */}
          {EDGES.map((e, i) => {
            const a = NODES.find((n) => n.id === e.from)!
            const b = NODES.find((n) => n.id === e.to)!
            const path = `M ${a.x + 64} ${a.y} L ${b.x - 64} ${b.y}`
            return (
              <path
                key={i}
                d={path}
                stroke="var(--color-pg-accent-coral)"
                strokeWidth="1"
                fill="none"
                strokeDasharray="240"
                strokeDashoffset={animate ? 0 : 240}
                style={{ transition: 'stroke-dashoffset 1.2s ease-out', transitionDelay: `${i * 120}ms` }}
              />
            )
          })}
        </svg>
        <p className="mt-6 text-xs text-[var(--color-pg-text-mute)]">
          every CLI invocation, MCP tool call, and webhook lands on the same graph
        </p>
      </div>
    </section>
  )
}

const NODES = [
  { id: 'webhook', x: 96, y: 96, label: 'github.webhook' },
  { id: 'op', x: 320, y: 96, label: 'op:ci_failure' },
  { id: 'mcp-a', x: 544, y: 48, label: 'mcp.gh.search' },
  { id: 'mcp-b', x: 544, y: 144, label: 'mcp.gh.diff' },
  { id: 'brief', x: 768, y: 96, label: 'node:brief' },
  { id: 'fix', x: 768, y: 224, label: 'node:fix' },
] as const

const EDGES = [
  { from: 'webhook', to: 'op' },
  { from: 'op', to: 'mcp-a' },
  { from: 'op', to: 'mcp-b' },
  { from: 'mcp-a', to: 'brief' },
  { from: 'mcp-b', to: 'brief' },
  { from: 'brief', to: 'fix' },
] as const
```

- [ ] **Step 2: Re-export**

```ts
// apps/web/components/marketing-v2/index.ts
export { DitherGrid } from './DitherGrid'
export { ExecutionGraphDemo } from './ExecutionGraphDemo'
export { Hero } from './Hero'
```

- [ ] **Step 3: Wire into `app/page.tsx`**

Update the import to include `ExecutionGraphDemo`. Insert `<ExecutionGraphDemo />` immediately after `<Hero loginHref={loginUrl} />`.

- [ ] **Step 4: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Visit `/`. Scroll down past Hero. Expected: surface-1 band with 6 mono-labeled nodes connected by coral hairlines; edges animate in on scroll-into-view. Toggle DevTools "Emulate CSS prefers-reduced-motion: reduce" → reload → edges should be drawn statically (no animation). Kill server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/marketing-v2/ExecutionGraphDemo.tsx apps/web/components/marketing-v2/index.ts apps/web/app/page.tsx
git commit -m "feat(web): add ExecutionGraphDemo landing section"
```

---

## Task 4: `FeatureTriptych` section

**Slice goal:** Three-column hairline-divided feature row (Operations / MCP / Graph) sits below the graph demo.

**Files:**

- Create: `apps/web/components/marketing-v2/FeatureTriptych.tsx`
- Modify: `apps/web/components/marketing-v2/index.ts`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Create `FeatureTriptych.tsx`**

```tsx
// apps/web/components/marketing-v2/FeatureTriptych.tsx
import type { ReactNode } from 'react'

type Feature = { title: string; body: string; icon: ReactNode }

const FEATURES: Feature[] = [
  {
    title: 'Operations',
    body: 'Typed, schema-validated units of work. One registry behind both the CLI and the MCP server.',
    icon: <IconOps />,
  },
  {
    title: 'MCP',
    body: 'Exposed to Claude Desktop, Cursor, and Windsurf via stdio. Trust-boundary enforcement lives in the runtime.',
    icon: <IconMcp />,
  },
  {
    title: 'Graph',
    body: 'Every execution recorded as nodes. `orchentra why <nodeId>` audits decisions against existing data.',
    icon: <IconGraph />,
  },
]

export function FeatureTriptych() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid grid-cols-1 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div key={f.title} className={`px-6 py-8 ${i > 0 ? 'md:border-l border-[var(--color-pg-hairline)]' : ''}`}>
            <div className="text-[var(--color-pg-accent-coral)]">{f.icon}</div>
            <h3 className="mt-4 text-base font-semibold text-[var(--color-pg-text-0)]">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-pg-text-mute)]">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function IconOps() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}
function IconMcp() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="6" r="2" />
      <circle cx="4" cy="18" r="2" />
      <circle cx="20" cy="6" r="2" />
      <circle cx="20" cy="18" r="2" />
      <path d="M 6 6 L 9 11 M 6 18 L 9 13 M 18 6 L 15 11 M 18 18 L 15 13" />
    </svg>
  )
}
function IconGraph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="5" cy="6" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M 7 6 L 10 11 M 14 11 L 17 6 M 14 13 L 17 18 M 7 18 L 10 13" />
    </svg>
  )
}
```

- [ ] **Step 2: Re-export + wire in page**

Add to `index.ts`:

```ts
export { FeatureTriptych } from './FeatureTriptych'
```

In `app/page.tsx`, include `FeatureTriptych` in the import and render `<FeatureTriptych />` below `<ExecutionGraphDemo />`.

- [ ] **Step 3: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Visit `/`. Expected: three columns of icon + title + body, divided by 1px hairlines on desktop, stacked on mobile.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/marketing-v2/FeatureTriptych.tsx apps/web/components/marketing-v2/index.ts apps/web/app/page.tsx
git commit -m "feat(web): add FeatureTriptych landing section"
```

---

## Task 5: `CliDemo` section + `ASCIIType` typewriter hook

**Slice goal:** Terminal-card card with one-shot typewriter rendering of `orchentra triage 2438` and mocked output. Honors `prefers-reduced-motion`.

**Files:**

- Create: `apps/web/components/marketing-v2/ASCIIType.tsx`
- Create: `apps/web/components/marketing-v2/CliDemo.tsx`
- Modify: `apps/web/components/marketing-v2/index.ts`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Create `ASCIIType.tsx`**

```tsx
// apps/web/components/marketing-v2/ASCIIType.tsx
'use client'

import { useEffect, useState } from 'react'

export function useTypewriter(text: string, opts: { msPerChar?: number; start: boolean }) {
  const { msPerChar = 24, start } = opts
  const [out, setOut] = useState('')

  useEffect(() => {
    if (!start) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setOut(text)
      return
    }
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setOut(text.slice(0, i))
      if (i >= text.length) window.clearInterval(id)
    }, msPerChar)
    return () => window.clearInterval(id)
  }, [text, msPerChar, start])

  return out
}
```

- [ ] **Step 2: Create `CliDemo.tsx`**

```tsx
// apps/web/components/marketing-v2/CliDemo.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useTypewriter } from './ASCIIType'

const CMD = '$ orchentra triage 2438'
const LINES = [
  '⏺ github.workflow_run.read({ id: 2438 })',
  '  ⎿ workflow: ci.yml · failed step: "pnpm test"',
  '⏺ github.repo.diff({ a: "HEAD~1", b: "HEAD" })',
  '  ⎿ 3 files changed · 12 +/- 4',
  '✦ thought for 9s — likely cause: drift in fixture seed',
]

export function CliDemo() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  const cmdOut = useTypewriter(CMD, { start: visible })
  const [lineIdx, setLineIdx] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.4 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (cmdOut !== CMD) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setLineIdx(LINES.length)
      return
    }
    const id = window.setInterval(() => {
      setLineIdx((n) => (n >= LINES.length ? (window.clearInterval(id), n) : n + 1))
    }, 380)
    return () => window.clearInterval(id)
  }, [cmdOut])

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div
        ref={ref}
        className="border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] font-mono"
        role="region"
        aria-label="CLI demo"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-pg-hairline)] px-4 py-2 text-[11px] text-[var(--color-pg-text-mute)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-pg-text-mute)]" />
          <span>orchentra</span>
        </div>
        <pre className="overflow-x-auto px-4 py-5 text-sm leading-6 text-[var(--color-pg-text-0)]">
          {cmdOut}
          {cmdOut !== CMD && <span className="animate-pulse">▌</span>}
          {cmdOut === CMD &&
            LINES.slice(0, lineIdx).map((line, i) => (
              <span key={i} className="block text-[var(--color-pg-text-mute)]">
                {line}
              </span>
            ))}
        </pre>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Re-export + wire**

Add to `index.ts`:

```ts
export { CliDemo } from './CliDemo'
```

Include `CliDemo` in the `app/page.tsx` import and render `<CliDemo />` after `<FeatureTriptych />`.

- [ ] **Step 4: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Visit `/`. Scroll to CLI section. Expected: terminal card with pill tab, typewriter prints `$ orchentra triage 2438`, then five mocked output lines fade in sequentially. Toggle reduced-motion → reload → full text appears immediately. Kill server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/marketing-v2/ASCIIType.tsx apps/web/components/marketing-v2/CliDemo.tsx apps/web/components/marketing-v2/index.ts apps/web/app/page.tsx
git commit -m "feat(web): add CliDemo + ASCIIType typewriter"
```

---

## Task 6: Footer + delete legacy `components/marketing/*`

**Slice goal:** Footer ships. Old marketing components removed. `/` renders entirely from `marketing-v2/`.

**Files:**

- Create: `apps/web/components/marketing-v2/Footer.tsx`
- Modify: `apps/web/components/marketing-v2/index.ts`
- Modify: `apps/web/app/page.tsx`
- Delete: `apps/web/components/marketing/` (entire directory)

- [ ] **Step 1: Verify no live import references old `components/marketing/*`**

```bash
grep -r "from.*components/marketing'" apps/web --include='*.ts' --include='*.tsx'
grep -r "from.*components/marketing/" apps/web --include='*.ts' --include='*.tsx'
```

Expected: only `apps/web/app/page.tsx` references it — and Task 1 already removed that line. If any other file imports from the old dir, stop and surface to user (likely an onboarding page consumer; spec §14 risk).

- [ ] **Step 2: Create `Footer.tsx`**

```tsx
// apps/web/components/marketing-v2/Footer.tsx
import Link from 'next/link'

const SECTIONS = [
  {
    label: 'product',
    links: [
      { href: '/docs', label: 'docs' },
      { href: 'https://github.com/anthropics/orchentra', label: 'github' },
      { href: '/docs/mcp', label: 'mcp' },
    ],
  },
  {
    label: 'resources',
    links: [
      { href: '/changelog', label: 'changelog' },
      { href: '/blog', label: 'blog' },
    ],
  },
  {
    label: 'legal',
    links: [
      { href: '/legal/privacy', label: 'privacy' },
      { href: '/legal/terms', label: 'terms' },
    ],
  },
]

export function Footer({ loginHref, version }: { loginHref: string; version: string }) {
  return (
    <footer className="border-t border-[var(--color-pg-hairline)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-12 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">{s.label}</p>
            <ul className="mt-3 space-y-2">
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-[var(--color-pg-text-0)] hover:text-[var(--color-pg-accent-coral)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--color-pg-hairline)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-[11px] text-[var(--color-pg-text-mute)]">
          <span>orchentra · v{version}</span>
          <Link href={loginHref} className="hover:text-[var(--color-pg-text-0)]">
            sign in →
          </Link>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Re-export + wire**

Add to `index.ts`:

```ts
export { Footer } from './Footer'
```

Update `app/page.tsx`: import package version statically and pass to `<Footer>`.

```tsx
// near the top of apps/web/app/page.tsx
import pkg from '../package.json'

// …in the return tree, after <CliDemo />:
;<Footer loginHref={loginUrl} version={pkg.version} />
```

- [ ] **Step 4: Delete old marketing dir**

```bash
git rm -r apps/web/components/marketing
```

- [ ] **Step 5: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Visit `/`. Expected: all five sections render in order; footer shows three columns, bottom strip shows version + sign-in link. Verify auth gate still redirects: set `orchentra_session` cookie to a valid value (via DevTools → Application → Cookies) → reload → expect redirect to `/onboarding`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/marketing-v2/Footer.tsx apps/web/components/marketing-v2/index.ts apps/web/app/page.tsx
git commit -m "feat(web): add Footer; delete legacy marketing components"
```

---

## Task 7: Dashboard `Shell` + `SidebarNav` (route stub)

**Slice goal:** A new `/dashboard` route renders the pixel-grid shell (sidebar + main canvas). Old `/dashboard/[id]` route stays live for now.

**Files:**

- Create: `apps/web/components/dashboard-v2/Shell.tsx`
- Create: `apps/web/components/dashboard-v2/SidebarNav.tsx`
- Create: `apps/web/components/dashboard-v2/index.ts`
- Create: `apps/web/app/dashboard/page.tsx`

- [ ] **Step 1: Create `SidebarNav.tsx`**

```tsx
// apps/web/components/dashboard-v2/SidebarNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, GitBranch, Layers, Settings } from 'lucide-react'

const ITEMS = [
  { href: '/dashboard', label: 'executions', icon: Activity },
  { href: '/dashboard/exec', label: 'graph', icon: GitBranch },
  { href: '/dashboard/diff', label: 'diff', icon: Layers },
  { href: '/dashboard/settings', label: 'settings', icon: Settings },
]

export function SidebarNav({ orgName }: { orgName: string }) {
  const pathname = usePathname()
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] font-mono">
      <div className="border-b border-[var(--color-pg-hairline)] px-4 py-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-block h-5 w-5 bg-[var(--color-pg-accent-coral)]" aria-hidden />
          <span className="truncate text-[var(--color-pg-text-0)]">{orgName || 'orchentra'}</span>
        </div>
      </div>
      <nav className="flex-1 py-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-[var(--color-pg-surface-2)] text-[var(--color-pg-text-0)]'
                  : 'text-[var(--color-pg-text-mute)] hover:text-[var(--color-pg-text-0)]'
              }`}
            >
              {active && <span className="absolute left-0 top-0 h-full w-[2px] bg-[var(--color-pg-accent-coral)]" />}
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Create `Shell.tsx`**

```tsx
// apps/web/components/dashboard-v2/Shell.tsx
import type { ReactNode } from 'react'
import { SidebarNav } from './SidebarNav'

export function Shell({ orgName, children }: { orgName: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-pg-surface-0)] text-[var(--color-pg-text-0)]">
      <SidebarNav orgName={orgName} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Create barrel**

```ts
// apps/web/components/dashboard-v2/index.ts
export { Shell } from './Shell'
export { SidebarNav } from './SidebarNav'
```

- [ ] **Step 4: Create `/dashboard` route**

```tsx
// apps/web/app/dashboard/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Shell } from '../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../lib/get-login-url'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')
  if (!session?.value) redirect(getLoginUrl())

  const apiBase = getApiBase()
  const res = await fetch(`${apiBase}/api/me`, {
    headers: { Cookie: `orchentra_session=${session.value}` },
    cache: 'no-store',
  })
  if (!res.ok) redirect(getLoginUrl())
  const data = (await res.json()) as { org?: { name?: string } }
  const orgName = data.org?.name ?? ''

  return (
    <Shell orgName={orgName}>
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">executions list — slice 8</div>
    </Shell>
  )
}
```

- [ ] **Step 5: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Login flow → visit `/dashboard`. Expected: left sidebar with 4 mono-labeled items, "executions" active with 2px coral left-marker; main canvas shows placeholder text. Click "settings" → URL changes; active marker moves. Kill server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/dashboard-v2/ apps/web/app/dashboard/page.tsx
git commit -m "feat(web): add dashboard-v2 Shell + SidebarNav"
```

---

## Task 8: `ExecutionsList` (replaces stub on `/dashboard`)

**Slice goal:** `/dashboard` renders the live executions list using the existing `useIncidents` hook. Old `/dashboard/[id]` still ships alongside.

**Files:**

- Create: `apps/web/components/dashboard-v2/ExecutionsList.tsx`
- Create: `apps/web/components/dashboard-v2/StatusPill.tsx`
- Modify: `apps/web/components/dashboard-v2/index.ts`
- Modify: `apps/web/app/dashboard/page.tsx`

- [ ] **Step 1: Create `StatusPill.tsx`**

```tsx
// apps/web/components/dashboard-v2/StatusPill.tsx
const COLORS: Record<string, string> = {
  resolved: 'var(--color-status-resolved)',
  investigating: 'var(--color-status-investigating)',
  fixing: 'var(--color-status-fixing)',
  brief_ready: 'var(--color-status-info)',
  error: 'var(--color-status-error)',
  escalated: 'var(--color-status-error)',
}

export function StatusPill({ status }: { status: string }) {
  const color = COLORS[status] ?? 'var(--color-pg-text-mute)'
  return (
    <span
      className="inline-flex items-center gap-1.5 border border-[var(--color-pg-hairline)] px-2 py-[2px] text-[10px] uppercase tracking-wider text-[var(--color-pg-text-mute)]"
      style={{ borderColor: color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {status}
    </span>
  )
}
```

- [ ] **Step 2: Create `ExecutionsList.tsx`**

This component reuses the existing `useIncidents(repo, from, to)` hook. Because the new `/dashboard` route is not repo-scoped, the page first fetches the user's monitored repos via `useRepos()` and defaults to the first one. (A repo selector is added later if it becomes friction — defer per spec §10.)

```tsx
// apps/web/components/dashboard-v2/ExecutionsList.tsx
'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useIncidents, useRepos } from '../../lib/hooks'
import { StatusPill } from './StatusPill'

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function ExecutionsList() {
  const { data: repos, isPending: reposLoading } = useRepos()
  const repo = repos?.find((r) => r.monitored)?.fullName ?? repos?.[0]?.fullName ?? ''

  const range = useMemo(() => ({ from: isoDaysAgo(7), to: new Date().toISOString() }), [])
  const { data, isPending, error } = useIncidents(repo, range.from, range.to)

  if (reposLoading || isPending) {
    return <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">loading…</div>
  }

  if (!repo) {
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">
        no monitored repos.{' '}
        <Link href="/onboarding" className="text-[var(--color-pg-accent-coral)]">
          connect a repo →
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-status-error)]">
        {error instanceof Error ? error.message : 'failed to load executions'}
      </div>
    )
  }

  const incidents = data?.incidents ?? []

  return (
    <div className="px-8 py-6 font-mono">
      <header className="mb-6">
        <h1 className="text-base font-semibold text-[var(--color-pg-text-0)]">executions</h1>
        <p className="mt-1 text-xs text-[var(--color-pg-text-mute)]">
          {repo} · last 7 days · {incidents.length} runs
        </p>
      </header>
      <ul className="divide-y divide-[var(--color-pg-hairline)] border-y border-[var(--color-pg-hairline)]">
        {incidents.map((inc) => (
          <li key={inc.id}>
            <Link
              href={`/dashboard/exec/${encodeURIComponent(inc.id)}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-[var(--color-pg-surface-1)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[var(--color-pg-text-0)]">{inc.commitMessage || inc.workflowName}</div>
                <div className="mt-1 truncate text-[11px] text-[var(--color-pg-text-mute)]">
                  {inc.workflowName} · {inc.branch} · {inc.commit.slice(0, 7)}
                </div>
              </div>
              <StatusPill status={inc.status} />
            </Link>
          </li>
        ))}
        {incidents.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-[var(--color-pg-text-mute)]">no executions in range</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Re-export + wire**

Add to `index.ts`:

```ts
export { ExecutionsList } from './ExecutionsList'
export { StatusPill } from './StatusPill'
```

In `apps/web/app/dashboard/page.tsx`, replace the placeholder `<div>…executions list — slice 8</div>` with:

```tsx
<ExecutionsList />
```

And update the import to include `ExecutionsList`.

- [ ] **Step 4: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Login → visit `/dashboard`. Expected: header (`executions · <repo> · last 7 days · N runs`), then a hairline-delimited list of executions. Clicking a row navigates to `/dashboard/exec/<id>` (404 expected until Task 9 lands). If repo list is empty: "no monitored repos" + onboarding link.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard-v2/ExecutionsList.tsx apps/web/components/dashboard-v2/StatusPill.tsx apps/web/components/dashboard-v2/index.ts apps/web/app/dashboard/page.tsx
git commit -m "feat(web): add ExecutionsList using existing useIncidents hook"
```

---

## Task 9: `ExecutionDetail` + `GraphView` + `NodePanel`

**Slice goal:** `/dashboard/exec/[id]` renders the new exec detail (header, pixel-grid graph, optional right-side node panel). Replaces the page currently served by old `ExecutionPage.tsx`.

**Files:**

- Create: `apps/web/components/dashboard-v2/ExecutionDetail.tsx`
- Create: `apps/web/components/dashboard-v2/GraphView.tsx`
- Create: `apps/web/components/dashboard-v2/NodePanel.tsx`
- Modify: `apps/web/components/dashboard-v2/index.ts`
- Modify: `apps/web/app/dashboard/exec/[id]/page.tsx`

- [ ] **Step 1: Create `GraphView.tsx`**

Re-implementation uses identical `GraphNode[]` shape from `apps/web/lib/types.ts`. (Read the file first to confirm the field names — if the canonical type differs from what's shown here, mirror it.)

```tsx
// apps/web/components/dashboard-v2/GraphView.tsx
'use client'

import type { GraphNode } from '../../lib/types'

export function GraphView({
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: GraphNode[]
  selectedNodeId?: string
  onSelectNode: (n: GraphNode) => void
}) {
  // Simple layered layout: rank nodes by their position in the array; group by 5 per row.
  const COLS = 5
  const W = 180
  const H = 64
  const GAP_X = 32
  const GAP_Y = 32

  const positioned = nodes.map((n, i) => ({
    n,
    x: (i % COLS) * (W + GAP_X) + GAP_X,
    y: Math.floor(i / COLS) * (H + GAP_Y) + GAP_Y,
  }))

  const rows = Math.ceil(nodes.length / COLS)
  const width = COLS * (W + GAP_X) + GAP_X
  const height = rows * (H + GAP_Y) + GAP_Y

  return (
    <div className="overflow-auto border-y border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="block" style={{ minWidth: width, height }}>
        {positioned.map(({ n, x, y }) => {
          const selected = n.id === selectedNodeId
          return (
            <g key={n.id} onClick={() => onSelectNode(n)} className="cursor-pointer">
              <rect
                x={x}
                y={y}
                width={W}
                height={H}
                fill="var(--color-pg-surface-2)"
                stroke={selected ? 'var(--color-pg-accent-coral)' : 'var(--color-pg-hairline)'}
                strokeWidth={selected ? 2 : 1}
              />
              <text x={x + 12} y={y + 22} fontSize="11" fontFamily="ui-monospace" fill="var(--color-pg-text-0)">
                {n.type ?? 'node'}
              </text>
              <text x={x + 12} y={y + 42} fontSize="10" fontFamily="ui-monospace" fill="var(--color-pg-text-mute)">
                {n.id.slice(0, 16)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
```

> **Note for engineer:** if `apps/web/lib/types.ts` does not export `GraphNode`, read the file and either (a) import the actual shape the existing hook returns or (b) add a local type that matches `useExecutionGraph`'s return data.

- [ ] **Step 2: Create `NodePanel.tsx`**

```tsx
// apps/web/components/dashboard-v2/NodePanel.tsx
'use client'

import { X } from 'lucide-react'
import { useNodeLineage } from '../../lib/hooks'

export function NodePanel({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const { data, isPending, error } = useNodeLineage(nodeId)
  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] font-mono">
      <header className="flex items-center justify-between border-b border-[var(--color-pg-hairline)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">node</div>
          <div className="truncate text-sm text-[var(--color-pg-text-0)]">{nodeId}</div>
        </div>
        <button onClick={onClose} className="text-[var(--color-pg-text-mute)] hover:text-[var(--color-pg-text-0)]">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 text-[12px] text-[var(--color-pg-text-0)]">
        {isPending ? (
          <div className="text-[var(--color-pg-text-mute)]">loading…</div>
        ) : error ? (
          <div className="text-[var(--color-status-error)]">{(error as Error).message}</div>
        ) : !data ? (
          <div className="text-[var(--color-pg-text-mute)]">not found</div>
        ) : (
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </aside>
  )
}
```

> **Note for engineer:** `useNodeLineage` already exists in `apps/web/lib/hooks/useNodeLineage.ts`. If it requires more than `nodeId` (e.g., an executionId), thread that prop in. Read the hook file before wiring.

- [ ] **Step 3: Create `ExecutionDetail.tsx`**

```tsx
// apps/web/components/dashboard-v2/ExecutionDetail.tsx
'use client'

import { useEffect, useState } from 'react'
import { useExecutionGraph } from '../../lib/hooks'
import { GraphView } from './GraphView'
import { NodePanel } from './NodePanel'
import { StatusPill } from './StatusPill'

export function ExecutionDetail({ executionId }: { executionId: string }) {
  const { data, isLoading, error } = useExecutionGraph(executionId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const match = window.location.hash.match(/^#?node=([^&]+)/)
    if (match?.[1]) {
      try {
        setSelectedNodeId(decodeURIComponent(match[1]))
      } catch {
        setSelectedNodeId(match[1])
      }
    }
  }, [])

  if (isLoading) return <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">loading…</div>
  if (error)
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-status-error)]">{(error as Error).message}</div>
    )
  if (!data) return <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">not found</div>

  return (
    <div className="flex h-screen flex-col font-mono">
      <header className="border-b border-[var(--color-pg-hairline)] px-8 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">execution</div>
            <h1 className="truncate text-sm text-[var(--color-pg-text-0)]">{data.execution.id}</h1>
          </div>
          <StatusPill status={data.execution.status} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <GraphView
            nodes={data.nodes}
            selectedNodeId={selectedNodeId ?? undefined}
            onSelectNode={(n) => {
              setSelectedNodeId(n.id)
              window.history.replaceState(null, '', `#node=${encodeURIComponent(n.id)}`)
            }}
          />
        </div>
        {selectedNodeId && (
          <NodePanel
            nodeId={selectedNodeId}
            onClose={() => {
              setSelectedNodeId(null)
              window.history.replaceState(null, '', window.location.pathname + window.location.search)
            }}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Re-export**

```ts
// apps/web/components/dashboard-v2/index.ts
// (append)
export { ExecutionDetail } from './ExecutionDetail'
export { GraphView } from './GraphView'
export { NodePanel } from './NodePanel'
```

- [ ] **Step 5: Wire new component into `/dashboard/exec/[id]` route**

Read `apps/web/app/dashboard/exec/[id]/page.tsx`. Replace the body:

```tsx
// apps/web/app/dashboard/exec/[id]/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ExecutionDetail, Shell } from '../../../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../../../lib/get-login-url'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let executionId: string
  try {
    executionId = decodeURIComponent(id)
  } catch {
    return <div className="p-6 text-red-400">Invalid execution identifier.</div>
  }

  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')
  if (!session?.value) redirect(getLoginUrl())
  const apiBase = getApiBase()
  const res = await fetch(`${apiBase}/api/me`, {
    headers: { Cookie: `orchentra_session=${session.value}` },
    cache: 'no-store',
  })
  if (!res.ok) redirect(getLoginUrl())
  const data = (await res.json()) as { org?: { name?: string } }
  const orgName = data.org?.name ?? ''

  return (
    <Shell orgName={orgName}>
      <ExecutionDetail executionId={executionId} />
    </Shell>
  )
}
```

- [ ] **Step 6: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Login → click an execution from `/dashboard` → expect ExecutionDetail to render with header (execution id + status pill), grid-laid-out graph nodes. Click a node → right-side panel slides in showing JSON lineage; close (X) → panel disappears. Hash `#node=<id>` should set selection on load.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/dashboard-v2/ExecutionDetail.tsx apps/web/components/dashboard-v2/GraphView.tsx apps/web/components/dashboard-v2/NodePanel.tsx apps/web/components/dashboard-v2/index.ts apps/web/app/dashboard/exec/[id]/page.tsx
git commit -m "feat(web): add ExecutionDetail + GraphView + NodePanel"
```

---

## Task 10: `CrossExecDiff`

**Slice goal:** `/dashboard/diff?a=&b=` renders in the new pixel-grid chrome.

**Files:**

- Create: `apps/web/components/dashboard-v2/CrossExecDiff.tsx`
- Modify: `apps/web/components/dashboard-v2/index.ts`
- Modify: `apps/web/app/dashboard/diff/page.tsx`

- [ ] **Step 1: Inspect the legacy fetch hook**

```bash
grep -n "useDiff\|useCrossExecution\|fetch.*diff" apps/web/components/dashboard/CrossExecutionDiff.tsx apps/web/lib/hooks/*.ts
```

Note the hook (if any) the old component uses to fetch the diff. If no shared hook exists, port the inline `fetch` into the new component verbatim. Do **not** introduce a new hook; the spec rules out shared utilities.

- [ ] **Step 2: Create `CrossExecDiff.tsx`**

Replace the fetch logic with whatever the legacy component used. Skeleton:

```tsx
// apps/web/components/dashboard-v2/CrossExecDiff.tsx
'use client'

import { useEffect, useState } from 'react'
import { getApiBase } from '../../app/lib/get-login-url'

type DiffPayload = unknown // replace with the actual response shape used by the legacy component

export function CrossExecDiff({ a, b }: { a: string; b: string }) {
  const [data, setData] = useState<DiffPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/diff/${encodeURIComponent(a)}/${encodeURIComponent(b)}`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [a, b])

  return (
    <div className="px-8 py-6 font-mono">
      <header className="mb-6">
        <h1 className="text-base font-semibold text-[var(--color-pg-text-0)]">diff</h1>
        <p className="mt-1 text-xs text-[var(--color-pg-text-mute)]">
          {a.slice(0, 16)}… ↔ {b.slice(0, 16)}…
        </p>
      </header>
      {err ? (
        <div className="text-sm text-[var(--color-status-error)]">{err}</div>
      ) : !data ? (
        <div className="text-sm text-[var(--color-pg-text-mute)]">loading…</div>
      ) : (
        <pre className="overflow-auto border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] p-4 text-xs text-[var(--color-pg-text-0)]">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}
```

> **Engineer note:** match `DiffPayload` to the legacy component's shape, and replicate its rendering (sections, badges, etc.) inside the new container. Do not invent fields.

- [ ] **Step 3: Re-export + wire**

```ts
// append to apps/web/components/dashboard-v2/index.ts
export { CrossExecDiff } from './CrossExecDiff'
```

Replace `apps/web/app/dashboard/diff/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CrossExecDiff, Shell } from '../../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../../lib/get-login-url'

export default async function Page({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams
  if (!a || !b) {
    return (
      <div className="p-6 font-mono text-sm text-[var(--color-status-error)]">
        Provide both `a` and `b` execution ids: /dashboard/diff?a=&lt;id&gt;&b=&lt;id&gt;.
      </div>
    )
  }

  let aId: string
  let bId: string
  try {
    aId = decodeURIComponent(a)
    bId = decodeURIComponent(b)
  } catch {
    return <div className="p-6 font-mono text-sm text-[var(--color-status-error)]">Invalid execution identifier.</div>
  }
  if (aId === bId) {
    return <div className="p-6 font-mono text-sm text-[var(--color-status-error)]">`a` and `b` must differ.</div>
  }

  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')
  if (!session?.value) redirect(getLoginUrl())
  const res = await fetch(`${getApiBase()}/api/me`, {
    headers: { Cookie: `orchentra_session=${session.value}` },
    cache: 'no-store',
  })
  if (!res.ok) redirect(getLoginUrl())
  const data = (await res.json()) as { org?: { name?: string } }
  const orgName = data.org?.name ?? ''

  return (
    <Shell orgName={orgName}>
      <CrossExecDiff a={aId} b={bId} />
    </Shell>
  )
}
```

- [ ] **Step 4: Typecheck + browser smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Visit `/dashboard/diff?a=<known-id-a>&b=<known-id-b>`. Expected: header + diff payload renders.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard-v2/CrossExecDiff.tsx apps/web/components/dashboard-v2/index.ts apps/web/app/dashboard/diff/page.tsx
git commit -m "feat(web): add CrossExecDiff in pixel-grid chrome"
```

---

## Task 11: Settings route (minimal pass)

**Slice goal:** `/dashboard/settings` renders inside the new shell and reuses the existing org/LLM-config UI surface. Per spec §7.1 ("existing wiring").

**Files:**

- Create: `apps/web/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Find the existing settings surface**

```bash
grep -rE "llm.config|/api/orgs/.+/config|OrgConfig" apps/web/app apps/web/components --include='*.ts' --include='*.tsx'
```

Note the existing component (if any). If none exists today, this task ships a placeholder ("LLM config — coming soon") to claim the route. Do **not** invent endpoints or forms.

- [ ] **Step 2: Create the route**

If a reusable settings component was found, mount it inside `<Shell>`. Otherwise:

```tsx
// apps/web/app/dashboard/settings/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Shell } from '../../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../../lib/get-login-url'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')
  if (!session?.value) redirect(getLoginUrl())
  const res = await fetch(`${getApiBase()}/api/me`, {
    headers: { Cookie: `orchentra_session=${session.value}` },
    cache: 'no-store',
  })
  if (!res.ok) redirect(getLoginUrl())
  const data = (await res.json()) as { org?: { name?: string } }
  const orgName = data.org?.name ?? ''

  return (
    <Shell orgName={orgName}>
      <div className="px-8 py-6 font-mono">
        <h1 className="text-base font-semibold text-[var(--color-pg-text-0)]">settings</h1>
        <p className="mt-2 text-xs text-[var(--color-pg-text-mute)]">org configuration · placeholder</p>
      </div>
    </Shell>
  )
}
```

- [ ] **Step 3: Typecheck + smoke**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web dev
```

Visit `/dashboard/settings`. Expected: shell + placeholder header.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/settings/page.tsx
git commit -m "feat(web): add /dashboard/settings route stub"
```

---

## Task 12: Delete legacy dashboard; final sweep

**Slice goal:** Remove `components/dashboard/*` and the legacy `/dashboard/[id]` route. Typecheck + lint + browser smoke clean across every route.

**Files:**

- Delete: `apps/web/components/dashboard/` (entire directory)
- Delete: `apps/web/app/dashboard/[id]/` (entire directory — `page.tsx`, `layout.tsx`, `chat/`, `monitoring/`)

- [ ] **Step 1: Verify no live import references the legacy dir**

```bash
grep -rE "from.*components/dashboard'" apps/web --include='*.ts' --include='*.tsx'
grep -rE "from.*components/dashboard/[A-Z]" apps/web --include='*.ts' --include='*.tsx'
```

Expected: zero hits. If any consumer outside `components/dashboard/` still imports a legacy component, **port it into `dashboard-v2/`** and update the import in the consumer before deletion (spec §14 risk). Do not leave a dangling import — and do not stub the old component with a redirect.

- [ ] **Step 2: Verify nothing routes through `/dashboard/[id]` anymore**

```bash
grep -rE "/dashboard/[^/]+(\"|\`|/chat|/monitoring)" apps/web --include='*.ts' --include='*.tsx'
```

If any internal link still points at `/dashboard/<repo>`, update it to `/dashboard` before deleting the route.

- [ ] **Step 3: Delete legacy code**

```bash
git rm -r apps/web/components/dashboard
git rm -r apps/web/app/dashboard/\[id\]
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm -F @orchentra/web typecheck
pnpm -F @orchentra/web lint
```

Expected: both PASS. If a type error surfaces from a stale import, fix at the source.

- [ ] **Step 5: Full browser sweep**

```bash
pnpm -F @orchentra/web dev
```

Walk every route:

- `/` unauthenticated → all 5 landing sections render; reduced-motion honored
- `/` authenticated → redirect to `/onboarding`
- `/dashboard` → executions list (or empty state)
- `/dashboard/exec/<known-id>` → header + graph + node panel on click
- `/dashboard/diff?a=<id>&b=<id>` → diff payload
- `/dashboard/settings` → placeholder

- [ ] **Step 6: Commit**

```bash
git commit -m "cleanup(web): drop legacy dashboard components + repo-scoped route"
```

- [ ] **Step 7: Confirm branch state**

```bash
git log --oneline feat/web-redesign ^main
git diff --stat main...HEAD
```

Expected: ~13 commits (1 spec + 1 scrub + 11 feature/cleanup, ±1). Diff stat shows roughly equal deletions vs additions (UI rewrite, not net-new surface).

---

## Self-review checklist

After Task 12, before opening a PR:

- [ ] `pnpm -F @orchentra/web typecheck` clean
- [ ] `pnpm -F @orchentra/web lint` clean
- [ ] `pnpm -F @orchentra/web build` succeeds (catches RSC/`'use client'` boundary issues)
- [ ] Lighthouse mobile run on `/` ≥ 90 (spec §11) — DevTools Lighthouse → Mobile → Performance
- [ ] All 5 landing sections render unauthenticated; auth gate still redirects
- [ ] Every dashboard route renders for an authed user with at least one execution
- [ ] No console errors, no React warnings in the dev console across any route
- [ ] No external codebase names in the diff. Run a quick scan of `git diff main...HEAD` for any product/author name from the original brainstorm reference — those must not appear in source, tests, comments, or commit messages.

If any check fails, open a follow-up task on this branch — do not merge.
