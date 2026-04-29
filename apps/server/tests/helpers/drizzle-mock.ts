/**
 * Shared baseline for `mock.module('drizzle-orm', ...)`.
 * See tests/helpers/ai-mock.ts for the rationale.
 */
export function drizzleMockBase(): Record<string, unknown> {
  return {
    eq: () => ({}),
    and: (...c: unknown[]) => c,
    or: (...c: unknown[]) => c,
    gt: () => ({}),
    gte: () => ({}),
    lt: () => ({}),
    lte: () => ({}),
    asc: (col: unknown) => col,
    desc: (col: unknown) => col,
    isNull: () => ({}),
    isNotNull: () => ({}),
    inArray: () => ({}),
    notInArray: () => ({}),
    ilike: () => ({}),
    count: () => 0,
    max: () => ({}),
    sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: true, s, v }),
  }
}
