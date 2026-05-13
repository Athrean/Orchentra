import type { ColorMode, Rgb } from './ansi'
import { MASCOT_EYE, MASCOT_WHITE, ORCHENTRA_GREEN, ORCHENTRA_GREEN_DIM, RESET, bg, fg } from './ansi'

// Pixel encoding:
//   # = primary green body
//   + = darker green shadow
//   W = white highlight / eyes
//   K = dark eye
//   ' ' = transparent
//
// 12-column mascot sprite (uniform width required).
// Six rows -> three rendered half-block lines so the mascot matches the
// 3-line info column (title / model / cwd) in the IDE-compact banner.
const PIXEL_ROWS: readonly string[] = [
  '  ########  ',
  '  ##W##W##  ',
  '  #WW##WW#  ',
  '############',
  '  ########  ',
  '   ##  ##   ',
]

interface Pixel {
  readonly filled: boolean
  readonly color: Rgb | null
}

const EMPTY_PIXEL: Pixel = {
  filled: false,
  color: null,
}

function decodePixel(ch: string): Pixel {
  switch (ch) {
    case '#':
      return { filled: true, color: ORCHENTRA_GREEN }
    case '+':
      return { filled: true, color: ORCHENTRA_GREEN_DIM }
    case 'W':
      return { filled: true, color: MASCOT_WHITE }
    case 'K':
      return { filled: true, color: MASCOT_EYE }
    default:
      return EMPTY_PIXEL
  }
}

function decodeRow(row: string, width: number): Pixel[] {
  return row.padEnd(width, ' ').split('').map(decodePixel)
}

function colorsEqual(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function renderCell(top: Pixel, bottom: Pixel, mode: ColorMode): string {
  if (mode === 'none') {
    if (top.filled && bottom.filled) return '█'
    if (top.filled) return '▀'
    if (bottom.filled) return '▄'
    return ' '
  }

  if (!top.filled && !bottom.filled) {
    return ' '
  }

  if (top.filled && bottom.filled && top.color && bottom.color) {
    if (colorsEqual(top.color, bottom.color)) {
      return `${fg(top.color, mode)}█${RESET}`
    }

    return `${bg(top.color, mode)}${fg(bottom.color, mode)}▄${RESET}`
  }

  if (top.filled && top.color) {
    return `${fg(top.color, mode)}▀${RESET}`
  }

  if (bottom.filled && bottom.color) {
    return `${fg(bottom.color, mode)}▄${RESET}`
  }

  return ' '
}

export function mascotWidthCols(): number {
  return Math.max(...PIXEL_ROWS.map((row) => row.length))
}

export function mascotHeightRows(): number {
  return Math.ceil(PIXEL_ROWS.length / 2)
}

export function renderMascot(mode: ColorMode): string[] {
  const width = mascotWidthCols()
  const grid = PIXEL_ROWS.map((row) => decodeRow(row, width))
  const lines: string[] = []

  for (let y = 0; y < grid.length; y += 2) {
    let line = ''

    for (let x = 0; x < width; x++) {
      const top = grid[y][x]
      const bottom = grid[y + 1]?.[x] ?? EMPTY_PIXEL
      line += renderCell(top, bottom, mode)
    }

    lines.push(line)
  }

  return lines
}
