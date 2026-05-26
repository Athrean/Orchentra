export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: Date
}

export interface StageItem {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'failed'
}
