import React from 'react'
import { Box, Static } from 'ink'
import type { TranscriptRow } from '../types'
import { WelcomeBanner, type BannerOptions } from '../../render/banner'
import { useNow } from '../use-now'
import { TranscriptRowView } from '../transcript/TranscriptRowView'

export { splitPreviewLines, summarizeToolArgs, TranscriptRowView } from '../transcript/TranscriptRowView'

export const TOOL_ROW_DIM_AFTER_MS = 5_000

export interface TranscriptProps {
  readonly rows: readonly TranscriptRow[]
  readonly generation: React.Key
  /** The currently-streaming row, if any. Pulled out of `rows` because Static
   * commits each row exactly once — we render the live one separately until
   * it stops streaming. */
  readonly streamingRowId: string | null
  /**
   * Welcome banner props. Rendered as the first static-committed item so it
   * lands above the transcript in scrollback. Ink commits a Static item
   * exactly once, so the banner does not flicker on subsequent renders.
   */
  readonly banner?: BannerOptions
}

type StaticItem =
  | { readonly kind: 'banner'; readonly props: BannerOptions }
  | { readonly kind: 'row'; readonly row: TranscriptRow }

/**
 * Append-only transcript. Completed rows go through `<Static>` (Ink prints
 * them once and then the terminal owns the scrollback). The currently
 * streaming row, if any, renders as a normal child below so it can update.
 */
export function Transcript(props: TranscriptProps): React.ReactElement {
  // useNow drives time-based visual transitions (e.g. tool-row dimming
  // 5s after completion). Static rows are committed once, so we keep
  // recently-completed tool_call rows in the live region until they age
  // past the dim threshold; after that they commit to Static with the
  // dim flag baked in and stop re-rendering.
  const now = useNow()
  const items: StaticItem[] = []
  if (props.banner) items.push({ kind: 'banner', props: props.banner })
  const live: TranscriptRow[] = []
  for (const row of props.rows) {
    if (row.id === props.streamingRowId) {
      live.push(row)
    } else if (row.kind === 'tool_call' && row.streaming) {
      live.push(row)
    } else if (row.kind === 'tool_call' && !isOldTool(row, now)) {
      // Recently finalized — keep in live so its color can flip to dim
      // when it ages past the threshold on the next clock tick.
      live.push(row)
    } else {
      items.push({ kind: 'row', row })
    }
  }
  return (
    <>
      <Static key={props.generation} items={items}>
        {(item) =>
          item.kind === 'banner' ? (
            <Box key={`__banner__:${props.generation}`} flexDirection="column">
              <WelcomeBanner {...item.props} />
              <Box height={1} />
            </Box>
          ) : (
            <Box key={`${props.generation}:${item.row.id}`} flexDirection="column" marginBottom={1}>
              <TranscriptRowView row={item.row} dim={isOldTool(item.row, now)} />
            </Box>
          )
        }
      </Static>
      {live.map((row) => (
        <Box key={row.id} flexDirection="column" marginBottom={1}>
          <TranscriptRowView row={row} streaming dim={isOldTool(row, now)} />
        </Box>
      ))}
    </>
  )
}

function isOldTool(row: TranscriptRow, now: number): boolean {
  if (row.kind !== 'tool_call') return false
  if (row.streaming) return false
  if (!row.completedAt) return false
  return now - row.completedAt > TOOL_ROW_DIM_AFTER_MS
}
