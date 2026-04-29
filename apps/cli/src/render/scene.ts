import type { ColorMode, Rgb } from './ansi'
import { ORCHENTRA_GREEN, ORCHENTRA_GREEN_DIM, MASCOT_EYE, MASCOT_WHITE, RESET, bg, fg } from './ansi'

// Welcome scene = pixel-art tableau rendered with half-block packing (▀/▄/█).
//
// Layout:
//   - Big leaf (top-right, brand green with darker vein)
//   - Scatter of tiny leaf accents across the upper area
//   - Mascot (bottom-left)
//
// Pixel encoding (single char per pixel, two stacked rows -> one text row):
//   '#' = primary green leaf body / mascot body
//   '+' = darker green (vein, leaf edges, mascot shadow)
//   'W' = white highlight (mascot)
//   'K' = mascot eye
//   '.' = accent dot (tiny scattered leaf tick)
//   ' ' = transparent
//
// Width is fixed at 56 cols; height 22 pixel rows -> 11 text rows.

const SCENE_PIXEL_ROWS: readonly string[] = [
  '                                                        ',
  '              .                                #        ',
  '                                              ###       ',
  '                                  .         #####       ',
  '                                            ######+     ',
  '                                           ##+####++    ',
  '                                          ###+++#####   ',
  '                                         ###++++#####   ',
  '             .                          ####+++######   ',
  '                                       #####+++#####    ',
  '                                       #####+++####     ',
  '      ####                            ######+++###      ',
  '    ########                .        #######++##        ',
  '   ##########                       ########+##         ',
  '   ##KK##KK##                       #########          .',
  ' ####KK##KK####                      ########           ',
  ' ####KK##KK####           .           ######            ',
  '   ##########                          ####+            ',
  '    ########                            +++             ',
  '      ####                              ++              ',
  '     ##  ##                             +               ',
  '     ##  ##                                             ',
]

interface Pixel {
  readonly filled: boolean
  readonly color: Rgb | null
}

function pixelFor(ch: string): Pixel {
  switch (ch) {
    case '#':
      return { filled: true, color: ORCHENTRA_GREEN }
    case '+':
      return { filled: true, color: ORCHENTRA_GREEN_DIM }
    case 'W':
      return { filled: true, color: MASCOT_WHITE }
    case 'K':
      return { filled: true, color: MASCOT_EYE }
    case '.':
      return { filled: true, color: ORCHENTRA_GREEN }
    default:
      return { filled: false, color: null }
  }
}

function decodeRow(row: string): Pixel[] {
  const cells: Pixel[] = []
  for (const ch of row) cells.push(pixelFor(ch))
  return cells
}

export function renderScene(mode: ColorMode): string[] {
  const grid = SCENE_PIXEL_ROWS.map(decodeRow)
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

export function sceneWidthCols(): number {
  return SCENE_PIXEL_ROWS[0].length
}

export function sceneHeightRows(): number {
  return Math.ceil(SCENE_PIXEL_ROWS.length / 2)
}
