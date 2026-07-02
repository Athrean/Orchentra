# Hosted Credit Proxy Proposal

Status: proposal. Not part of the current CLI or static marketing site.

## Why

CommandCode sells subscriptions, credits, provider discounts, team billing, and a Studio control plane. Orchentra currently has a static marketing site and BYOK CLI. That is a clean privacy default, but it leaves no path for users who want included credits or team billing.

## Boundary

The hosted credit proxy must be a separate service.

It must not be smuggled into:

- `apps/web` static marketing site
- `apps/cli` core runtime
- local session/memory files
- CLI-only zero-DB architecture

## Modes

| Mode   | Default | Data path                          | Billing                     |
| ------ | ------- | ---------------------------------- | --------------------------- |
| BYOK   | yes     | CLI -> provider                    | user pays provider directly |
| Credit | no      | CLI -> Orchentra proxy -> provider | Orchentra meters and bills  |

The CLI must make the active mode obvious.

## Required Hosted Pieces

- Auth/account system.
- Stripe or equivalent billing.
- Metering ledger.
- Credit balance and top-up flow.
- Provider-key custody.
- Usage limits and hard stops.
- Team/org ownership.
- Audit log.
- Revocation path.

## CLI Integration

Minimum CLI surface if approved:

```text
orchentra login
orchentra billing status
orchentra billing usage
orchentra billing switch byok|credit
```

Slash aliases can follow later:

```text
/billing
/budget usage
```

## Trust Rules

- BYOK remains available without account creation.
- Credit mode is opt-in.
- No code is used for training.
- No telemetry in BYOK mode.
- Usage reports must distinguish model list price, discount, and effective credit burn.

## Do Not Build Yet

Do not implement this before:

1. P0 permission/workspace safety fixes are done.
2. Spine commands are first-class.
3. `/review` verification is stronger than basename matching.
4. There is explicit approval to introduce hosted auth, DB, and billing.
