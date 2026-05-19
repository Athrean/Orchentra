/**
 * Tiny LRU cache used by the markdown parser to avoid re-lexing the same
 * streaming buffer on every delta. Backed by a `Map` because JS `Map`
 * preserves insertion order — re-inserting a key on access promotes it to
 * the most-recently-used position. The least-recently-used key is always
 * the first one yielded by `map.keys()`, so eviction is O(1).
 */
export class LruCache<K, V> {
  private readonly store = new Map<K, V>()
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
  }

  get size(): number {
    return this.store.size
  }

  get(key: K): V | undefined {
    if (!this.store.has(key)) return undefined
    const value = this.store.get(key) as V
    // Re-insert to mark as most-recently-used.
    this.store.delete(key)
    this.store.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    } else if (this.store.size >= this.capacity) {
      const oldest = this.store.keys().next().value as K | undefined
      if (oldest !== undefined) this.store.delete(oldest)
    }
    this.store.set(key, value)
  }

  clear(): void {
    this.store.clear()
  }
}
