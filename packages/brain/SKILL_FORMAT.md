# SKILL.md export format

A SKILL.md document is the export-friendly view of a runbook. Another agent
(Claude Desktop, Cursor, or any LLM-driven tool) can load it as context the
same way `@orchentra/operations` exposes `tools/list` over MCP.

The format intentionally mirrors the YAML-frontmatter conventions used by
generic Markdown skill catalogs so the file is loadable without a custom
parser. The body below the frontmatter is plain Markdown.

## Shape

```
---
name: <slug>
description: <one-line summary>
triggers:
  - <free-form trigger string>
ops_used:
  - <operation id>
---

# <name>

<Markdown body — steps, verification, examples.>
```

### Frontmatter fields

| Field         | Type     | Required | Notes                                                              |
| ------------- | -------- | -------- | ------------------------------------------------------------------ |
| `name`        | string   | yes      | Short slug. Becomes the SKILL filename (`<name>/SKILL.md`).        |
| `description` | string   | yes      | One-line summary. Empty string is allowed but discouraged.         |
| `triggers`    | string[] | yes      | Free-form trigger strings (e.g. `execution.kind:ci_failure`).      |
| `ops_used`    | string[] | yes      | Operation ids the runbook calls. Used by callers to pre-check ACL. |

Empty arrays serialise as an empty YAML block (`triggers: []`), not as the
field omitted. This keeps the parser predictable.

Scalars that contain a colon, hash, leading dash, or other YAML-significant
character are emitted in double-quoted form (e.g. `"execution.kind:ci_failure"`).
The exporter applies the minimum quoting required for unambiguous parsing.

## Body conventions

Each runbook body should follow this loose template:

```
# <name>

<one-paragraph description>

## Steps

1. ...
2. ...

## Verification

- ...

## Example

...
```

The exporter does not enforce the body structure — it passes the runbook's
`body` field through verbatim under the frontmatter. Distillation (Phase 2B)
is what fills in the steps/verification/example sections.

## Round-trip guarantee

`exportSkillMd(runbook)` is pure: same input → same output. The exporter does
not stamp a timestamp, version, or generator note into the document so two
calls on the same row produce byte-identical files. Test fixtures rely on
this.
