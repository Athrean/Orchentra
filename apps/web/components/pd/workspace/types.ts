export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: Date
  reasoning?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
    model: string
  }
  toolCalls?: Array<{
    name: string
    arguments?: unknown
    result?: unknown
  }>
  sources?: Array<{
    title: string
    url?: string
  }>
  stages?: StageItem[]
}

export interface StageItem {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'failed'
}
