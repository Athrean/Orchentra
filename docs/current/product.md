# Product

Orchentra is a CLI-first coding crew that spends less, writes less, and proves its review by running the code.

## Product Boundary

- The product is the CLI.
- The CLI is BYOK by default.
- The CLI stores local state in files, not a hosted database.
- `apps/web` is a static marketing site.
- There is no live web reviewer, dashboard, auth flow, GitHub App onboarding, repo subscription system, or shared web store.

## Spine

Every built-in agent should be:

```text
output discipline + context budget + lean code + task focus
```

| Spine skill         | Job                                                                                                | Current state                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `output discipline` | Terse output; never compresses code, paths, errors, approvals, or safety text                      | Partially shipped as `/terse`                                |
| `context budget`    | Context budget, live-zone compaction, tool-output caps, dollar ceilings                            | Partially shipped across budget/compaction/tool-output paths |
| `lean code`         | Lean-code discipline: YAGNI -> stdlib -> native -> existing dep -> one line -> minimum custom code | Partially shipped in `/plan` and builder prompts             |

The names are not decoration. They are the product contract. Specialist agents inherit the spine instead of creating unrelated behaviors.

## Specialist Agents

| Agent / command | Job                                                                           | Rule                                                           |
| --------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/plan`         | Architect a need into stack, alternatives, architecture, scaffold, and checks | Proposal first; no surprise writes unless explicitly requested |
| `/build`        | Implement vertical slices and run project checks                              | No commits or pushes; stop when gates fail                     |
| `/review`       | Produce findings and verify them by running project checks                    | Untrusted producer, trusted checker                            |

## Subscription Boundary

Subscription management does not belong in the static marketing site or CLI core.

If Orchentra sells included credits later, that is a separate opt-in hosted credit proxy:

- BYOK mode remains the default.
- Credit mode uses hosted accounts, Stripe, metering, and provider-key custody.
- The hosted proxy is a separate service with a separate trust boundary.
- The CLI must clearly show which mode is active.

See [`../proposals/hosted-credit-proxy.md`](../proposals/hosted-credit-proxy.md).
