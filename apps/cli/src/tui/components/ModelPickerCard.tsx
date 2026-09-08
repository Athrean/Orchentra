import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { EFFORT_TIERS, type EffortTier } from '@orchentra/cli-core'
import { THEME } from '../theme'
import { MODEL_CATALOG, type ModelOption } from '../../model-catalog'

export type { ModelOption }
export { MODEL_CATALOG }

export type ModelPickScope = 'default' | 'session'

export interface ModelPickerCardProps {
  readonly current: string
  readonly onPick: (modelId: string, scope: ModelPickScope) => void
  readonly onCancel: () => void
  /** Starting session effort. Omit to hide the row and ignore ←/→. */
  readonly effort?: EffortTier
  /** Called on every ←/→ step, not on confirm — the change is live. */
  readonly onEffort?: (effort: EffortTier) => void
}

/** Inner text width. The active row paints a full-width bar, so it is fixed. */
const WIDTH = 72
/** Model rows shown at once; the window scrolls to keep the cursor visible. */
const VIEWPORT = 14

type Row =
  { readonly kind: 'section'; readonly label: string } | { readonly kind: 'model'; readonly model: ModelOption }

/**
 * Rows in render order. With no query the catalog keeps its section headings;
 * a query flattens the list and moves the section name into the right-hand
 * column, so a filtered result still says which account would pay for it.
 */
export function buildRows(query: string, catalog: readonly ModelOption[] = MODEL_CATALOG): readonly Row[] {
  const needle = query.trim().toLowerCase()
  if (needle) {
    return catalog
      .filter((m) => `${m.label} ${m.provider} ${m.id} ${m.hint ?? ''}`.toLowerCase().includes(needle))
      .map((model) => ({ kind: 'model', model }) as const)
  }
  const rows: Row[] = []
  let section: string | null = null
  for (const model of catalog) {
    if (model.provider !== section) {
      section = model.provider
      rows.push({ kind: 'section', label: section })
    }
    rows.push({ kind: 'model', model })
  }
  return rows
}

/**
 * Effort one step along, clamped at both ends. Effort is a provider-agnostic
 * dial — every backend maps it (Anthropic output_config, OpenAI/Codex
 * reasoning_effort, Responses reasoning.effort, Gemini thinkingBudget) — so it
 * belongs next to the model rather than behind its own command.
 */
export function stepEffort(current: EffortTier, direction: -1 | 1): EffortTier {
  const i = EFFORT_TIERS.indexOf(current)
  const next = Math.min(EFFORT_TIERS.length - 1, Math.max(0, (i < 0 ? 0 : i) + direction))
  return EFFORT_TIERS[next] ?? current
}

/** Right-hand column for a row: the badge, or the section when flattened. */
function trailing(model: ModelOption, flattened: boolean): string {
  if (model.tag) return model.tag
  return flattened ? model.provider : ''
}

