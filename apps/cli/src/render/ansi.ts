export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

export const ORCHENTRA_GREEN: Rgb = { r: 0x25, g: 0xaa, b: 0x48 }
export const ORCHENTRA_GREEN_DIM: Rgb = { r: 0x17, g: 0x70, b: 0x2f }
export const MASCOT_WHITE: Rgb = { r: 0xff, g: 0xff, b: 0xff }
export const MASCOT_EYE: Rgb = { r: 0x11, g: 0x1a, b: 0x14 }

export const RESET = '[0m'
export const BOLD = '[1m'
export const DIM = '[2m'

export type ColorMode = 'truecolor' | 'ansi256' | 'ansi16' | 'none'

export interface RenderContext {
  readonly mode: ColorMode
  readonly width: number
}

export function detectRenderContext(): RenderContext {
  const width = typeof process.stdout.columns === 'number' ? process.stdout.columns : 80
  return { mode: detectColorMode(), width }
}

export function detectColorMode(): ColorMode {
  if (process.env.NO_COLOR !== undefined) return 'none'
  if (process.env.FORCE_COLOR === '0') return 'none'
  if (!process.stdout.isTTY && process.env.FORCE_COLOR === undefined) return 'none'
  const colorterm = process.env.COLORTERM?.toLowerCase() ?? ''
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor'
  const term = process.env.TERM?.toLowerCase() ?? ''
  if (term.includes('256color')) return 'ansi256'
  if (term.length > 0 && term !== 'dumb') return 'ansi16'
  return 'truecolor'
}

export function fg(color: Rgb, mode: ColorMode): string {
  if (mode === 'none') return ''
  if (mode === 'truecolor') return `[38;2;${color.r};${color.g};${color.b}m`
  if (mode === 'ansi256') return `[38;5;${rgbToAnsi256(color)}m`
  return `[${rgbToAnsi16(color, false)}m`
}

export function bg(color: Rgb, mode: ColorMode): string {
  if (mode === 'none') return ''
  if (mode === 'truecolor') return `[48;2;${color.r};${color.g};${color.b}m`
  if (mode === 'ansi256') return `[48;5;${rgbToAnsi256(color)}m`
  return `[${rgbToAnsi16(color, true)}m`
}

export function style(text: string, prefix: string, mode: ColorMode): string {
  if (mode === 'none') return text
  return `${prefix}${text}${RESET}`
}

function rgbToAnsi256(color: Rgb): number {
  if (color.r === color.g && color.g === color.b) {
    if (color.r < 8) return 16
    if (color.r > 248) return 231
    return Math.round(((color.r - 8) / 247) * 24) + 232
  }
  return (
    16 + 36 * Math.round((color.r / 255) * 5) + 6 * Math.round((color.g / 255) * 5) + Math.round((color.b / 255) * 5)
  )
}

function rgbToAnsi16(color: Rgb, background: boolean): number {
  const base = background ? 40 : 30
  const brightness = (color.r + color.g + color.b) / 3
  if (color.g > color.r && color.g > color.b) return base + (brightness > 128 ? 62 : 2)
  if (color.r > color.g && color.r > color.b) return base + (brightness > 128 ? 61 : 1)
  if (color.b > color.r && color.b > color.g) return base + (brightness > 128 ? 64 : 4)
  return base + 7
}
