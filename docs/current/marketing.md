# Marketing Site Design

Institutional minimalism for the Orchentra static marketing site.

Use restrained chrome, large calm type, strong whitespace, dark product proof, and serious technical copy. Use Orchentra's own name, mark, screenshots, terminal examples, and product language.

## Product Frame

Orchentra is a CLI-first coding crew. The page sells one thing:

> The coding crew that spends less, writes less, and proves its review by running the code.

Every section should support one of these claims:

- **output discipline** saves output tokens with terse responses.
- **context budget** saves input tokens and caps spend with context budgeting.
- **lean code** saves code with YAGNI, stdlib-first implementation discipline.
- **/review** earns trust by running tests, typechecks, and repro commands.

The web surface is static marketing only. No app dashboard, auth, database, GitHub App flow, or reviewer product UI.

## Design Direction

Communicate institutional authority through radical simplicity.

Use:

- large, quiet headlines
- monochrome surfaces
- one green accent
- thin borders and dividers
- generous whitespace
- real terminal/product visuals
- dark proof sections
- editorial rhythm
- direct technical copy

Avoid:

- purple AI gradients
- glassy SaaS cards
- fake customer logos
- cartoon robots
- dashboard fiction
- heavy shadows
- emoji
- hype copy

## Page Structure

Use this order unless a specific campaign needs less:

1. Sticky navigation
2. Hero
3. Install command / product preview
4. Proof strip
5. Spine pillars
6. Dark review demo
7. Command surface
8. How it works
9. Security / trust
10. Final CTA
11. Footer

Each section answers one question: what it is, why it matters, how it works, why to trust it, or what to do next.

## Layout

Use full-width sections with centered containers.

```css
.container {
  width: min(100% - 48px, 1100px);
  margin-inline: auto;
}

.container-wide {
  width: min(100% - 48px, 1280px);
  margin-inline: auto;
}

.container-narrow {
  width: min(100% - 48px, 760px);
  margin-inline: auto;
}
```

Spacing follows a 4px base: `4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 120, 160`.

```css
.hero {
  padding: 128px 0 96px;
}

.section {
  padding: 96px 0;
}

.section-compact {
  padding: 64px 0;
}
```

Mobile:

```css
@media (max-width: 640px) {
  .container,
  .container-wide,
  .container-narrow {
    width: min(100% - 32px, 100%);
  }

  .hero {
    padding: 96px 0 72px;
  }

  .section {
    padding: 64px 0;
  }
}
```

## Color

Keep the interface near-monochrome. Green is a signal, not decoration.

```css
:root {
  --color-canvas: #ffffff;
  --color-stone: #f5f5f1;
  --color-soft: #fafafa;
  --color-ink: #1c1c1a;
  --color-ink-near: #17171c;
  --color-black: #0d0d0d;
  --color-muted: #6c6c64;
  --color-muted-dark: #8e8ea0;
  --color-hairline: #e7e7e1;
  --color-border-dark: #2d2d2d;
  --color-accent: #147a52;
  --color-accent-hover: #1a8f62;
  --color-error: #ef4146;
  --color-warning: #f5a623;
}
```

Rules:

- Use white/off-white for most marketing sections.
- Use near-black for terminal, review, product proof, and footer sections.
- Use green only for CTAs, focus rings, success markers, and command prompts.
- Use thin borders instead of shadows.
- Do not use gradients as UI fill.

## Typography

Default to the existing site font stack. If the current brand font is unavailable or harms readability, use Inter/system sans.

```css
:root {
  --font-display: 'Nocturn', Inter, ui-sans-serif, system-ui, sans-serif;
  --font-sans: 'Nocturn', Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Consolas, monospace;
}
```

Type scale:

| Role       |                          Size |  Weight | Line height |  Tracking |
| ---------- | ----------------------------: | ------: | ----------: | --------: |
| Hero       | `clamp(2.75rem, 7vw, 5.5rem)` | 400-600 |        1.02 | `-0.02em` |
| Section    |      `clamp(2rem, 4vw, 3rem)` | 400-600 |        1.06 | `-0.02em` |
| Card title |                       20-24px | 500-600 |         1.3 |         0 |
| Lead       |                       18-20px |     400 |        1.55 |         0 |
| Body       |                          16px |     400 |        1.55 |         0 |
| Small      |                          14px |     400 |        1.45 |         0 |
| Mono label |                          12px |     400 |         1.4 |  `0.12em` |
| Code       |                       13-14px |     400 |        1.65 |         0 |

