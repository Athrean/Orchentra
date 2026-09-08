import { validatePluginContents } from './validate'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { userPaths } from '../platform/paths'
import { loadSkills } from '../runtime/skills/loader'
import { readPluginManifest, validExtensionName } from './manifest'
import { materializeSource, snapshotDirectory } from './source'

export type ExtensionKind = 'plugin' | 'skill'
export interface InstalledExtension {
  kind: ExtensionKind
  name: string
  version: string
  source: string
  revision?: string
  digest: string
  enabled: boolean
  installedAt: string
  previousDigest?: string
}
interface ExtensionFile {
  schemaVersion: 1
  entries: InstalledExtension[]
}

/** Immutable snapshots plus one atomic registry. User source trees are never changed. */
export class ExtensionStore {
  constructor(readonly root = join(userPaths().config, 'extensions')) {}
  snapshot(entry: Pick<InstalledExtension, 'digest'>): string {
    if (!/^[a-f0-9]{64}$/.test(entry.digest)) throw new Error('Invalid extension content digest')
    return join(this.root, 'objects', entry.digest)
  }
  async list(kind?: ExtensionKind): Promise<InstalledExtension[]> {
    let raw: string
    try {
      raw = await readFile(join(this.root, 'installed.json'), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const file = JSON.parse(raw) as ExtensionFile
    if (file.schemaVersion !== 1 || !Array.isArray(file.entries))
      throw new Error('Unsupported extension registry format')
    const keys = new Set<string>()
    for (const entry of file.entries) {
      if (
        !['plugin', 'skill'].includes(entry.kind) ||
        !validExtensionName(entry.name) ||
        typeof entry.enabled !== 'boolean' ||
        typeof entry.source !== 'string' ||
        typeof entry.version !== 'string'
      )
        throw new Error('Invalid extension registry entry')
      this.snapshot(entry)
      if (entry.previousDigest) this.snapshot({ digest: entry.previousDigest })
      const key = `${entry.kind}:${entry.name}`
      if (keys.has(key)) throw new Error(`Duplicate extension registry entry: ${key}`)
      keys.add(key)
    }
    return file.entries.filter((entry) => !kind || entry.kind === kind)
  }
  private async mutate<T>(
    operation: (entries: InstalledExtension[]) => Promise<{ entries: InstalledExtension[]; value: T }>,
  ): Promise<T> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const lockPath = join(this.root, '.lock')
    let lock
    try {
      lock = await open(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(`Another extension operation holds ${lockPath}`)
      throw error
    }
    const temporary = join(this.root, `.registry-${randomUUID()}`)
    try {
      await lock.writeFile(String(process.pid))
      const result = await operation(await this.list())
      const out = await open(temporary, 'wx', 0o600)
      try {
        await out.writeFile(JSON.stringify({ schemaVersion: 1, entries: result.entries }, null, 2) + '\n')
        await out.sync()
      } finally {
        await out.close()
      }
      await rename(temporary, join(this.root, 'installed.json'))
      return result.value
    } finally {
      await lock.close()
      await rm(temporary, { force: true })
      await rm(lockPath, { force: true })
    }
  }
  async install(kind: ExtensionKind, source: string, replace?: string): Promise<InstalledExtension> {
    await mkdir(join(this.root, 'objects'), { recursive: true, mode: 0o700 })
    const temporary = await mkdtemp(join(this.root, '.install-'))
    try {
      const materialized = await materializeSource(source, temporary)
      const staged = join(temporary, 'snapshot')
      const digest = await snapshotDirectory(materialized.directory, staged)
      let name: string
      let version = '0.0.0'
      if (kind === 'plugin') {
        const manifest = await readPluginManifest(staged)
        await validatePluginContents(staged, manifest)
        name = manifest.name
        version = manifest.version
      } else {
        const result = await loadSkills({
          workspaceRoot: join(temporary, 'empty'),
          configHome: join(temporary, 'empty'),
          homeDir: join(temporary, 'empty'),
          interop: false,
          cache: false,
          extraRoots: [staged],
        })
        if (result.errors.length || result.skills.length !== 1)
          throw new Error(
            `Skill installation requires one valid SKILL.md: ${result.errors.map((e) => e.message).join('; ')}`,
          )
        name = result.skills[0]!.name
        // Install the skill directory itself, not a collection, for predictable resources.
        if (result.skills[0]!.source !== join(await realpath(staged), 'SKILL.md'))
          throw new Error('Install the directory containing SKILL.md')
        if (!validExtensionName(name))
          throw new Error('Installed skill names must use lowercase letters, digits and hyphens')
      }
      if (replace && name !== replace) throw new Error(`Update cannot rename ${replace} to ${name}`)
      return await this.mutate(async (entries) => {
        const old = entries.find((entry) => entry.kind === kind && entry.name === name)
        if (old && !replace) throw new Error(`${kind} ${name} is already installed; use update`)
        if (replace && !old) throw new Error(`${kind} ${name} is not installed`)
        const entry: InstalledExtension = {
          kind,
          name,
          version,
          source: materialized.source,
          revision: materialized.revision,
          digest,
          enabled: old?.enabled ?? true,
          installedAt: new Date().toISOString(),
          previousDigest: old && old.digest !== digest ? old.digest : old?.previousDigest,
        }
        const destination = this.snapshot(entry)
        if (!(await stat(destination).catch(() => null))) await rename(staged, destination)
        return { entries: [...entries.filter((e) => e.kind !== kind || e.name !== name), entry], value: entry }
      })
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  async update(kind: ExtensionKind, name: string, source?: string): Promise<InstalledExtension> {
    const entry = (await this.list(kind)).find((e) => e.name === name)
    if (!entry) throw new Error(`${kind} ${name} is not installed`)
    return this.install(kind, source ?? entry.source, name)
  }
  async change(kind: ExtensionKind, name: string, action: 'enable' | 'disable' | 'remove' | 'rollback'): Promise<void> {
    await this.mutate(async (entries) => {
      const entry = entries.find((e) => e.kind === kind && e.name === name)
      if (!entry) throw new Error(`${kind} ${name} is not installed`)
      if (action === 'remove') return { entries: entries.filter((e) => e !== entry), value: undefined }
      if (action === 'rollback') {
        if (!entry.previousDigest) throw new Error(`${name} has no previous installation`)
        const previous = entry.previousDigest
        if (kind === 'plugin') entry.version = (await readPluginManifest(this.snapshot({ digest: previous }))).version
        entry.previousDigest = entry.digest
        entry.digest = previous
      } else entry.enabled = action === 'enable'
      return { entries, value: undefined }
    })
  }
}
