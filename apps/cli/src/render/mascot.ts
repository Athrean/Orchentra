import type { ColorMode, Rgb } from './ansi'
import { ORCHENTRA_GREEN, ORCHENTRA_GREEN_DIM, RESET, bg, fg } from './ansi'

// Each character = one pixel.
// '#' = primary (bright green), '+' = dim (shadow), ' ' = transparent.
const PIXEL_ROWS: readonly string[] = [
  '  ######  ',
  ' ######## ',
  '##########',
  '## #  # ##',
  '##########',
  '##+####+##',
  ' ######## ',
  '##  ##  ##',
]

interface Pixel {
  readonly filled: boolean
  readonly dim: boolean
}

function decodeRow(row: string): Pixel[] {
  const cells: Pixel[] = []
  for (const ch of row) {
    if (ch === '#') cells.push({ filled: true, dim: false })
    else if (ch === '+') cells.push({ filled: true, dim: true })
    else cells.push({ filled: false, dim: false })
  }
  return cells
}

export function renderMascot(mode: ColorMode): string[] {
  const grid = PIXEL_ROWS.map(decodeRow)
  const cols = grid[0].length
  const lines: string[] = []
  for (let y = 0; y < grid.length; y += 2) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const top = grid[y][x]
      const bot = y + 1 < grid.length ? grid[y + 1][x] : { filled: false, dim: false }
      line += renderCell(top, bot, mode)
    }
    lines.push(line)
  }
  return lines
}

function renderCell(top: Pixel, bot: Pixel, mode: ColorMode): string {
  if (mode === 'none') {
    if (top.filled && bot.filled) return '█'
    if (top.filled) return '▀'
    if (bot.filled) return '▄'
    return ' '
  }
  const topColor = pixelColor(top)
  const botColor = pixelColor(bot)
  if (topColor === null && botColor === null) return ' '
  if (topColor !== null && botColor !== null) {
    if (colorsEqual(topColor, botColor)) return `${fg(topColor, mode)}█${RESET}`
    return `${bg(topColor, mode)}${fg(botColor, mode)}▄${RESET}`
  }
  if (topColor !== null) return `${fg(topColor, mode)}▀${RESET}`
  if (botColor !== null) return `${fg(botColor, mode)}▄${RESET}`
  return ' '
}

function pixelColor(p: Pixel): Rgb | null {
  if (!p.filled) return null
  return p.dim ? ORCHENTRA_GREEN_DIM : ORCHENTRA_GREEN
}

function colorsEqual(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

export function mascotWidthCols(): number {
  return PIXEL_ROWS[0].length
}

export function mascotHeightRows(): number {
  return Math.ceil(PIXEL_ROWS.length / 2)
}