Rules:

- One monumental headline per page.
- Body text stays readable; do not use tiny gray copy for important claims.
- Monospace is only for commands, logs, code, metadata, and labels.
- Headings use size and weight, not color, for hierarchy.

## Components

### Navigation

Sticky, 64px high, frosted only enough to keep content legible.

```css
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  height: 64px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-hairline);
}
```

Keep links restrained: `Why`, `Commands`, `GitHub`, primary CTA. Mobile can collapse to a simple menu when links exceed available width.

### Buttons

Primary button on light surfaces is near-black. Green is reserved for stronger conversion moments or dark proof sections.

```css
.button-primary {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 12px 24px;
  background: var(--color-ink-near);
  color: white;
  font-size: 15px;
}
```

Secondary actions are text links or quiet bordered pills. Do not stack multiple primary CTAs in one section.

### Cards

Use cards only for repeated items or framed product surfaces. Prefer rule-separated rows for editorial content.

```css
.card {
  border: 1px solid var(--color-hairline);
  border-radius: 12px;
  padding: 24px;
  background: var(--color-canvas);
}
```

No nested cards. No card-heavy landing-page layout.

### Terminal / Review Demo

The terminal is the product visual. It should look inspectable, not decorative.

```css
.terminal {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: #0a0a0f;
  color: rgba(255, 255, 255, 0.9);
  font-family: var(--font-mono);
}
```

Demo copy should show real Orchentra behavior:

```txt
$ /review --diff

Findings proposed.
Checks running:
[ok] bun run typecheck
[fail] bun run test

Verdict: 1 finding corroborated by a failing gate.
```

## Copy

Voice: serious, direct, technical.

Good:

- `Spends less. Writes less. Proves its work.`
- `Findings are proposals until a real check corroborates them.`
- `Context budgeting cuts input tokens before they become spend.`
- `The shortest working diff wins.`

Avoid:

- `magic`
- `revolutionary`
- `ultimate`
- `next-gen`
- `AI-powered everything`
- exclamation marks

## Responsive Rules

Breakpoints:

- Mobile: `< 640px`
- Tablet: `640px-1024px`
- Desktop: `> 1024px`
- Wide: `> 1440px`

Requirements:

- no horizontal overflow at 320px
- hero headline scales to roughly 40-48px on mobile
- cards and columns become single-column
- terminal/code blocks scroll horizontally if needed
- touch targets are at least 44px
- footer stacks cleanly

## Accessibility

Required:

- one `h1`
- semantic sections
- logical heading order
- keyboard-visible focus
- real buttons for actions
- links for navigation
- meaningful alt text for meaningful images
- empty alt text for decorative images
- strong contrast
- reduced-motion support

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Assets

Use project-owned assets only.

Allowed:

- Orchentra wordmark / mark
- real CLI screenshots
- real terminal transcripts
- original diagrams
- simple SVG icons

Not allowed:

- third-party logos, screenshots, illustrations, videos, or proprietary copy
- stock-looking AI art
- fake customer logos
- decorative mascot art

If a visual is missing, use a real terminal block or a clean placeholder labelled as a placeholder in the implementation PR.

## Implementation Notes

Current web stack:

- `apps/web` is Next.js App Router.
- Styling is Tailwind CSS plus `apps/web/app/globals.css`.
- The site is static and must not import CLI packages.
- Current public assets live in `apps/web/public`.

Before changing the site:

1. Inspect `apps/web/app/page.tsx`, `layout.tsx`, and `globals.css`.
2. Reuse existing tokens first.
3. Keep the diff to the page/components actually touched.
4. Verify with `bun run typecheck`, `bun run lint`, and `bun run build` when behavior or markup changes.

## Quality Bar

The page is done when:

- the first viewport clearly says Orchentra and the CLI value proposition
- the product proof is tangible and terminal-native
- spacing feels calm, not empty by accident
- the palette is mostly monochrome with one green accent
- no section reads like a generic SaaS template
- mobile has no overflow
- focus and reduced-motion states exist
- all claims are true for the current CLI-only product
