/**
 * Fast-path detector for streaming markdown: long assistant turns are
 * dominated by plain prose, and lexing every delta wastes CPU. If the
 * first 500 chars of an input contain none of the markers used by any
 * block- or inline-level rule, the parser can emit a single text token
 * and skip the lexer entirely.
 *
 * The marker set is the union of every entry point the lexer respects:
 *   `   inline code, fenced code
 *   #   ATX heading
 *   *   bold/italic/unordered list
 *   _   italic
 *   >   blockquote
 *   -   unordered list
 *   [   link
 *   ~   tilde-fenced code
 */
const MARKERS = new Set(['`', '#', '*', '_', '>', '-', '[', '~'])
const WINDOW = 500

export function isPlainText(input: string): boolean {
  const end = Math.min(input.length, WINDOW)
  for (let i = 0; i < end; i++) {
    if (MARKERS.has(input[i])) return false
  }
  return true
}
