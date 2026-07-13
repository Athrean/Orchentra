import { join, resolve, dirname, basename, extname, relative } from 'node:path'
import { existsSync, lstatSync, realpathSync, renameSync, unlinkSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'

const MAX_READ_SIZE = 10 * 1024 * 1024
const MAX_WRITE_SIZE = 10 * 1024 * 1024

type WorkspaceRoots = string | readonly string[]

export interface TextFilePayload {
  filePath: string
  content: string
  numLines: number
  startLine: number
  totalLines: number
}

export interface ReadFileOutput {
  type: string
  file: TextFilePayload
  /** sha256 of the FULL file content (not the selected range) — stale-read guard for later edits. */
  sha256: string
}

export interface StructuredPatchHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export interface WriteFileOutput {
  type: string
  filePath: string
  content: string
  structuredPatch: StructuredPatchHunk[]
  originalFile?: string
}

export interface EditFileOutput {
  filePath: string
  oldString: string
  newString: string
  originalFile: string
  updatedFile: string
  structuredPatch: StructuredPatchHunk[]
  userModified: boolean
  replaceAll: boolean
}

export interface GlobSearchOutput {
  durationMs: number
  numFiles: number
  filenames: string[]
  truncated: boolean
}

export interface GrepSearchInput {
  pattern: string
  path?: string
  glob?: string
  outputMode?: string
  before?: number
  after?: number
  context?: number
  lineNumbers?: boolean
  caseInsensitive?: boolean
  fileType?: string
  headLimit?: number
  offset?: number
  multiline?: boolean
}

export interface GrepSearchOutput {
  mode?: string
  numFiles: number
  filenames: string[]
  content?: string
  numLines?: number
  numMatches?: number
  appliedLimit?: number
  appliedOffset?: number
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Write via a temp file in the same directory + rename, so a crash mid-write
 * never leaves a half-written target. rename(2) is atomic within a filesystem;
 * same-directory keeps the temp on the same mount.
 */
async function atomicWrite(absolutePath: string, content: string): Promise<void> {
  const tmp = join(dirname(absolutePath), `.${basename(absolutePath)}.tmp-${randomBytes(6).toString('hex')}`)
  try {
    await Bun.write(tmp, content)
    renameSync(tmp, absolutePath)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      // temp never created or already renamed
    }
    throw err
  }
}

function isBinaryContent(buffer: Uint8Array): boolean {
  const checkLength = Math.min(buffer.length, 8192)
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

function normalizePath(filePath: string): string {
  return resolve(filePath)
}

function normalizePathAllowMissing(filePath: string): string {
  const candidate = resolve(filePath)
  try {
    return Bun.file(candidate).name ? candidate : candidate
  } catch {
    const parent = dirname(candidate)
    const name = basename(candidate)
    try {
      const realParent = resolve(parent)
      return join(realParent, name)
    } catch {
      return candidate
    }
  }
}

function workspaceRootList(workspaceRoot: WorkspaceRoots): string[] {
  const roots = Array.isArray(workspaceRoot) ? workspaceRoot : [workspaceRoot]
  if (roots.length === 0) throw new Error('at least one workspace root is required')
  return roots.map((root) => resolve(root))
}

function resolveWorkspacePath(filePath: string, workspaceRoot: WorkspaceRoots, allowMissing = false): string {
  const root = workspaceRootList(workspaceRoot)[0]!
  const candidate = filePath.startsWith('/') ? filePath : join(root, filePath)
  return allowMissing ? normalizePathAllowMissing(candidate) : normalizePath(candidate)
}

function validateWorkspaceBoundary(resolved: string, workspaceRoot: WorkspaceRoots): void {
  const roots = workspaceRootList(workspaceRoot)
  const normalizedPath = resolve(resolved)
  const inside = roots.some((root) => {
    const rootWithSlash = root.endsWith('/') ? root : root + '/'
    return normalizedPath.startsWith(rootWithSlash) || normalizedPath === root
  })
  if (!inside) {
    throw new Error(`path ${normalizedPath} escapes workspace boundary ${roots.join(', ')}`)
  }
}

function realpathOrResolve(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function nearestExistingParent(path: string): string {
  let current = dirname(path)
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) return current
    current = parent
  }
  return current
}

function canonicalizeAllowMissing(path: string): string {
  if (existsSync(path)) return realpathSync(path)
  const parent = nearestExistingParent(path)
  return resolve(realpathOrResolve(parent), relative(parent, path))
}

function validateFilesystemBoundary(resolved: string, workspaceRoot: WorkspaceRoots, allowMissing = false): void {
  const canonicalRoots = workspaceRootList(workspaceRoot).map((root) => canonicalizeAllowMissing(root))
  if (existsSync(resolved)) {
    validateWorkspaceBoundary(realpathSync(resolved), canonicalRoots)
    return
  }

  if (!allowMissing) return
  validateWorkspaceBoundary(canonicalizeAllowMissing(resolved), canonicalRoots)
}

function validateGlobPatternBoundary(pattern: string, basePath: string, workspaceRoot: WorkspaceRoots): void {
  const staticPrefix = pattern.split(/[*?{[]/, 1)[0] ?? pattern
  const candidate = pattern.startsWith('/') ? staticPrefix || '/' : resolve(basePath, staticPrefix || '.')
  validateWorkspaceBoundary(candidate, workspaceRoot)
}

function makePatch(original: string, updated: string): StructuredPatchHunk[] {
  const lines: string[] = []
  for (const line of original.split('\n')) {
    lines.push(`-${line}`)
  }
  for (const line of updated.split('\n')) {
    lines.push(`+${line}`)
  }

  return [
    {
      oldStart: 1,
      oldLines: original.split('\n').length,
      newStart: 1,
      newLines: updated.split('\n').length,
      lines,
    },
  ]
}

export async function readFile(filePath: string, offset?: number, limit?: number): Promise<ReadFileOutput> {
  const absolutePath = normalizePath(filePath)

  const file = Bun.file(absolutePath)
  const stat = await file.stat()
  if (!stat) throw new Error(`file not found: ${absolutePath}`)
  if (stat.size > MAX_READ_SIZE) {
    throw new Error(`file is too large (${stat.size} bytes, max ${MAX_READ_SIZE} bytes)`)
  }

  const buffer = await file.arrayBuffer()
  if (isBinaryContent(new Uint8Array(buffer))) {
    throw new Error('file appears to be binary')
  }

  const content = await file.text()
  const lines = content.split('\n')
  const startIndex = Math.min(offset ?? 0, lines.length)
  const endIndex = limit !== undefined ? Math.min(startIndex + limit, lines.length) : lines.length
  const selected = lines.slice(startIndex, endIndex).join('\n')

  return {
    type: 'text',
    file: {
      filePath: absolutePath,
      content: selected,
      numLines: endIndex - startIndex,
      startLine: startIndex + 1,
      totalLines: lines.length,
    },
    sha256: contentHash(content),
  }
}

export async function writeFile(filePath: string, content: string): Promise<WriteFileOutput> {
  if (content.length > MAX_WRITE_SIZE) {
    throw new Error(`content is too large (${content.length} bytes, max ${MAX_WRITE_SIZE} bytes)`)
  }

  const absolutePath = normalizePathAllowMissing(filePath)

  let originalFile: string | undefined
  try {
    originalFile = await Bun.file(normalizePath(filePath)).text()
  } catch {
    // file doesn't exist yet
  }

  await atomicWrite(absolutePath, content)

  return {
    type: originalFile !== undefined ? 'update' : 'create',
    filePath: absolutePath,
    content,
    structuredPatch: makePatch(originalFile ?? '', content),
    originalFile,
  }
}

export async function editFile(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
  expectedHash?: string,
): Promise<EditFileOutput> {
  const absolutePath = normalizePath(filePath)

  if (oldString === newString) {
    throw new Error('old_string and new_string must differ')
  }

  const originalFile = await Bun.file(absolutePath).text()

  if (expectedHash !== undefined && contentHash(originalFile) !== expectedHash) {
    throw new Error(`stale read: ${absolutePath} changed since it was last read — re-read the file and retry the edit`)
  }

  const occurrences = originalFile.split(oldString).length - 1
  if (occurrences === 0) {
    throw new Error('old_string not found in file')
  }
  if (occurrences > 1 && !replaceAll) {
    throw new Error(
      `old_string matches ${occurrences} times in ${absolutePath}; add surrounding context to make it unique, or pass replace_all: true`,
    )
  }

  const updated = replaceAll
    ? originalFile.split(oldString).join(newString)
    : originalFile.replace(oldString, newString)

  await atomicWrite(absolutePath, updated)

  return {
    filePath: absolutePath,
    oldString,
    newString,
    originalFile,
    updatedFile: updated,
    structuredPatch: makePatch(originalFile, updated),
    userModified: false,
    replaceAll,
  }
}

function expandBraces(pattern: string): string[] {
  const openIdx = pattern.indexOf('{')
  if (openIdx === -1) return [pattern]

  const closeIdx = pattern.indexOf('}', openIdx)
  if (closeIdx === -1) return [pattern]

  const prefix = pattern.slice(0, openIdx)
  const suffix = pattern.slice(closeIdx + 1)
  const alternatives = pattern.slice(openIdx + 1, closeIdx)

  return alternatives.split(',').flatMap((alt) => expandBraces(`${prefix}${alt}${suffix}`))
}

export async function globSearch(pattern: string, basePath?: string): Promise<GlobSearchOutput> {
  const start = performance.now()
  const base = basePath ? normalizePath(basePath) : process.cwd()

  const relativePattern = pattern.startsWith('/') ? pattern.slice(base.length + 1) : pattern
  const expanded = expandBraces(relativePattern)

  const seen = new Set<string>()
  const matches: string[] = []

  for (const pat of expanded) {
    const glob = new Bun.Glob(pat)
    for await (const relEntry of glob.scan({ cwd: base, dot: false })) {
      const entry = join(base, relEntry)
      const file = Bun.file(entry)
      const stat = await file.stat().catch(() => null)
      if (stat && !stat.isDirectory() && !seen.has(entry)) {
        seen.add(entry)
        matches.push(entry)
      }
    }
  }

  const truncated = matches.length > 100
  const filenames = matches.slice(0, 100)

  return {
    durationMs: Math.round(performance.now() - start),
    numFiles: filenames.length,
    filenames,
    truncated,
  }
}

export async function grepSearch(input: GrepSearchInput): Promise<GrepSearchOutput> {
  const basePath = input.path ? normalizePath(input.path) : process.cwd()

  const flags: string[] = []
  if (input.caseInsensitive) flags.push('i')
  if (input.multiline) flags.push('m')

  const regex = new RegExp(input.pattern, flags.join(''))

  const outputMode = input.outputMode ?? 'files_with_matches'
  const context = input.context ?? 0

  const filenames: string[] = []
  const contentLines: string[] = []
  let totalMatches = 0

  const glob = input.glob ? new Bun.Glob(input.glob) : null
  const typeExt = input.fileType ? `.${input.fileType}` : null

  async function walkDir(dir: string): Promise<string[]> {
    const files: string[] = []
    const entries = await Bun.file(dir)
      .stat()
      .catch(() => null)
    if (!entries) return files

    const dirEntries = Array.from(new Bun.Glob('*').scanSync({ cwd: dir, dot: false }))
    for (const entry of dirEntries) {
      const fullPath = join(dir, entry)
      const stat = await Bun.file(fullPath)
        .stat()
        .catch(() => null)
      if (!stat) continue
      if (stat.isDirectory()) {
        files.push(...(await walkDir(fullPath)))
      } else {
        files.push(fullPath)
      }
    }
    return files
  }

  const baseStat = await Bun.file(basePath)
    .stat()
    .catch(() => null)
  let allFiles: string[]
  if (baseStat?.isDirectory()) {
    allFiles = await walkDir(basePath)
  } else {
    allFiles = [basePath]
  }

  for (const filePath of allFiles) {
    if (glob && !glob.match(filePath) && !glob.match(basename(filePath))) continue
    if (typeExt && extname(filePath) !== typeExt) continue

    const fileContents = await Bun.file(filePath)
      .text()
      .catch(() => null)
    if (fileContents === null) continue

    if (outputMode === 'count') {
      const count = Array.from(fileContents.matchAll(regex)).length
      if (count > 0) {
        filenames.push(filePath)
        totalMatches += count
      }
      continue
    }

    const lines = fileContents.split('\n')
    const matchedLines: number[] = []
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        totalMatches++
        matchedLines.push(i)
      }
    }

    if (matchedLines.length === 0) continue

    filenames.push(filePath)
    if (outputMode === 'content') {
      for (const index of matchedLines) {
        const start = Math.max(0, index - (input.before ?? context))
        const end = Math.min(lines.length, index + (input.after ?? context) + 1)
        for (let current = start; current < end; current++) {
          const prefix = input.lineNumbers !== false ? `${filePath}:${current + 1}:` : `${filePath}:`
          contentLines.push(`${prefix}${lines[current]}`)
        }
      }
    }
  }

  const { result: limitedFilenames, appliedLimit, appliedOffset } = applyLimit(filenames, input.headLimit, input.offset)

  if (outputMode === 'content') {
    const {
      result: limitedContent,
      appliedLimit: contentLimit,
      appliedOffset: contentOffset,
    } = applyLimit(contentLines, input.headLimit, input.offset)
    return {
      mode: outputMode,
      numFiles: limitedFilenames.length,
      filenames: limitedFilenames,
      numLines: limitedContent.length,
      content: limitedContent.join('\n'),
      appliedLimit: contentLimit,
      appliedOffset: contentOffset,
    }
  }

  return {
    mode: outputMode,
    numFiles: limitedFilenames.length,
    filenames: limitedFilenames,
    content: undefined,
    numLines: undefined,
    numMatches: outputMode === 'count' ? totalMatches : undefined,
    appliedLimit,
    appliedOffset,
  }
}

function applyLimit<T>(
  items: T[],
  limit?: number,
  offset?: number,
): { result: T[]; appliedLimit?: number; appliedOffset?: number } {
  const offsetValue = offset ?? 0
  const skipped = items.slice(offsetValue)
  const explicitLimit = limit ?? 250
  if (explicitLimit === 0) {
    return {
      result: skipped,
      appliedLimit: undefined,
      appliedOffset: offsetValue > 0 ? offsetValue : undefined,
    }
  }

  const truncated = skipped.length > explicitLimit
  const result = skipped.slice(0, explicitLimit)
  return {
    result,
    appliedLimit: truncated ? explicitLimit : undefined,
    appliedOffset: offsetValue > 0 ? offsetValue : undefined,
  }
}

export async function readFileInWorkspace(
  filePath: string,
  workspaceRoot: WorkspaceRoots,
  offset?: number,
  limit?: number,
  readHashes?: Map<string, string>,
): Promise<ReadFileOutput> {
  const absolutePath = resolveWorkspacePath(filePath, workspaceRoot)
  validateWorkspaceBoundary(absolutePath, workspaceRoot)
  validateFilesystemBoundary(absolutePath, workspaceRoot)
  const result = await readFile(absolutePath, offset, limit)
  readHashes?.set(result.file.filePath, result.sha256)
  return result
}

export async function globSearchInWorkspace(
  pattern: string,
  workspaceRoot: WorkspaceRoots,
  basePath?: string,
): Promise<GlobSearchOutput> {
  const root = workspaceRootList(workspaceRoot)[0]!
  const base = basePath ? resolveWorkspacePath(basePath, workspaceRoot) : root
  validateWorkspaceBoundary(base, workspaceRoot)
  validateFilesystemBoundary(base, workspaceRoot)
  validateGlobPatternBoundary(pattern, base, workspaceRoot)
  return globSearch(pattern, base)
}

export async function grepSearchInWorkspace(
  input: GrepSearchInput,
  workspaceRoot: WorkspaceRoots,
): Promise<GrepSearchOutput> {
  const root = workspaceRootList(workspaceRoot)[0]!
  const basePath = input.path ? resolveWorkspacePath(input.path, workspaceRoot) : root
  validateWorkspaceBoundary(basePath, workspaceRoot)
  validateFilesystemBoundary(basePath, workspaceRoot)
  return grepSearch({ ...input, path: basePath })
}

export async function writeFileInWorkspace(
  filePath: string,
  content: string,
  workspaceRoot: string,
  readHashes?: Map<string, string>,
): Promise<WriteFileOutput> {
  const absolutePath = resolveWorkspacePath(filePath, workspaceRoot, true)
  validateWorkspaceBoundary(absolutePath, workspaceRoot)
  validateFilesystemBoundary(absolutePath, workspaceRoot, true)
  const result = await writeFile(absolutePath, content)
  // A write establishes known content, so later edits aren't spuriously stale.
  readHashes?.set(result.filePath, contentHash(content))
  return result
}

export async function editFileInWorkspace(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
  workspaceRoot: string,
  readHashes?: Map<string, string>,
): Promise<EditFileOutput> {
  const absolutePath = resolveWorkspacePath(filePath, workspaceRoot)
  validateWorkspaceBoundary(absolutePath, workspaceRoot)
  validateFilesystemBoundary(absolutePath, workspaceRoot)
  const result = await editFile(absolutePath, oldString, newString, replaceAll, readHashes?.get(absolutePath))
  readHashes?.set(result.filePath, contentHash(result.updatedFile))
  return result
}

export async function isSymlinkEscape(filePath: string, workspaceRoot: string): Promise<boolean> {
  try {
    const stat = lstatSync(filePath)
    if (!stat.isSymbolicLink()) return false

    const resolved = realpathSync(filePath)
    const canonicalRoot = realpathOrResolve(workspaceRoot)
    try {
      validateWorkspaceBoundary(resolved, canonicalRoot)
      return false
    } catch {
      return true
    }
  } catch {
    return false
  }
}

export { expandBraces, MAX_READ_SIZE, MAX_WRITE_SIZE }
