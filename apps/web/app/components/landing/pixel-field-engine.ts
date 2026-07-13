/* Real dither field: a cell grid quantising an animated heat + noise value
 * into hard colour bands. Square cells with 1px gaps, document-aligned so the
 * field scrolls with the page. Interaction model studied from craft.wild.as:
 * a Gaussian cursor brush stamped along the pointer path, click ripples, and
 * ragged zone edges cut by low-frequency clustering instead of clip paths. */

export type FieldBand = readonly [threshold: number, color: string]

export type FieldZoneKind = 'field' | 'commits' | 'spine'

export interface FieldZoneSpec {
  kind: FieldZoneKind
  x: number
  y: number
  w: number
  h: number
  fadeTop: number
  fadeRight: number
  fadeBottom: number
  fadeLeft: number
  /* baseline clustering threshold inside the zone: 0 = solid field, higher = blobs */
  floor: number
  /* 0..1 on-load reveal — cells scatter in as this ramps up */
  intro: number
}

export interface SafeRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PixelFieldConfig {
  canvas: HTMLCanvasElement
  /* measured each frame, in canvas-local CSS px */
  zones: () => FieldZoneSpec[]
  /* copy rects the field must keep clear (ragged edge, not a clean rectangle) */
  safes?: () => SafeRect[]
  bands: readonly [FieldBand, FieldBand, FieldBand, FieldBand]
  hot: string
  gridDot?: string
  /* page canvas: rows lock to document scroll; unset for element-scoped canvases */
  scrollLinked?: boolean
  interactive?: boolean
}

export const CELL = 10
const BRUSH = 9
const HOT_MIN = 0.86
const HOT_MAX = 1.02
const SAFE_PAD = 12
const INTERACTIVE_TARGETS = 'a, button, input, select, textarea, [role="button"]'

/* contribution-graph greens, activity level 0 (none) → 4 (hottest week) */
const COMMIT_LEVELS = ['rgba(10, 10, 10, 0.05)', '#b9e6b9', '#4fb44f', '#008000', '#004700']

