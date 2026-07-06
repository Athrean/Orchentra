import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { AskUserOption, AskUserRequest } from '@orchentra/cli-core'
import { THEME } from '../theme'

export interface AskUserSelectedOption {
  readonly index: number
  readonly id?: string
  readonly label: string
}

export interface AskUserPromptResponse {
  readonly question: string
  readonly multiSelect?: boolean
  readonly selectedOptions?: readonly AskUserSelectedOption[]
  readonly other?: string
  readonly cancelled?: boolean
}

export interface AskUserPromptProps {
  readonly request: AskUserRequest
  readonly rawText?: boolean
  readonly onSubmit: (response: string) => void
}

type PromptMode = 'choice' | 'text'

interface ChoiceRow {
  readonly kind: 'option' | 'other'
  readonly label: string
  readonly description?: string
}

export function AskUserPrompt(props: AskUserPromptProps): React.ReactElement {
  const options = props.request.options ?? []
  const hasChoices = options.length > 0
  const allowOther = hasChoices && props.request.allowOther !== false
  const rows = useMemo<readonly ChoiceRow[]>(() => {
    const optionRows = options.map((option) => {
      const row: ChoiceRow = { kind: 'option', label: option.label }
      return option.description ? { ...row, description: option.description } : row
    })
    return allowOther ? [...optionRows, { kind: 'other', label: 'Other' }] : optionRows
  }, [allowOther, options])
  const multiSelect = props.request.multiSelect === true
  const [mode, setMode] = useState<PromptMode>(props.rawText || !hasChoices ? 'text' : 'choice')
  const [selected, setSelected] = useState(0)
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set())
  const [otherText, setOtherText] = useState('')

  const submitCancel = (): void => {
    if (props.rawText) {
      props.onSubmit('')
      return
    }
    props.onSubmit(JSON.stringify({ question: props.request.question, cancelled: true }))
  }

  const submitOptions = (indexes: readonly number[], other?: string): void => {
    props.onSubmit(
      JSON.stringify({
        question: props.request.question,
        multiSelect,
        selectedOptions: indexes.map((index) => optionResponse(index, options[index]!)),
        ...(other && other.length > 0 ? { other } : {}),
      }),
    )
  }

  const submitText = (): void => {
    const trimmed = otherText.trim()
    if (props.rawText) {
      props.onSubmit(trimmed)
      return
    }
    const selectedIndexes = multiSelect
      ? Array.from(checked).filter((index) => index >= 0 && index < options.length)
      : []
    submitOptions(selectedIndexes, trimmed)
  }

  const enterOther = (): void => {
    setMode('text')
  }

  const toggleSelected = (): void => {
    if (selected >= options.length) {
      enterOther()
      return
    }
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(selected)) next.delete(selected)
      else next.add(selected)
      return next
    })
  }

  useInput((input, key) => {
    if (mode === 'text') {
      if (key.escape) {
        if (!props.rawText && hasChoices) {
          setMode('choice')
          return
        }
        submitCancel()
        return
      }
      if (key.return) {
        submitText()
        return
      }
      if (key.backspace || key.delete) {
        setOtherText((text) => text.slice(0, -1))
        return
      }
      if (key.ctrl && input === 'u') {
        setOtherText('')
        return
      }
      if (input && !key.ctrl && !key.meta) setOtherText((text) => text + input)
      return
    }

    if (key.escape) {
      submitCancel()
      return
    }
    if (rows.length === 0) return
    if (key.upArrow) {
      setSelected((index) => (index - 1 + rows.length) % rows.length)
      return
    }
    if (key.downArrow) {
      setSelected((index) => (index + 1) % rows.length)
      return
    }
    if (/^[1-9]$/.test(input)) {
      const index = Number(input) - 1
      if (index < 0 || index >= rows.length) return
      if (index >= options.length) {
        setSelected(index)
        enterOther()
        return
      }
      if (multiSelect) {
        setSelected(index)
        setChecked((current) => {
          const next = new Set(current)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          return next
        })
        return
      }
      submitOptions([index])
      return
    }
    if (multiSelect && input === ' ') {
      toggleSelected()
      return
    }
    if (key.return) {
      if (selected >= options.length) {
        enterOther()
        return
      }
      if (multiSelect) {
        const selectedIndexes = Array.from(checked).filter((index) => index >= 0 && index < options.length)
        submitOptions(selectedIndexes)
        return
      }
      submitOptions([selected])
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Question
      </Text>
      <Text>{props.request.question}</Text>
      <Box height={1} />
      {mode === 'text' ? (
        <>
          <Text color={THEME.brand}>{props.rawText ? 'Response' : 'Other response'}</Text>
          <Text>
            {'> '}
            {otherText.length > 0 ? otherText : ' '}
          </Text>
          <Box height={1} />
          <Text dimColor>Enter submit · Esc cancel</Text>
        </>
      ) : (
        <>
          {rows.map((row, index) => (
            <Box key={`${row.kind}-${index.toString()}`} flexDirection="column">
              <Text color={index === selected ? THEME.brand : undefined}>
                {index === selected ? '❯ ' : '  '}
                {multiSelect ? `${checked.has(index) ? '[x]' : '[ ]'} ` : ''}
                {index + 1}. {row.label}
              </Text>
              {row.description ? <Text dimColor> {row.description}</Text> : null}
            </Box>
          ))}
          <Box height={1} />
          <Text dimColor>
            {multiSelect
              ? '↑/↓ move · Space toggle · Enter submit · Esc cancel'
              : '↑/↓ move · Enter select · Esc cancel'}
          </Text>
        </>
      )}
    </Box>
  )
}

function optionResponse(index: number, option: AskUserOption): AskUserSelectedOption {
  return option.id ? { index, id: option.id, label: option.label } : { index, label: option.label }
}
