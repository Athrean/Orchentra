import { describe, expect, it } from 'bun:test'
import { buildModelMenu, DEFAULT_MODEL_ID, getModelLabel, PRIMARY_MODEL_IDS } from '../lib/ai/models'
import { getProviderCatalogItem } from '../lib/ai-providers/catalog'

describe('getModelLabel', () => {
  it('humanizes claude model ids', () => {
    expect(getModelLabel('claude-opus-4-8')).toBe('Opus 4.8')
    expect(getModelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6')
    expect(getModelLabel('claude-haiku-4-5')).toBe('Haiku 4.5')
  })

  it('labels non-claude models', () => {
    expect(getModelLabel('gpt-4.1')).toBe('GPT-4.1')
    expect(getModelLabel('gemini-2.5-pro')).toBe('Gemini 2.5 Pro')
  })

  it('falls back to the raw id for unknown models', () => {
    expect(getModelLabel('some-weird-model')).toBe('some-weird-model')
  })
})

describe('buildModelMenu', () => {
  it('puts opus 4.8 / sonnet 4.6 / haiku 4.5 first, in order', () => {
    const menu = buildModelMenu()
    expect(menu.primary.map((m) => m.label)).toEqual(['Opus 4.8', 'Sonnet 4.6', 'Haiku 4.5'])
  })

  it('keeps older anthropic models under "more"', () => {
    const menu = buildModelMenu()
    const moreIds = menu.more.map((m) => m.id)
    expect(moreIds).toContain('claude-opus-4-7')
    expect(moreIds).not.toContain('claude-opus-4-8')
  })

  it('never duplicates a model across primary and more', () => {
    const menu = buildModelMenu()
    const ids = [...menu.primary, ...menu.more].map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('catalog', () => {
  it('includes claude-opus-4-8 in the anthropic catalog', () => {
    expect(getProviderCatalogItem('anthropic').models).toContain('claude-opus-4-8')
  })

  it('default model is sonnet 4.6 and is a primary model', () => {
    expect(DEFAULT_MODEL_ID).toBe('claude-sonnet-4-6')
    expect(PRIMARY_MODEL_IDS).toContain(DEFAULT_MODEL_ID)
  })
})
