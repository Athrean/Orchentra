import { describe, expect, test } from 'bun:test'
import * as brain from '../src'

describe('@orchentra/brain package', () => {
  test('the package entry point resolves', () => {
    expect(brain).toBeDefined()
    expect(typeof brain).toBe('object')
  })
})
