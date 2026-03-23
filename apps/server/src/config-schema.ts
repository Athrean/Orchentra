import { readFileSync } from 'fs'
import { resolve } from 'path'
import { load } from 'js-yaml'
import { z } from 'zod'

export const ConfigSchema = z.object({
  github: z.object({
    webhook_secret: z.string(),
    token: z.string(),
    repos: z.array(z.string()),
  }),
  llm: z.object({
    api_key: z.string(),
    model: z.string().default('anthropic/claude-sonnet-4-5'),
    base_url: z.string().optional(),
  }),
  integrations: z
    .object({
      sentry: z
        .object({
          auth_token: z.string(),
          org: z.string(),
        })
        .optional(),
      datadog: z
        .object({
          api_key: z.string(),
          app_key: z.string(),
        })
        .optional(),
    })
    .optional(),
  delivery: z.object({
    slack: z.object({
      bot_token: z.string(),
      signing_secret: z.string(),
      channel: z.string(),
      app_token: z.string().optional(),
    }),
    github_comments: z.boolean().default(false),
  }),
})

export type Config = z.infer<typeof ConfigSchema>

export function loadConfigFromPath(configPath: string): Config {
  const resolvedPath = resolve(__dirname, '../../..', configPath)
  let raw: string
  try {
    raw = readFileSync(resolvedPath, 'utf-8')
  } catch {
    throw new Error(
      `Config file not found: ${configPath}. Copy orchentra.yml.example to orchentra.yml and fill in your credentials.`,
    )
  }
  const parsed = load(raw)
  return ConfigSchema.parse(parsed)
}
