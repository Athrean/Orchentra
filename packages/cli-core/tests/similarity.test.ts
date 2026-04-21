import { test, expect, describe } from 'bun:test'
import { cosineSimilarity, SIMILARITY_THRESHOLD } from '../src/memory/similarity'

describe('cosineSimilarity', () => {
  test('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1)
  })

  test('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0)
  })

  test('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1)
  })

  test('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })

  test('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  test('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  test('computes similarity for multi-dimensional vectors', () => {
    const a = [1, 2, 3]
    const b = [4, 5, 6]
    const dot = 1 * 4 + 2 * 5 + 3 * 6
    const normA = Math.sqrt(1 + 4 + 9)
    const normB = Math.sqrt(16 + 25 + 36)
    expect(cosineSimilarity(a, b)).toBeCloseTo(dot / (normA * normB))
  })
})

describe('SIMILARITY_THRESHOLD', () => {
  test('is 0.78 matching server default', () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.78)
  })
})
