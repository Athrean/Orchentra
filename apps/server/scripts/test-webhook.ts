/**
 * Sends a mock GitHub workflow_run failure webhook to the local server.
 *
 * Usage:
 *   bun run apps/server/scripts/test-webhook.ts
 *
 * Requires: orchentra.yml in the project root (uses the webhook_secret for signing)
 */

import { createHmac } from 'crypto'
import { readFileSync } from 'fs'
import { load } from 'js-yaml'

const configPath = process.env.ORCHENTRA_CONFIG ?? 'orchentra.yml'
const configRaw = readFileSync(configPath, 'utf-8')
const config = load(configRaw) as { github: { webhook_secret: string } }
const secret = config.github.webhook_secret

const payload = {
  action: 'completed',
  workflow_run: {
    id: Date.now(),
    name: 'CI / Build & Test',
    head_branch: 'feat/add-user-auth',
    head_sha: 'abc1234def5678901234567890abcdef12345678',
    conclusion: 'failure',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  repository: {
    full_name: 'my-org/api',
    name: 'api',
  },
}

const body = JSON.stringify(payload)
const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

const serverUrl = process.env.SERVER_URL ?? 'http://localhost:3001'

console.log(`📤 Sending mock webhook to ${serverUrl}/webhooks/github`)
console.log(`   Repo: ${payload.repository.full_name}`)
console.log(`   Workflow: ${payload.workflow_run.name}`)
console.log(`   Branch: ${payload.workflow_run.head_branch}`)
console.log('')

const res = await fetch(`${serverUrl}/webhooks/github`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-github-event': 'workflow_run',
    'x-hub-signature-256': signature,
  },
  body,
})

const result = await res.json()
console.log(`📥 Response: ${res.status}`, result)

if (res.ok) {
  console.log('')
  console.log('✅ Webhook accepted! Check your Slack channel for the incident message.')
  console.log('   The LLM classification will update the message in ~10-20 seconds.')
} else {
  console.log('')
  console.log('❌ Webhook rejected. Check the server logs for errors.')
}
