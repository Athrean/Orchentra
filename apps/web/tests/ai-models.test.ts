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
    expect(getModelLabel('gpt-5.5')).toBe('GPT-5.5')
    expect(getModelLabel('gemini-3.1-pro-preview')).toBe('Gemini 3.1 Pro')
  })

  it('labels routed model ids by clean model name', () => {
    expect(getModelLabel('anthropic/claude-opus-4-8')).toBe('Opus 4.8')
    expect(getModelLabel('openai/gpt-5.5')).toBe('GPT-5.5')
    expect(getModelLabel('google/gemini-3.1-pro-preview')).toBe('Gemini 3.1 Pro')
  })

  it('falls back to the raw id for unknown models', () => {
    expect(getModelLabel('some-weird-model')).toBe('some-weird-model')
  })
})

describe('buildModelMenu', () => {
  it('puts the best frontier model per provider first, in order', () => {
    const menu = buildModelMenu()
    expect(menu.primary.map((m) => m.label)).toEqual(['Opus 4.8', 'GPT-5.5', 'Gemini 3.1 Pro'])
  })

  it('keeps OpenRouter aliases under "more"', () => {
    const menu = buildModelMenu()
    const moreIds = menu.more.map((m) => m.id)
    expect(moreIds).toContain('anthropic/claude-opus-4-8')
    expect(moreIds).toContain('openai/gpt-5.5')
    expect(moreIds).not.toContain('claude-opus-4-8')
    expect(moreIds).not.toContain('gpt-4.1')
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

  it('default model is the best Anthropic frontier model', () => {
    expect(DEFAULT_MODEL_ID).toBe('claude-opus-4-8')
    expect(PRIMARY_MODEL_IDS).toContain(DEFAULT_MODEL_ID)
  })

  it('keeps older supported defaults in provider settings catalog', () => {
    expect(getProviderCatalogItem('openai').models).toContain('gpt-4.1')
    expect(getProviderCatalogItem('anthropic').models).toContain('claude-sonnet-4-6')
    expect(getProviderCatalogItem('google').models).toContain('gemini-2.5-pro')
  })
})
