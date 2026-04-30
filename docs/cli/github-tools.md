# GitHub tools

The CLI agent has dedicated GitHub tools so it can answer questions about issues and pull requests without falling back to `web_fetch` on `github.com` (which returns raw HTML on public repos and 404 on private ones).

## Tools

| Tool                   | Purpose                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `github_list_issues`   | List issues for a repo, optionally filtered by `state`, `labels`, `limit`. Strips PR entries that GitHub returns alongside issues. |
| `github_get_issue`     | Fetch a single issue by number, including body and labels.                                                                         |
| `github_list_pulls`    | List pull requests, optionally filtered by `state`, `base`, `head`, `limit`.                                                       |
| `github_get_pull`      | Fetch a single PR by number, including body, mergeability, and changed files.                                                      |
| `github_search_issues` | Cross-repo full-text search with qualifiers (`repo:`, `label:`, `is:issue`, `is:pr`, `is:open`, `author:`, `assignee:`).           |

All tools accept `repo` as either `owner/repo` or any `https://github.com/owner/repo` URL (including `/issues`, `/pull/N`, `/issues/N` suffixes).

## Auth

The tools resolve a GitHub token through the following precedence (first match wins):

1. `ORCHENTRA_GITHUB_TOKEN` env var
2. `GITHUB_TOKEN` env var
3. `GH_TOKEN` env var
4. `~/.config/orchentra/github-token` (created by `orchentra login`)
5. `gh auth token` (output of the GitHub CLI if installed and signed in)

If none resolve, tools return a structured error with the remediation hint:

```
No GitHub token. Set ORCHENTRA_GITHUB_TOKEN, GITHUB_TOKEN, run `orchentra login`, or `gh auth login`.
```

## Example

```
> which issues are frontend-related in Athrean/Orchentra?

⏺ github_search_issues({ q: "repo:Athrean/Orchentra label:frontend is:issue is:open" })
  ⎿ { totalCount: 3, items: [ #225 "live agent timeline", #229 "Phase 4 PRD", ... ] }
```

## Errors

| Status    | Meaning                       | Remediation                                                                              |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| 401 / 403 | Token rejected or lacks scope | Re-auth or grant `repo` scope                                                            |
| 404       | Repo not found or no access   | Verify `owner/repo`; private repos require a token that can see them                     |
| 422       | Bad search query syntax       | Check qualifier names (`repo:`, `label:`, `is:`)                                         |
| 429       | Rate limited                  | Backoff handled internally by `GitHubClient`; persistent 429s indicate a low-quota token |

## Why not `web_fetch`?

`web_fetch` against `https://github.com/owner/repo/issues` returns the GitHub web page HTML, not structured data. The agent then has to parse HTML by hand, which is slow, brittle, and gets nothing on private repos. Direct API calls return JSON the model can act on immediately.
