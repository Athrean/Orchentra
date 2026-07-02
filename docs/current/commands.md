# Commands

This file separates current slash commands from proposed naming cleanup.

## Current Slash Commands

```text
/help (/h /?)   /status (/st)   /clear (/cls)   /exit (/q)
/compact        /model (/m)     /effort         /think
/terse          /plan           /build          /review
/cost           /version (/v)   /init           /search
/scan           /debug          /diff (/d)      /commit
/pr             /issue (/iss)   /session        /resume
/skills         /mcp            /permissions    /doctor (/doc)
/config (/cfg) /memory (/mem)  /forget         /export
/login (/li)   /logout (/lo)   /reauth         /auth (/whoami)
```

## Naming Cleanup

Keep current command names for compatibility. Add clearer spine aliases as first-class controls once behavior is wired end-to-end.

| Current             | Add / prefer           | Reason                                              |
| ------------------- | ---------------------- | --------------------------------------------------- |
| `/terse`            | keep `/terse`          | Already exposes output-token control                |
| `/cost`, `/compact` | `/budget`              | Groups budget, context, and tool-output controls    |
| none                | `/lean`                | Gives lean-code review/pass a visible home          |
| `/planmode`         | `/readonly` or `/safe` | Says what the mode does, not how it is implemented  |
| `/scan`             | `/review --draft`      | Keeps code-review workflow under one command family |

## Target Taxonomy

| Family       | Commands                                                    |
| ------------ | ----------------------------------------------------------- |
| Core         | `/help`, `/status`, `/clear`, `/exit`, `/version`           |
| Model        | `/model`, `/effort`, `/think`                               |
| Spine        | `/terse`, `/budget`, `/lean`                                |
| Work         | `/plan`, `/build`, `/review`, `/debug`                      |
| Repo         | `/diff`, `/commit`, `/pr`, `/issue`, `/search`              |
| Session      | `/session`, `/resume`, `/export`, `/memory`, `/forget`      |
| Setup        | `/init`, `/doctor`, `/login`, `/logout`, `/reauth`, `/auth` |
| Integrations | `/mcp`, `/skills`, `/permissions`, `/config`                |

## Rule

Do not remove existing names until aliases have shipped and one release has passed. The goal is better names without breaking muscle memory.
