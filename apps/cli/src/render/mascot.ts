import type { ColorMode, Rgb } from './ansi'
import { MASCOT_EYE, MASCOT_WHITE, ORCHENTRA_GREEN, ORCHENTRA_GREEN_DIM, RESET, bg, fg } from './ansi'

// Pixel encoding:
//   '#' primary green body
//   '+' shadow (darker green)
//   'W' white bang / highlight
//   'K' eye
//   ' ' transparent
// Design matches the "Wave" mascot: blocky body with left arm raised in a wave,
// three motion ticks above the hand, two eyes, small right-arm tab, two feet.
const PIXEL_ROWS: readonly string[] = [
  '      ####      ', // top curve
  '    ########    ', // rounding out
  '   ##########   ', // upper body
  '   ##KK##KK##   ', // top of vertical eyes
  ' ####KK##KK#### ', // arms stick out + middle of eyes
  ' ####KK##KK#### ', // bottom of arms + bottom of eyes
  '   ##########   ', // lower body
  '    ########    ', // rounding in
  '      ####      ', // bottom curve
  '     ##  ##     ', // legs
  '     ##  ##     ', // feet
]

interface Pixel {
  readonly filled: boolean
  readonly color: Rgb | null
}

function decodeRow(row: string): Pixel[] {
  const cells: Pixel[] = []
  for (const ch of row) {
    if (ch === '#') cells.push({ filled: true, color: ORCHENTRA_GREEN })
    else if (ch === '+') cells.push({ filled: true, color: ORCHENTRA_GREEN_DIM })
    else if (ch === 'W') cells.push({ filled: true, color: MASCOT_WHITE })
    else if (ch === 'K') cells.push({ filled: true, color: MASCOT_EYE })
    else cells.push({ filled: false, color: null })
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
      const bot = y + 1 < grid.length ? grid[y + 1][x] : { filled: false, color: null }
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
  if (!top.filled && !bot.filled) return ' '
  if (top.filled && bot.filled && top.color && bot.color) {
    if (colorsEqual(top.color, bot.color)) return `${fg(top.color, mode)}█${RESET}`
    return `${bg(top.color, mode)}${fg(bot.color, mode)}▄${RESET}`
  }
  if (top.filled && top.color) return `${fg(top.color, mode)}▀${RESET}`
  if (bot.filled && bot.color) return `${fg(bot.color, mode)}▄${RESET}`
  return ' '
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
