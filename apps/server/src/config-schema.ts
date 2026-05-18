import { readFileSync } from 'fs'
import { resolve } from 'path'
import { load } from 'js-yaml'
import { z } from 'zod'

export const ConfigSchema = z.object({
  github: z.object({
    webhook_secret: z.string().min(1, 'github.webhook_secret cannot be empty'),
    token: z.string().min(1, 'github.token cannot be empty'),
    api_base_url: z.string().url().optional(),
    repos: z.array(z.string().min(1)).default([]),
    comments_enabled: z.boolean().default(false),
    oauth: z
      .object({
        client_id: z.string().min(1, 'github.oauth.client_id cannot be empty'),
        client_secret: z.string().min(1, 'github.oauth.client_secret cannot be empty'),
        redirect_uri: z.string().url('github.oauth.redirect_uri must be a valid URL'),
      })
      .optional(),
  }),
  llm: z.object({
    api_key: z.string().min(1, 'llm.api_key cannot be empty'),
    model: z.string().default('anthropic/claude-sonnet-4-5'),
    embedding_model: z.string().default('text-embedding-3-small'),
    base_url: z.string().optional(),
    max_tokens_per_incident: z.number().int().min(1000).default(100_000),
    max_steps: z.number().int().min(1).max(20).default(10),
    compact_threshold: z.number().int().min(5000).default(80_000),
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
