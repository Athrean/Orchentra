// Mount exactly once per page — fixed-position decorative grain layer.
export function ASCIIBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--color-pg-surface-0)]"
    >
      <pre
        className="absolute left-0 top-0 whitespace-pre font-mono text-[10px] leading-[14px] tracking-[0.18em] text-[var(--color-pg-grid-dot)] opacity-60 select-none"
        style={{ padding: '24px' }}
      >
        {GRAIN}
      </pre>
    </div>
  )
}

const GLYPHS = ['.', '.', '.', '.', ':', '·', '*', 'o', '.', ' ', ' ', ' ']
const COLS = 220
const ROWS = 140

function buildGrain(): string {
  const rows: string[] = []
  for (let r = 0; r < ROWS; r++) {
    let line = ''
    for (let c = 0; c < COLS; c++) {
      const seed = (r * 73856093) ^ (c * 19349663)
      const idx = Math.abs(seed) % GLYPHS.length
      line += GLYPHS[idx]
    }
    rows.push(line)
  }
  return rows.join('\n')
}

const GRAIN = buildGrain()
