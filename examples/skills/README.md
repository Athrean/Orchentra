## Example skills

Drop these into `<repo>/.orchentra/skills/<name>/SKILL.md` (workspace-level) or `~/.orchentra/skills/<name>/SKILL.md` (user-level). The CLI registers each as a slash command at REPL boot.

| Skill      | Trigger                   | Notes                                                                         |
| ---------- | ------------------------- | ----------------------------------------------------------------------------- |
| `incident` | `/incident <description>` | Triage flow — `$ARGUMENTS` carries the description.                           |
| `deploy`   | `/deploy <service> <env>` | Positional `$0`/`$1` for service + environment. Scoped to `kubectl` + `helm`. |

See PRD #196 for the broader skill-loader story and #197/#198/#199/#200/#201 for the implementation slices.
