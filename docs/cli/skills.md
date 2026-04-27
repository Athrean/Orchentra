# Skills — author guide

Skills are reusable prompts that ship as `SKILL.md` files. The CLI discovers them at boot, registers each as a slash command, and runs the body as a turn when invoked. A skill named `deploy` becomes `/deploy`.

This guide covers everything you need to ship a skill. The reader should be able to author a working `/deploy` command end-to-end without reading the loader source.

For the original design, see PRD [#196](https://github.com/Rish-it/Orchentra/issues/196). For implementation slices, see [#197](https://github.com/Rish-it/Orchentra/issues/197) (loader), [#198](https://github.com/Rish-it/Orchentra/issues/198) (validator), [#199](https://github.com/Rish-it/Orchentra/issues/199) (arguments), [#200](https://github.com/Rish-it/Orchentra/issues/200) (allowed-tools), [#201](https://github.com/Rish-it/Orchentra/issues/201) (precedence), [#202](https://github.com/Rish-it/Orchentra/issues/202) / [#203](https://github.com/Rish-it/Orchentra/issues/203) (`/skills` list + reload).

## Overview

A skill is a folder with a single `SKILL.md`:

```
.orchentra/skills/deploy/SKILL.md
```

The file has YAML frontmatter (between `---` fences) and a markdown body:

```markdown
---
name: deploy
description: Deploy a service to an environment
allowed-tools: [Bash(kubectl:*)]
arguments: [service, environment]
---

Deploy `$0` to `$1` using kubectl.
```

When the CLI starts, it scans configured directories, loads every valid skill, and registers `/deploy` as a slash command. Invoking `/deploy api prod` runs the body with `$0` → `api`, `$1` → `prod`.

## Discovery precedence

Skills load from two roots, with **workspace overriding user** on name collision:

| Scope     | Path                             | Notes                                                       |
| --------- | -------------------------------- | ----------------------------------------------------------- |
| Workspace | `<repo>/.orchentra/skills/`      | Per-project — checked into git or local-only                |
| User      | `$ORCHENTRA_CONFIG_HOME/skills/` | Personal — applies across every project the CLI is run from |

If both define `deploy`, the workspace skill wins and a warning is recorded ("workspace skill overrides user skill at `<path>`"). Use `/skills` to inspect what loaded and which were shadowed.

`ORCHENTRA_CONFIG_HOME` defaults to a per-OS config dir. Set it explicitly to share a skill set across machines:

```bash
export ORCHENTRA_CONFIG_HOME="$HOME/.config/orchentra"
```

## Frontmatter schema

| Field                      | Type     | Required | Default | Description                                                                             |
| -------------------------- | -------- | -------- | ------- | --------------------------------------------------------------------------------------- |
| `name`                     | string   | yes      | —       | Slash-command name. `name: deploy` registers `/deploy`.                                 |
| `description`              | string   | yes      | —       | One-line summary shown in `/help` and `/skills`.                                        |
| `allowed-tools`            | string[] | no       | `[]`    | Tool patterns the skill is allowed to call. See [allowed-tools syntax](#allowed-tools). |
| `arguments`                | string[] | no       | `[]`    | Positional argument names. Documentation only — does not constrain `$0..$9`.            |
| `disable-model-invocation` | boolean  | no       | `false` | Reserved. Currently parsed but not enforced.                                            |

The frontmatter parser is a YAML subset:

- Scalars: `key: value` (string)
- Inline arrays: `key: [a, b, c]` (array of strings)
- Booleans: `key: true` / `key: false`

Block-style YAML (multi-line lists with `-`, nested maps) is **not** supported. Keep frontmatter inline.

### Examples

```yaml
---
name: hello
description: Say hi
---
```

```yaml
---
name: deploy
description: Plan and execute a rollout
allowed-tools: [Bash(kubectl:*), Bash(helm:*)]
arguments: [service, environment]
---
```

## Argument substitution

Arguments are tokenized from whatever follows the slash command. `/deploy api prod` produces `args = ['api', 'prod']`.

| Placeholder  | Resolves to                                                |
| ------------ | ---------------------------------------------------------- |
| `$ARGUMENTS` | All args joined with a single space (`'api prod'`).        |
| `$0` … `$9`  | Positional arg at that index. Out-of-range → empty string. |
| `\$0`        | Literal `$0` — the backslash escapes the placeholder.      |

Notes:

- Only positionals 0–9 resolve. `$10` is parsed as `$1` followed by `0` — i.e., `<arg-1>0`.
- `$ARGUMENTS` and positional placeholders can be mixed in the same body.
- Repeated references resolve consistently — `$0 then $0` becomes `api then api`.
- `$0extra` does not greedily eat `extra` — it becomes `apiextra`.

## Allowed-tools

`allowed-tools` is a permission overlay applied for the duration of the skill turn. Each entry is a rule string parsed by the CLI's permission grammar.

| Pattern                | Meaning                                            |
| ---------------------- | -------------------------------------------------- |
| `Bash(kubectl:*)`      | Any `kubectl …` command.                           |
| `Bash(helm:*)`         | Any `helm …` command.                              |
| `Bash(gh:*)`           | Any `gh …` command (GitHub CLI).                   |
| `mcp__terraform__plan` | Exact MCP tool name `mcp__terraform__plan`.        |
| `mcp__terraform__*`    | Every MCP tool exposed by the `terraform` server.  |
| `Read`                 | The built-in `Read` tool (no argument constraint). |

Empty / whitespace-only entries are skipped with a warning written to stderr. The resulting overlay is applied as the `allow` list for the turn. It does not currently promote denies or prompts — those remain whatever the host runtime configured.

## Slash commands

| Command          | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `/<skill-name>`  | Run the skill. Anything after the name becomes positional args.      |
| `/skills`        | List every loaded skill plus any load errors.                        |
| `/skills reload` | Rescan both roots and re-register handlers (hot reload, no restart). |
| `/restart`       | Re-exec the CLI in place. Use after upgrading the binary.            |

## Hot reload

`/skills reload` re-runs the loader and updates the slash command registry in place. The reload reports the delta:

```
reloaded · +2 added · -1 removed · 0 errors
```

Edits to a `SKILL.md` body are picked up — no process restart needed. Delete a folder and it disappears from the registry on the next reload.

## Error handling

Skills with broken frontmatter do **not** crash the CLI. They are surfaced through `/skills` with a per-file diagnostic:

| Error                                | Cause                                                                |
| ------------------------------------ | -------------------------------------------------------------------- |
| `missing opening --- fence`          | The file does not start with `---`.                                  |
| `missing closing --- fence`          | The opening `---` is never closed.                                   |
| `invalid frontmatter line: '<line>'` | A line has no `:` separator.                                         |
| `'name' is required`                 | `name` is missing or empty.                                          |
| `'description' is required`          | `description` is missing or empty.                                   |
| `'<field>' must be a string`         | `name` or `description` is not a string.                             |
| `'allowed-tools' must be an array …` | `allowed-tools` / `arguments` is set but is not an array of strings. |
| `'disable-model-invocation' must …`  | Value is not a boolean (`true`/`false`).                             |

Run `/skills` after editing a skill to confirm it loaded without errors.

## Troubleshooting

**`/<skill>` does not appear in `/help`.**
The skill failed to load. Run `/skills` and check the error rows. Common causes: wrong path (skill lives in `.orchentra/skills/<name>/SKILL.md`, not the root), missing `---` fences, missing `name`.

**Skill loads but `$0` is empty.**
You did not pass enough args. `/deploy api` resolves `$0` → `api`, `$1` → empty. Out-of-range positionals always resolve to empty rather than throwing.

**Workspace skill is being shadowed by a user skill.**
That cannot happen — workspace always wins. The reverse can: a user-level skill is shadowed by a workspace-level skill of the same name. `/skills` lists which one is active and warns about the override.

**`Bash(kubectl *)` does not seem to allow my command.**
Check the rule shape. `Bash(kubectl:*)` (with `:`) is the prefix matcher and is what you almost always want. `Bash(kubectl *)` (with space) parses as an **exact** match for the literal string `kubectl *`, so it will never match a real command. The samples in `examples/skills/` use the prefix form.

**Edit to `SKILL.md` is not picked up.**
Run `/skills reload`. The CLI loads skills once at boot; reload re-scans the roots.

**`allowed-tools` warnings on stderr.**
Empty / whitespace entries are dropped with a warning. Remove them or replace with valid patterns.

## Examples

### `/hello` — minimal

```markdown
---
name: hello
description: Say hi
---

Say "hi" back to the user. Keep it short.
```

Invocation: `/hello`. Body has no placeholders, no tool overlay, no args.

### `/deploy <service> <environment>` — parametric

```markdown
---
name: deploy
description: Plan and execute a kubectl rollout for $0 to $1
allowed-tools: [Bash(kubectl:*), Bash(helm:*)]
arguments: [service, environment]
---

Deploy `$0` to the `$1` environment.

1. Confirm `kubectl config current-context` is `$1`.
2. Show `kubectl rollout history deployment/$0`.
3. Apply `deploy/$1/$0.yaml` if it exists, otherwise `helm upgrade --dry-run`.
4. Watch `kubectl rollout status deployment/$0 -n $1` for up to 5 minutes.
5. On failure, suggest a rollback command but do **not** execute it.
```

Invocation: `/deploy api prod`. Body resolves `$0` → `api`, `$1` → `prod`. The kubectl/helm allow-list is in effect for the turn.

### `/k8s-rollout-status <deployment>` — read-only

```markdown
---
name: k8s-rollout-status
description: Report the current rollout state of a deployment
allowed-tools: [Bash(kubectl:*)]
arguments: [deployment]
---

Report the current rollout status of `$0`.

1. Run `kubectl rollout status deployment/$0 --watch=false`.
2. Run `kubectl get pods -l app=$0 -o wide`.
3. Summarize: ready replicas, image tag, last condition. No mutations.
```

Invocation: `/k8s-rollout-status api`. Read-only — the prompt itself instructs no mutations, and the allow-list scopes the runtime to `kubectl`.

## See also

- PRD: [#196](https://github.com/Rish-it/Orchentra/issues/196)
- Sample skills: [`examples/skills/`](../../examples/skills/)
- Permission grammar: `packages/cli-core/src/runtime/permissions.ts`
