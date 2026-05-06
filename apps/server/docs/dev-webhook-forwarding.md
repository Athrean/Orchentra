# Dev webhook forwarding (smee.io)

GitHub cannot reach `localhost`, so the dev loop pipes deliveries through
[smee.io](https://smee.io) and replays them at the local server.

## One-time setup

1. Create a channel at https://smee.io — copy the channel URL.
2. Set `SMEE_WEBHOOK_URL` in `.env.dev` (alongside the other `GITHUB_APP_*`
   keys) to that URL. `.env.example` lists the key.
3. In the GH App settings (`https://github.com/settings/apps/<your-app>`),
   set the **Webhook URL** to the smee channel URL and set the
   **Webhook secret** to the same value as `GITHUB_APP_WEBHOOK_SECRET` in
   your env. Save.
4. Install the smee CLI once: `npm i -g smee-client`.

## Daily loop

In one terminal, start the forwarder:

```sh
smee -u "$SMEE_WEBHOOK_URL" -t http://localhost:3000/webhooks/github
```

In another, run the server:

```sh
bun run --filter @orchentra/server dev
```

Trigger a delivery (push a commit, open a PR, etc.) and the server will
verify the HMAC against `GITHUB_APP_WEBHOOK_SECRET` and dispatch it.

## Troubleshooting

- `401 Invalid signature` — the secret in GH App settings does not match
  `GITHUB_APP_WEBHOOK_SECRET`. Re-set both to the same value.
- Smee shows no events — the channel URL in GH App settings does not
  match `SMEE_WEBHOOK_URL`. Recheck both.
- Smee delivers but the server returns 500 — check the smee log for the
  raw payload and replay locally with `curl` + the same headers.
