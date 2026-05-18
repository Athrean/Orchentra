export interface RepoRow {
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly private: boolean
  readonly description: string | null
}

export interface RepoRowWithInstall extends RepoRow {
  readonly installed: boolean
}

/**
 * Pure annotation step: attach `installed: bool` to each repo row by
 * matching the row's owner against the lowercased set of owners that have
 * the Orchentra GitHub App installed. Lowercase match because git remotes
 * sometimes echo back mixed-case owners that GH canonicalises differently.
 */
export function markRepoInstallation(
  rows: readonly RepoRow[],
  installedOwners: ReadonlySet<string>,
): RepoRowWithInstall[] {
  return rows.map((row) => ({ ...row, installed: installedOwners.has(row.owner.toLowerCase()) }))
}
