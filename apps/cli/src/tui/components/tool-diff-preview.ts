/**
 * Turn a file-editing tool's raw input into a git-style unified diff string so
 * the approval prompt can show *what changes* instead of a JSON blob — the
 * difference between approving a change and approving blind. Returns null for
 * tools that don't edit files, or when the input can't be parsed.
 */
export function buildToolDiffPreview(toolName: string, inputJson: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(inputJson)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const input = parsed as Record<string, unknown>
  const path = typeof input.path === 'string' ? input.path : null
  if (path === null) return null

  if (toolName === 'edit_file') {
    const oldString = typeof input.old_string === 'string' ? input.old_string : null
    const newString = typeof input.new_string === 'string' ? input.new_string : null
    if (oldString === null || newString === null) return null
    return renderDiff(path, oldString, newString)
  }
  if (toolName === 'write_file') {
    const content = typeof input.content === 'string' ? input.content : null
    if (content === null) return null
    return renderDiff(path, '', content)
  }
  return null
}

function renderDiff(path: string, oldText: string, newText: string): string {
  const del = oldText === '' ? [] : oldText.split('\n').map((line) => `-${line}`)
  const add = newText === '' ? [] : newText.split('\n').map((line) => `+${line}`)
  return [`diff --git a/${path} b/${path}`, ...del, ...add].join('\n')
}
