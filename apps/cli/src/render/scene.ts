import type { ColorMode, Rgb } from './ansi'
import { ORCHENTRA_GREEN, ORCHENTRA_GREEN_DIM, MASCOT_EYE, RESET, bg, fg } from './ansi'

// Welcome scene: pixel-art leaf (right) and mascot (bottom-left), rendered
// with half-block packing (▀/▄/█) so two pixel rows collapse into one
// terminal row.
//
// Pixel encoding:
//   '#' = primary brand green (leaf body, mascot body)
//   '+' = darker brand green (central vein, stem, mascot shadow)
//   'K' = mascot eye
//   ' ' = transparent

// Symmetric lanceolate leaf, 14 cols × 22 rows, with a vertical vein and a
// short stem at the bottom. Designed so each row mirrors left/right around
// the center.
const LEAF_PIXELS: readonly string[] = [
  '      ##      ',
  '     ####     ',
  '    ######    ',
  '   ########   ',
  '  ##########  ',
  ' ############ ',
  '##############',
  '#####++#######',
  '####++++######',
  '####++++++####',
  '###++++++++###',
  '###++++++++###',
  '####++++++####',
  '####++++######',
  '#####++#######',
  '##############',
  ' ############ ',
  '  ##########  ',
  '   ########   ',
  '    ######    ',
  '     ####     ',
  '      ++      ',
]

// Existing mascot, 16 cols × 11 rows.
const MASCOT_PIXELS: readonly string[] = [
  '      ####      ',
  '    ########    ',
  '   ##########   ',
  '   ##KK##KK##   ',
  ' ####KK##KK#### ',
  ' ####KK##KK#### ',
  '   ##########   ',
  '    ########    ',
  '      ####      ',
  '     ##  ##     ',
  '     ##  ##     ',
]

// Scene composition.
const SCENE_HEIGHT_PIXELS = 22
const SCENE_WIDTH_PIXELS = 56
const MASCOT_LEFT_OFFSET = 0
const MASCOT_TOP_OFFSET = SCENE_HEIGHT_PIXELS - MASCOT_PIXELS.length // anchored to bottom
const LEAF_LEFT_OFFSET = SCENE_WIDTH_PIXELS - LEAF_PIXELS[0].length - 6 // padded 6 cols right
const LEAF_TOP_OFFSET = 0

interface Pixel {
  readonly filled: boolean
  readonly color: Rgb | null
}

const TRANSPARENT: Pixel = { filled: false, color: null }

function pixelFor(ch: string): Pixel {
  switch (ch) {
    case '#':
      return { filled: true, color: ORCHENTRA_GREEN }
    case '+':
      return { filled: true, color: ORCHENTRA_GREEN_DIM }
    case 'K':
      return { filled: true, color: MASCOT_EYE }
    default:
      return TRANSPARENT
  }
}

// Pre-compose the scene grid so the renderer just walks a 2-D array.
function composeGrid(): Pixel[][] {
  const grid: Pixel[][] = []
  for (let y = 0; y < SCENE_HEIGHT_PIXELS; y++) {
    const row: Pixel[] = new Array<Pixel>(SCENE_WIDTH_PIXELS).fill(TRANSPARENT)
    grid.push(row)
  }
  paint(grid, MASCOT_PIXELS, MASCOT_TOP_OFFSET, MASCOT_LEFT_OFFSET)
  paint(grid, LEAF_PIXELS, LEAF_TOP_OFFSET, LEAF_LEFT_OFFSET)
  return grid
}

function paint(grid: Pixel[][], pixels: readonly string[], topOffset: number, leftOffset: number): void {
  for (let y = 0; y < pixels.length; y++) {
    const row = pixels[y]
    for (let x = 0; x < row.length; x++) {
      const px = pixelFor(row[x])
      if (px.filled) grid[topOffset + y][leftOffset + x] = px
    }
  }
}

const SCENE_GRID = composeGrid()

export function renderScene(mode: ColorMode): string[] {
  const lines: string[] = []
  for (let y = 0; y < SCENE_GRID.length; y += 2) {
    let line = ''
    for (let x = 0; x < SCENE_WIDTH_PIXELS; x++) {
      const top = SCENE_GRID[y][x]
      const bot = y + 1 < SCENE_GRID.length ? SCENE_GRID[y + 1][x] : TRANSPARENT
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

export function sceneWidthCols(): number {
  return SCENE_WIDTH_PIXELS
}

export function sceneHeightRows(): number {
  return Math.ceil(SCENE_HEIGHT_PIXELS / 2)
}
