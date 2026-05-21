'use client'

import { motion, useReducedMotion } from 'framer-motion'

const GLYPHS_SPARSE = ['.', '.', '.', '·', ' ', ' ', ' ', ' ', ' ', ' ']
const GLYPHS_DENSE = ['.', ':', '·', '*', '+', 'x', '/', '|', '-', ' ', ' ', ' ']
const COLS = 240
const ROWS = 160

function buildGrid(glyphs: readonly string[], salt: number): string {
  const rows: string[] = []
  for (let r = 0; r < ROWS; r++) {
    let line = ''
    for (let c = 0; c < COLS; c++) {
      const seed = (r * 73856093) ^ (c * 19349663) ^ salt
      const idx = Math.abs(seed) % glyphs.length
      line += glyphs[idx]
    }
    rows.push(line)
  }
  return rows.join('\n')
}

const LAYER_BACK = buildGrid(GLYPHS_SPARSE, 0)
const LAYER_FRONT = buildGrid(GLYPHS_DENSE, 0x9e3779b9)

const ASCII_A = `                                @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
                               @@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@$
                              $@@   @@@@@@@@@@@@@@@@@@@@@@@@@@@
                             W@@     @@@@@@@@@@@@@@@@@@@@@@@@@@@
                             @@      l@@@@@@@@@@@@@@@@@@@@@@@@@@@
                            @@        @@@@@@@@@@@@@@@@@@@@@@@@@@@
                           @@$         @@@@@@@@@@@@@@@@@@@@@@@@@@@
                          @@B           @@@@@@@@@@@@@@@@@@@@@@@@@@@
                         @@@            B@@@@@@@@@@@@@@@@@@@@@@@@@@
                        @@@              @@@@@@@@@@@@@@@@@@@@@@@@@@@
                       @@@@               @@@@@@@@@@@@@@@@@@@@@@@@@@@
                       @@@                #@@@@@@@@@@@@@@@@@@@@@@@@@@
                      @@@@                 @@@@@@@@@@@@@@@@@@@@@@@@@@@
                     @@@@@                  @@@@@@@@@@@@@@@@@@@@@@@@@@
                    @@@@@@                   @@@@@@@@@@@@@@@@@@@@@@@@@@
                   @@@@@@@                   @@@@@@@@@@@@@@@@@@@@@@@@@@@
                  @@@@@@@@@                   @@@@@@@@@@@@@@@@@@@@@@@@@@@
                 B@@@@@@@@@                    @@@@@@@@@@@@@@@@@@@@@@@@@@
                @@@@@@@@@@@@                   @@@@@@@@@@@@@@@@@@@@@@@@@@@
                @@@@@@@@@@@@@                   @@@@@@@@@@@@@@@@@@@@@@@@@@@
               @@@@@@@@@@@@@@@@                  @@@@@@@@@@@@@@@@@@@@@@@@@@
              @@@@@@@@@@@@@@@@@@@/               @@@@@@@@@@@@@@@@@@@@@@@@@@@
              @@@@@@@@@@@@@@@@@@@@@@@@O    .B@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@$
              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*  @@@@@@@@@@@@@@@@@@@@@@@@@
               @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@   B@@@@@@@@@@@@@@@@@@@@@@@@@
                @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@M    @@@@@@@@@@@@@@@@@@@@@@@@@@
                 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@      @@@@@@@@@@@@@@@@@@@@@@@@@
                    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@       @@@@@@@@@@@@@@@@@@@@@@@@@
                       @@@@@@@@@@@@@@@@@@@@@@@@@@@@        @@@@@@@@@@@@@@@@@@@@@@@@@@`

export function ASCIIBackground() {
  const reduce = useReducedMotion()

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--color-pg-surface-0)]"
    >
      <motion.pre
        className="absolute left-0 top-0 whitespace-pre font-mono text-[11px] leading-[15px] tracking-[0.22em] text-[var(--color-pg-grid-dot)] opacity-25 select-none"
        style={{ padding: '24px' }}
        animate={reduce ? undefined : { y: [0, -28, 0] }}
        transition={{ duration: 80, ease: 'linear', repeat: Infinity }}
      >
        {LAYER_BACK}
      </motion.pre>

      <motion.pre
        className="absolute left-1/2 top-[18%] -translate-x-1/2 whitespace-pre font-mono text-[6px] leading-[7px] text-[var(--color-pg-accent-green)] opacity-[0.08] select-none md:text-[10px] md:leading-[11px]"
        initial={reduce ? false : { opacity: 0 }}
        animate={reduce ? undefined : { opacity: 0.08, scale: [1, 1.012, 1] }}
        transition={{
          opacity: { duration: 2.4, delay: 0.6 },
          scale: { duration: 12, ease: 'easeInOut', repeat: Infinity },
        }}
      >
        {ASCII_A}
      </motion.pre>

      <motion.pre
        className="absolute left-0 top-0 whitespace-pre font-mono text-[10px] leading-[14px] tracking-[0.18em] text-[var(--color-pg-grid-dot)] opacity-50 select-none"
        style={{ padding: '24px' }}
        animate={reduce ? undefined : { y: [0, -14, 0], x: [0, 6, 0] }}
        transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
      >
        {LAYER_FRONT}
      </motion.pre>
    </div>
  )
}
