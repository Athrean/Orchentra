---
name: deploy
description: Plan and execute a kubectl-based deploy for $0 to $1
allowed-tools: [Bash(kubectl:*), Bash(helm:*)]
arguments: [service, environment]
---

Deploy `$0` to the `$1` environment.

1. Confirm the target context (`kubectl config current-context`) is `$1`.
2. Show the rollout history for `$0` (`kubectl rollout history deployment/$0`).
3. Apply the manifest at `deploy/$1/$0.yaml` if it exists, otherwise dry-run a Helm upgrade.
4. Watch the rollout (`kubectl rollout status deployment/$0 -n $1`) for up to 5 minutes.
5. On failure, automatically suggest a rollback command but do NOT execute it.
