# Anthropic authentication (CLI)

Orchentra's CLI sends LLM requests to Anthropic. It supports three credentials:

- **Claude Pro/Max subscription** (recommended on macOS — zero config if you already use Claude Code)
- **`claude setup-token` long-lived OAuth token** (1-year, env-only)
- **Anthropic Console API key** (`sk-ant-api03-…`, pay-per-token)

Pick whichever matches your situation. Subscription auth bills against your Pro/Max plan; API-key auth bills against your Console organization.

## macOS quick start — Claude Pro/Max users

If you already log in to **Claude Code** on your Mac, Orchentra picks up that session automatically. No second login.

```bash
orchentra
# → first request triggers a one-time macOS Keychain prompt
# → "Always Allow" (or "Allow") → Orchentra has access to your subscription
```

What happens under the hood: on the first request without an Orchentra-stored credential, the CLI reads the `Claude Code-credentials` generic-password entry from your login keychain, parses the bundled OAuth tokens, and copies them into `~/.config/orchentra/credentials.json`. The standard refresh path takes over from there. Your Claude Code session is not modified.

If you have multiple Claude Code accounts, the canonical entry is preferred; the first matching variant wins otherwise. Use `/login` to override the choice.

## Manual login (any platform)

```text
/login
```

Picks the Anthropic provider, opens `https://claude.ai/oauth/authorize` in your browser, and waits for you to paste the `code#state` string back. Tokens are stored in `~/.config/orchentra/credentials.json` (mode 0600).

## Environment variables

Resolution precedence (first match wins):

1. `ANTHROPIC_AUTH_TOKEN` — bearer token, sent as `Authorization: Bearer …`
2. `ANTHROPIC_API_KEY` — Console API key, sent as `X-Api-Key`
3. `CLAUDE_CODE_OAUTH_TOKEN` — long-lived OAuth token from `claude setup-token`
4. Stored credential at `~/.config/orchentra/credentials.json`
5. **macOS only:** Claude Code Keychain auto-import (see above)

| Variable                          | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `ANTHROPIC_API_KEY`               | Pay-per-token API key (`sk-ant-api03-…`)                   |
| `ANTHROPIC_AUTH_TOKEN`            | OAuth bearer (`sk-ant-oat01-…`); short-lived runtime token |
| `CLAUDE_CODE_OAUTH_TOKEN`         | Long-lived OAuth bearer minted by `claude setup-token`     |
| `ANTHROPIC_OAUTH_CLIENT_ID`       | Override the OAuth client id (rarely needed)               |
| `ORCHENTRA_NO_CLAUDE_CODE_IMPORT` | Set to `1` to disable the macOS Keychain auto-import       |
| `ORCHENTRA_CONFIG_HOME`           | Override `~/.config/orchentra` (used for test isolation)   |

## Opt out of Keychain auto-import

Shared machines, CI, or anywhere you don't want Orchentra reading other apps' keychain entries:

```bash
export ORCHENTRA_NO_CLAUDE_CODE_IMPORT=1
```

The CLI then skips the Keychain check entirely and falls through to whatever you provide via env or `/login`.

## Troubleshooting

**`OAuth authentication is currently not supported`** — your bearer is reaching Anthropic but a required beta header is missing. The CLI sends `oauth-2025-04-20` automatically; if you've intercepted the request via a proxy that strips beta headers, allow them through.

**`This credential is only authorized for use with Claude Code` (HTTP 429 in a loop)** — the Claude Code system prefix block is missing or merged with another block. The CLI emits it as its own first system block on the OAuth path; if you've forked the request shape, restore that ordering.

**The `sk-ant-api03-* keys go in ANTHROPIC_API_KEY` enrichment** — you put a Console API key in `ANTHROPIC_AUTH_TOKEN`. Move it to `ANTHROPIC_API_KEY` (or the reverse for an OAuth bearer).

**Logout** — `/logout` clears Orchentra's stored credential. The Claude Code Keychain entry is **not** touched. To re-import it, run a fresh request; to switch to a different account, use `/login`.

## Notes on subscription auth

- Reading the Claude Code Keychain entry only happens on macOS, only for the user running the CLI, and only against entries that user already created with their own `claude /login`. Orchentra does not transmit the credentials anywhere except to `api.anthropic.com`.
- Anthropic's Agent SDK terms restrict third-party reuse of `claude.ai` login; ship subscription auth with disclosure to your end users.
- Long-running server-side workloads (cron, webhook triage) currently use the org-level API key configured in `orchentra.yml`. Subscription auth is CLI-only at the moment.
