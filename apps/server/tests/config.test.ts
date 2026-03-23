import { describe, test, expect, beforeEach } from 'bun:test'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfigFromPath } from '../src/config-schema'

const testDir = join(tmpdir(), `orchentra-test-${Date.now()}`)

function writeConfig(content: string): string {
  const path = join(testDir, `config-${Date.now()}.yml`)
  writeFileSync(path, content)
  return path
}

const validConfig = `
github:
  webhook_secret: "test-secret"
  token: "ghp_test123"
  repos:
    - "my-org/api"

llm:
  api_key: "sk-ant-test123"
  model: "anthropic/claude-sonnet-4-5"

delivery:
  slack:
    bot_token: "xoxb-test"
    signing_secret: "slack-secret"
    channel: "#test-incidents"
  github_comments: false
`

beforeEach(() => {
  mkdirSync(testDir, { recursive: true })
})

describe('Config Loader', () => {
  test('parses valid config', () => {
    const configPath = writeConfig(validConfig)
    const config = loadConfigFromPath(configPath)

    expect(config.github.webhook_secret).toBe('test-secret')
    expect(config.github.token).toBe('ghp_test123')
    expect(config.github.repos).toEqual(['my-org/api'])
    expect(config.llm.api_key).toBe('sk-ant-test123')
    expect(config.llm.model).toBe('anthropic/claude-sonnet-4-5')
    expect(config.delivery.slack.bot_token).toBe('xoxb-test')
    expect(config.delivery.slack.channel).toBe('#test-incidents')
  })

  test('throws on missing config file', () => {
    expect(() => {
      loadConfigFromPath('/nonexistent/path/config.yml')
    }).toThrow('Config file not found')
  })

  test('throws on invalid config (missing required fields)', () => {
    const configPath = writeConfig(`
github:
  webhook_secret: "test"
`)
    expect(() => {
      loadConfigFromPath(configPath)
    }).toThrow()
  })

  test('throws when github.token is missing', () => {
    const configPath = writeConfig(`
github:
  webhook_secret: "test"
  repos: ["org/repo"]
llm:
  api_key: "sk-test"
delivery:
  slack:
    bot_token: "xoxb-test"
    signing_secret: "secret"
    channel: "#incidents"
`)
    expect(() => {
      loadConfigFromPath(configPath)
    }).toThrow()
  })

  test('applies defaults for optional fields', () => {
    const configPath = writeConfig(`
github:
  webhook_secret: "test-secret"
  token: "ghp_test"
  repos: ["org/repo"]

llm:
  api_key: "sk-ant-test"

delivery:
  slack:
    bot_token: "xoxb-test"
    signing_secret: "secret"
    channel: "#incidents"
`)
    const config = loadConfigFromPath(configPath)

    expect(config.llm.model).toBe('anthropic/claude-sonnet-4-5')
    expect(config.delivery.github_comments).toBe(false)
  })

  test('accepts optional integrations section', () => {
    const configPath = writeConfig(`
github:
  webhook_secret: "test-secret"
  token: "ghp_test"
  repos: ["org/repo"]

llm:
  api_key: "sk-ant-test"

integrations:
  sentry:
    auth_token: "sntryu_test"
    org: "my-org"

delivery:
  slack:
    bot_token: "xoxb-test"
    signing_secret: "secret"
    channel: "#incidents"
`)
    const config = loadConfigFromPath(configPath)

    expect(config.integrations?.sentry?.auth_token).toBe('sntryu_test')
    expect(config.integrations?.sentry?.org).toBe('my-org')
    expect(config.integrations?.datadog).toBeUndefined()
  })

  test('works without integrations section', () => {
    const configPath = writeConfig(`
github:
  webhook_secret: "test-secret"
  token: "ghp_test"
  repos: ["org/repo"]

llm:
  api_key: "sk-ant-test"

delivery:
  slack:
    bot_token: "xoxb-test"
    signing_secret: "secret"
    channel: "#incidents"
`)
    const config = loadConfigFromPath(configPath)
    expect(config.integrations).toBeUndefined()
  })
})