export function createPixelField(config: PixelFieldConfig): () => void {
  const { canvas, zones, bands, hot } = config
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) return () => {}
  const ctx: CanvasRenderingContext2D = maybeCtx

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const touch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const seed = Math.random() * 1000
  const interactive = Boolean(config.interactive) && !reduced && !touch

  let width = 0
  let height = 0
  let cols = 0
  let rows = 0
  let heat = new Float32Array(0)
  let dots: CanvasPattern | null = null

  function size(): void {
    const box = canvas.getBoundingClientRect()
    width = Math.max(1, Math.round(box.width))
    height = Math.max(1, Math.round(box.height))
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    cols = Math.ceil(width / CELL) + 1
    rows = Math.ceil(height / CELL) + 1
    heat = new Float32Array(cols * rows)
  }

  function makeDots(): void {
    if (!config.gridDot) return
    const tile = document.createElement('canvas')
    tile.width = CELL * dpr
    tile.height = CELL * dpr
    const tileCtx = tile.getContext('2d')
    if (!tileCtx) return
    tileCtx.fillStyle = config.gridDot
    tileCtx.fillRect(0, 0, Math.round(1.5 * dpr), Math.round(1.5 * dpr))
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) pattern.setTransform(new DOMMatrix().scale(1 / dpr))
    dots = pattern
  }

  function hsh(c: number, r: number): number {
    const n = Math.sin(c * 127.1 + r * 311.7 + seed * 0.13) * 43758.5453
    return n - Math.floor(n)
  }

  function base(nx0: number, ny0: number, tt: number): number {
    const nx = nx0 + Math.sin(ny0 * 5 + tt * 0.5 + seed) * 0.05
    const ny = ny0 + Math.cos(nx0 * 5 - tt * 0.4) * 0.05
    const v =
      Math.sin(nx * 5.6 + seed * 1.3 + tt * 0.3) * Math.cos(ny * 4.7 - seed * 0.7 + tt * 0.22) +
      Math.sin((nx * 1.4 + ny * 1.7) * 4.1 - seed + tt * 0.16) +
      Math.sin(ny * 9 + seed * 2.1 + nx * 3) * 0.5 +
      Math.sin(nx * 13 - seed * 1.7) * 0.28
    return 0.5 + 0.5 * (v / 2.55)
  }

  function region(nx: number, ny: number, tt: number): number {
    return 0.5 + 0.5 * Math.sin(nx * 2.1 + tt * 0.12 + seed * 0.7) * Math.cos(ny * 1.8 - tt * 0.09 + seed * 0.3)
  }

  /* blocky per-column offset so fades tear off in ragged clusters, not straight lines */
  function ragged(c: number, r: number): number {
    const wave = (Math.sin(c * 0.5 + seed) + Math.sin(c * 0.21 - seed * 1.3)) * 0.16
    return Math.max(0, wave + hsh(((c / 2) | 0) + 3.3, (r / 4) | 0) * 0.6 + 0.15)
  }

  function inwardness(distance: number, fade: number, rag: number): number {
    if (fade <= 0) return 1
    const v = (distance - rag * fade * 0.55) / fade
    return v < 0 ? 0 : v > 1 ? 1 : v
  }

  function deposit(x: number, y: number, amount: number, sigma: number): void {
    const cc = x / CELL
    const cr = y / CELL
    const radius = Math.ceil(sigma * 1.6)
    const inv = 1 / (2 * sigma * sigma * 0.18)
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const c = (cc + dc) | 0
        const r = (cr + dr) | 0
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue
        const dx = c + 0.5 - cc
        const dy = r + 0.5 - cr
        const w = Math.exp(-(dx * dx + dy * dy) * inv)
        if (w < 0.02) continue
        const id = r * cols + c
        const v = heat[id] + amount * w
        heat[id] = v > 1 ? 1 : v
      }
    }
  }

  let mx = -1
  let my = -1
  let hasPointer = false
  let px = -1
  let py = -1

  function toLocal(clientX: number, clientY: number): readonly [number, number] {
    if (config.scrollLinked) return [clientX, clientY]
    const box = canvas.getBoundingClientRect()
    return [clientX - box.left, clientY - box.top]
  }

  /* stamp along the pointer path so a fast flick stays continuous */
  function follow(x: number, y: number): void {
    const margin = BRUSH * CELL * 1.6
    if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
      px = -1
      py = -1
      return
    }
    if (px < 0) {
      px = x
      py = y
    }
    const dx = x - px
    const dy = y - py
    const length = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(1, Math.min(48, Math.round(length / (CELL * 0.8))))
    for (let s = 1; s <= steps; s++) {
      const f = s / steps
      deposit(px + dx * f, py + dy * f, 0.16, BRUSH)
    }
    px = x
    py = y
  }

  const waves: Array<{ x: number; y: number; t0: number; pow: number }> = []

  function stampWaves(now: number): void {
    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i]
      const age = (now - wave.t0) / 1000
      if (age > 1.5) {
        waves.splice(i, 1)
        continue
      }
      const ring = age * Math.hypot(width, height) * 1.7
      const sigma = CELL * 5.5 * wave.pow
      const amp = Math.max(0, 1 - age / 1.5) * 1.2 * wave.pow
      const inv = 1 / (2 * sigma * sigma)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = (c + 0.5) * CELL - wave.x
          const dy = (r + 0.5) * CELL - wave.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const g = amp * Math.exp(-((distance - ring) * (distance - ring)) * inv)
          if (g > 0.02) {
            const id = r * cols + c
            if (g > heat[id]) heat[id] = g
          }
        }
      }
    }
  }

  function bandColor(v: number): string | null {
    const isHot = v >= HOT_MIN && v < HOT_MAX
    if (v < bands[0][0] && !isHot) return null
    if (isHot) return hot
    let color = bands[0][1]
    if (v >= bands[1][0]) color = bands[1][1]
    if (v >= bands[2][0]) color = bands[2][1]
    if (v >= bands[3][0]) color = bands[3][1]
    return color
  }

  function heatAt(x: number, y: number): number {
    const c = (x / CELL) | 0
    const r = (y / CELL) | 0
    if (c < 0 || r < 0 || c >= cols || r >= rows) return 0
    return heat[r * cols + c]
  }

  /* GitHub-style contribution calendar: 7 day rows, activity clustered by week,
     a few cells re-rolling as commits land; cursor heat pushes levels up */
  function drawCommits(zone: FieldZoneSpec, tt: number): void {
    const tile = 14
    const cellSide = 11
    const dayRows = 7
    const weeks = Math.max(4, Math.floor((zone.w - 24) / tile))
    const graphW = weeks * tile - (tile - cellSide)
    const graphH = dayRows * tile - (tile - cellSide)
    const left = zone.x + (zone.w - graphW) / 2
    const top = zone.y + (zone.h - graphH) / 2
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < dayRows; d++) {
        if (hsh(w * 1.7 + 3.1, d * 2.3 + 7.7) > zone.intro) continue
        const x = left + w * tile
        const y = top + d * tile
        let act = 0.62 * region(w * 0.11 + 0.7, d * 0.37 + 0.3, tt) + 0.38 * hsh(w * 1.31, d * 2.17)
        const beat = Math.floor(tt * 0.9 + hsh(w, d) * 9)
        act += (hsh(w * 3.7 + beat, d * 5.1) - 0.5) * 0.3
        if (d >= 5) act -= 0.12
        act += heatAt(x + cellSide / 2, y + cellSide / 2) * 0.8
        let level = 0
        if (act > 0.32) level = 1
        if (act > 0.5) level = 2
        if (act > 0.66) level = 3
        if (act > 0.8) level = 4
        ctx.fillStyle = COMMIT_LEVELS[level]
        ctx.fillRect(x, y, cellSide, cellSide)
      }
    }
  }

  /* DNA double helix: two counter-phased strands with base-pair rungs,
     built from molecules that fly in from scattered origins as the zone's
     intro ramps, then rotate slowly in place. */
  const M_CELL = 7
  const M_SIZE = 6

  function drawMolecule(zone: FieldZoneSpec, lx: number, ly: number, color: string): void {
    const c = (lx / M_CELL) | 0
    const r = (ly / M_CELL) | 0
    const delay = hsh(c * 1.7 + 3.3, r * 2.9 + 7.1) * 0.6
    const p = Math.min(1, Math.max(0, (zone.intro - delay) / 0.4))
    const scatterX = (hsh(c * 7.7, r * 3.9) - 0.5) * zone.w * 0.9
    const scatterY = (hsh(c * 4.1, r * 8.3) - 0.5) * zone.h * 1.4
    if (p <= 0) {
      ctx.fillStyle = '#8fce8f'
      ctx.fillRect(zone.x + lx + scatterX - 2, zone.y + ly + scatterY - 2, 4, 4)
      return
    }
    const ease = 1 - Math.pow(1 - p, 3)
    const hot = heatAt(zone.x + lx, zone.y + ly) > 0.35
    ctx.fillStyle = p < 1 ? '#2fa82f' : hot ? '#4de64d' : color
    ctx.fillRect(
      zone.x + lx + scatterX * (1 - ease) - M_SIZE / 2,
      zone.y + ly + scatterY * (1 - ease) - M_SIZE / 2,
      M_SIZE,
      M_SIZE,
    )
  }

  function drawHelix(zone: FieldZoneSpec, tt: number): void {
    const midY = zone.h / 2
    const amp = Math.min(zone.h * 0.3, 130)
    const k = (Math.PI * 2) / 230
    const phase = tt * 0.55
    const cols = Math.ceil(zone.w / M_CELL)
    for (let c = 0; c < cols; c++) {
      const lx = c * M_CELL + M_CELL * 0.5
      const wave = Math.sin(k * lx + phase)
      const depth = Math.cos(k * lx + phase)
      const y1 = midY + amp * wave
      const y2 = midY - amp * wave
      /* base-pair rungs, two-tone halves alternating per rung, skipped near crossings */
      if (c % 4 === 2 && Math.abs(y1 - y2) > M_CELL * 3) {
        const yTop = Math.min(y1, y2) + M_CELL * 1.5
        const yBottom = Math.max(y1, y2) - M_CELL * 1.5
        const flip = ((c / 4) | 0) % 2 === 0
        for (let y = yTop; y <= yBottom; y += M_CELL) {
          const upper = y < midY
          drawMolecule(zone, lx, Math.round(y / M_CELL) * M_CELL + M_CELL * 0.5, upper === flip ? '#2fa82f' : '#008000')
        }
      }
      /* strands: two molecules thick; the strand curving toward the viewer is brighter */
      const front1 = depth > 0
      for (let dyIndex = 0; dyIndex < 2; dyIndex++) {
        const strand1Y = Math.round(y1 / M_CELL + dyIndex) * M_CELL + M_CELL * 0.5
        const strand2Y = Math.round(y2 / M_CELL + dyIndex) * M_CELL + M_CELL * 0.5
        drawMolecule(zone, lx, strand1Y, front1 ? '#008000' : '#004700')
        drawMolecule(zone, lx, strand2Y, front1 ? '#004700' : '#008000')
      }
    }
    /* a few free molecules drifting around the helix */
    for (let i = 0; i < 26; i++) {
      const lx = hsh(i * 3.3, 7.1) * zone.w
      const ly = hsh(i * 5.9, 2.7) * zone.h
      const ox = Math.sin(tt * 0.4 + i * 1.7) * 10
      const oy = Math.cos(tt * 0.31 + i * 2.3) * 8
      ctx.fillStyle = '#8fce8f'
      ctx.fillRect(zone.x + lx + ox - 2, zone.y + ly + oy - 2, 4, 4)
    }
  }

  let t = 0

  function render(now: number): void {
    const tt = reduced ? 4.2 : t * 0.001
    const sy = config.scrollLinked && !touch ? window.scrollY : 0

    if (!reduced) {
      const decay = touch ? 0.85 : 0.878
      for (let i = 0; i < heat.length; i++) {
        heat[i] *= decay
        if (heat[i] < 0.003) heat[i] = 0
      }
      if (interactive && hasPointer) {
        const [x, y] = toLocal(mx, my)
        follow(x, y)
      }
      stampWaves(now)
    }

    ctx.clearRect(0, 0, width, height)
    if (dots) {
      ctx.save()
      ctx.translate(0, -(sy % CELL))
      ctx.fillStyle = dots
      ctx.fillRect(0, 0, width, height + CELL)
      ctx.restore()
    }

    const zoneList = zones()
    const safeList = config.safes ? config.safes() : []
    const cellSize = CELL - 1
    const rowStart = Math.floor(sy / CELL) - 1
    const rowEnd = Math.floor((sy + height) / CELL) + 1
    for (let dr = rowStart; dr <= rowEnd; dr++) {
      const vy = dr * CELL - sy
      const vr = Math.floor((vy + CELL * 0.5) / CELL)
      const inRow = vr >= 0 && vr < rows
      const ccy = vy + CELL * 0.5
      const ny = (dr * CELL) / height
      for (let c = 0; c < cols; c++) {
        const x = c * CELL
        const ccx = x + CELL * 0.5
        let blocked = false
        for (let si = 0; si < safeList.length; si++) {
          const safe = safeList[si]
          const left = safe.x - SAFE_PAD
          const top = safe.y - SAFE_PAD * 0.7
          const right = safe.x + safe.w + SAFE_PAD
          const bottom = safe.y + safe.h + SAFE_PAD * 0.7
          if (ccx >= left && ccx <= right && ccy >= top && ccy <= bottom) {
            blocked = true
            break
          }
          /* fuzzy band outside the core rect: a ragged, random edge */
          const fuzz = CELL * 2.4
          if (
            ccx >= left - fuzz &&
            ccx <= right + fuzz &&
            ccy >= top - fuzz &&
            ccy <= bottom + fuzz &&
            hsh(c + 9.1, dr + 4.7) < 0.55
          ) {
            blocked = true
            break
          }
        }
        if (blocked) continue
        let v = inRow ? heat[vr * cols + c] * 0.9 : 0
        for (let zi = 0; zi < zoneList.length; zi++) {
          const zone = zoneList[zi]
          if (ccx < zone.x || ccx > zone.x + zone.w || ccy < zone.y || ccy > zone.y + zone.h) continue
          if (zone.kind !== 'field') {
            /* commits / spine zones paint themselves; keep loose heat out of them */
            blocked = true
            break
          }
          const rag = ragged(c, dr)
          let edge = inwardness(ccy - zone.y, zone.fadeTop, rag)
          edge = Math.min(edge, inwardness(zone.y + zone.h - ccy, zone.fadeBottom, rag))
          edge = Math.min(edge, inwardness(ccx - zone.x, zone.fadeLeft, rag))
          edge = Math.min(edge, inwardness(zone.x + zone.w - ccx, zone.fadeRight, rag))
          const threshold = Math.max(zone.floor, 1 - edge)
          if (
            threshold < 1 &&
            region(ccx / width, ny, tt) > threshold &&
            hsh(c * 1.7 + 11.3, dr * 1.3 + 5.1) < zone.intro
          ) {
            v += base(ccx / width, ny, tt) + (hsh(c, dr) - 0.5) * 0.12 + Math.sin(c * 0.6 + dr * 0.8 + tt * 1.7) * 0.045
          }
          break
        }
        if (blocked) continue
        const color = bandColor(v)
        if (!color) continue
        ctx.fillStyle = color
        ctx.fillRect(x, vy, cellSize, cellSize)
      }
    }

    for (let zi = 0; zi < zoneList.length; zi++) {
      const zone = zoneList[zi]
      if (zone.kind === 'commits') drawCommits(zone, tt)
      else if (zone.kind === 'spine') drawHelix(zone, tt)
    }
  }

  let raf = 0
  let last = -1

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    if (last < 0) last = now
    t += Math.min(50, now - last)
    last = now
    render(now)
  }

  /* reduced motion: one static composition, repainted only when layout shifts */
  function renderOnce(): void {
    raf = 0
    render(performance.now())
  }

  function requestStill(): void {
    if (!raf) raf = requestAnimationFrame(renderOnce)
  }

  function onPointerMove(event: PointerEvent): void {
    mx = event.clientX
    my = event.clientY
    hasPointer = true
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target
    if (target instanceof Element && target.closest(INTERACTIVE_TARGETS)) return
    const [x, y] = toLocal(event.clientX, event.clientY)
    if (x < 0 || x > width || y < 0 || y > height) return
    waves.push({ x, y, t0: performance.now(), pow: 0.5 })
  }

  function onBlur(): void {
    hasPointer = false
    px = -1
    py = -1
  }

  size()
  makeDots()

  const observer = new ResizeObserver(() => {
    size()
    makeDots()
    if (reduced) requestStill()
  })
  observer.observe(canvas)

  if (reduced) {
    window.addEventListener('scroll', requestStill, { passive: true })
    window.addEventListener('resize', requestStill)
    requestStill()
  } else {
    if (interactive) {
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('blur', onBlur)
    }
    raf = requestAnimationFrame(frame)
  }

  return () => {
    cancelAnimationFrame(raf)
    observer.disconnect()
    window.removeEventListener('scroll', requestStill)
    window.removeEventListener('resize', requestStill)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('blur', onBlur)
  }
}