export function ModelPickerCard(props: ModelPickerCardProps): React.ReactElement {
  const [query, setQuery] = useState('')
  // Held locally so ←/→ repaints the row immediately; the host is told on every
  // step rather than on confirm, so the dial is live even if the picker is
  // dismissed with Esc.
  const [effort, setEffort] = useState<EffortTier | undefined>(props.effort)
  const rows = useMemo(() => buildRows(query), [query])
  const models = useMemo(() => rows.flatMap((r) => (r.kind === 'model' ? [r.model] : [])), [rows])

  const initial = Math.max(
    0,
    models.findIndex((m) => m.id === props.current),
  )
  const [index, setIndex] = useState(initial)
  // A narrowed query can leave the cursor past the end of the new result set.
  const cursor = models.length === 0 ? 0 : Math.min(index, models.length - 1)
  const flattened = query.trim().length > 0

  useInput((input, key) => {
    if (key.escape) {
      props.onCancel()
      return
    }
    if (key.upArrow) {
      setIndex((i) => (models.length === 0 ? 0 : (Math.min(i, models.length - 1) + models.length - 1) % models.length))
      return
    }
    if (key.downArrow) {
      setIndex((i) => (models.length === 0 ? 0 : (Math.min(i, models.length - 1) + 1) % models.length))
      return
    }
    if (key.leftArrow || key.rightArrow) {
      if (!effort) return
      const next = stepEffort(effort, key.leftArrow ? -1 : 1)
      setEffort(next)
      if (next !== effort) props.onEffort?.(next)
      return
    }
    if (key.return) {
      const picked = models[cursor]
      if (picked) props.onPick(picked.id, 'default')
      return
    }
    // Ctrl-S rather than a bare `s`: plain letters go to the search box.
    if (key.ctrl && input === 's') {
      const picked = models[cursor]
      if (picked) props.onPick(picked.id, 'session')
      return
    }
    if (key.ctrl && input === 'c') {
      props.onCancel()
      return
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1))
      setIndex(0)
      return
    }
    if (input && !key.ctrl && !key.meta) {
      setQuery((q) => q + input)
      setIndex(0)
    }
  })

  // Scroll the row window so the cursor stays inside it, anchored on the
  // MODEL index rather than the row index — section headings must not consume
  // cursor stops, or arrowing feels like it skips.
  const cursorRow = rows.findIndex((r) => r.kind === 'model' && r.model === models[cursor])
  const start = Math.max(0, Math.min(cursorRow - Math.floor(VIEWPORT / 2), rows.length - VIEWPORT))
  const visible = rows.slice(Math.max(0, start), Math.max(0, start) + VIEWPORT)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1} width={WIDTH + 4}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={THEME.brand} bold>
          Select model
        </Text>
        <Text dimColor>esc</Text>
      </Box>
      <Box flexDirection="row">
        <Text color={THEME.brand}>{'❯ '}</Text>
        {query ? <Text>{query}</Text> : <Text dimColor>Search</Text>}
      </Box>
      <Box height={1} />
      {models.length === 0 ? (
        <Text dimColor>No models match “{query}”</Text>
      ) : (
        visible.map((row, i) =>
          row.kind === 'section' ? (
            <Box key={`s-${row.label}`} marginTop={i === 0 ? 0 : 1}>
              <Text color={THEME.accent} bold>
                {row.label}
              </Text>
            </Box>
          ) : (
            <ModelRow
              key={row.model.id}
              model={row.model}
              active={row.model === models[cursor]}
              current={row.model.id === props.current}
              flattened={flattened}
            />
          ),
        )
      )}
      <Box height={1} />
      {effort ? (
        <Box flexDirection="row">
          <Text color={THEME.brand}>{'● '}</Text>
          <Text color={THEME.brand} bold>
            {effort}
          </Text>
          <Text dimColor>{' effort · ←/→ to adjust'}</Text>
        </Box>
      ) : null}
      <Text dimColor>
        {`↑/↓ move · Enter default · ctrl-s session-only · type to search${
          rows.length > VIEWPORT ? ` · ${cursor + 1}/${models.length}` : ''
        }`}
      </Text>
    </Box>
  )
}

function ModelRow(props: {
  readonly model: ModelOption
  readonly active: boolean
  readonly current: boolean
  readonly flattened: boolean
}): React.ReactElement {
  const { model, active, current, flattened } = props
  const gutter = current ? '●' : ' '
  const name = model.hint ? `${model.label}  ${model.hint}` : model.label
  const right = trailing(model, flattened)
  const left = `${gutter} ${name}`
  const pad = Math.max(1, WIDTH - left.length - right.length)

  if (active) {
    // One Text so the highlight paints as an unbroken bar.
    return (
      <Text backgroundColor={THEME.brand} color="black" bold>
        {`${left}${' '.repeat(pad)}${right}`}
      </Text>
    )
  }
  return (
    <Box flexDirection="row">
      <Text color={current ? THEME.brand : undefined}>{`${gutter} `}</Text>
      <Text color={current ? THEME.brand : undefined}>{model.label}</Text>
      {model.hint ? <Text dimColor>{`  ${model.hint}`}</Text> : null}
      <Text>{' '.repeat(pad)}</Text>
      <Text dimColor>{right}</Text>
    </Box>
  )
}
