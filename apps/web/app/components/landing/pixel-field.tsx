import { useEffect, useRef } from 'react'
import {
  createPixelField,
  type FieldZoneKind,
  type FieldZoneSpec,
  type PixelFieldConfig,
  type SafeRect,
} from './pixel-field-engine'

/* monochrome green ramp, dark → bright with rising value */
const PAGE_BANDS: PixelFieldConfig['bands'] = [
  [0.3, '#001a00'],
  [0.46, '#004700'],
  [0.62, '#008000'],
  [0.78, '#2fa82f'],
]

/* the darkest greens vanish on the ink footer, so its ramp starts brighter */
const FOOTER_BANDS: PixelFieldConfig['bands'] = [
  [0.3, '#0e3d0e'],
  [0.46, '#0f6b0f'],
  [0.62, '#1d9e1d'],
  [0.78, '#3ccc3c'],
]

const PAGE_HOT = '#4de64d'
const FOOTER_HOT = '#7cff7c'
const INTRO_MS = 1600
/* molecules need time to fly in and settle */
const SPINE_INTRO_MS = 3400

function introProgress(start: number, now: number, reduced: boolean, ms = INTRO_MS): number {
  return reduced ? 1 : Math.min(1, (now - start) / ms)
}

function zoneSpec(variant: string | undefined, box: DOMRect, intro: number): FieldZoneSpec {
  const kind: FieldZoneKind = variant === 'process' ? 'commits' : variant === 'spine' ? 'spine' : 'field'
  return {
    kind,
    x: box.left,
    y: box.top,
    w: box.width,
    h: box.height,
    fadeTop: 0,
    fadeBottom: kind === 'field' ? box.height * 0.32 : 0,
    fadeLeft: 0,
    fadeRight: 0,
    floor: 0,
    intro,
  }
}

export function PagePixelField(): React.ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-px-zone]'))
    const safeElements = Array.from(document.querySelectorAll<HTMLElement>('[data-px-safe]'))
    const seen = new Map<HTMLElement, number>()

    const zones = (): FieldZoneSpec[] => {
      const specs: FieldZoneSpec[] = []
      const viewportHeight = window.innerHeight
      const now = performance.now()
      for (const element of elements) {
        const box = element.getBoundingClientRect()
        if (box.width < 2 || box.bottom < -40 || box.top > viewportHeight + 40) continue
        let start = seen.get(element)
        if (start === undefined) {
          start = now
          seen.set(element, start)
        }
        const variant = element.dataset.pxZone
        const introMs = variant === 'spine' ? SPINE_INTRO_MS : INTRO_MS
        specs.push(zoneSpec(variant, box, introProgress(start, now, reduced, introMs)))
      }
      return specs
    }

    const safes = (): SafeRect[] => {
      const rects: SafeRect[] = []
      const viewportHeight = window.innerHeight
      for (const element of safeElements) {
        const box = element.getBoundingClientRect()
        if (box.width < 2 || box.bottom < 0 || box.top > viewportHeight) continue
        rects.push({ x: box.left, y: box.top, w: box.width, h: box.height })
      }
      return rects
    }

    return createPixelField({
      canvas,
      zones,
      safes,
      bands: PAGE_BANDS,
      hot: PAGE_HOT,
      gridDot: 'rgba(10, 10, 10, 0.07)',
      scrollLinked: true,
      interactive: true,
    })
  }, [])

  return <canvas ref={canvasRef} className="pixel-field" aria-hidden="true" />
}

export function FooterPixelField(): React.ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let firstSeen: number | null = null

    const zones = (): FieldZoneSpec[] => {
      const box = canvas.getBoundingClientRect()
      if (box.height < 2 || box.bottom < 0 || box.top > window.innerHeight) return []
      const now = performance.now()
      if (firstSeen === null) firstSeen = now
      return [
        {
          kind: 'field',
          x: 0,
          y: 0,
          w: box.width,
          h: box.height,
          fadeTop: box.height * 0.55,
          fadeRight: 0,
          fadeBottom: 0,
          fadeLeft: 0,
          floor: 0.28,
          intro: introProgress(firstSeen, now, reduced),
        },
      ]
    }

    return createPixelField({
      canvas,
      zones,
      bands: FOOTER_BANDS,
      hot: FOOTER_HOT,
      interactive: true,
    })
  }, [])

  return <canvas ref={canvasRef} className="footer-canvas" aria-hidden="true" />
}
