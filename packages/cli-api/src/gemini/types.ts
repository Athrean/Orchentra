export interface GeminiPart {
  text?: string
  functionCall?: {
    /** Server-issued call id when present; Gemini 3 pairs responses by it. */
    id?: string
    name: string
    args: Record<string, unknown>
  }
  functionResponse?: {
    id?: string
    name: string
    response: Record<string, unknown>
  }
  inlineData?: {
    mimeType: string
    data: string
  }
  /**
   * Gemini 3 signs the reasoning behind each part. A signed part must be
   * replayed with its signature intact or the next request fails with
   * `400 Function call is missing a thought_signature in functionCall parts`.
   */
  thoughtSignature?: string
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[]
}

export interface GeminiThinkingConfig {
  /** Tokens the model may spend thinking. 0 disables thinking entirely. */
  thinkingBudget?: number
}

export interface GeminiGenerationConfig {
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  thinkingConfig?: GeminiThinkingConfig
}

export interface GeminiRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: GeminiPart[] }
  tools?: GeminiTool[]
  generationConfig?: GeminiGenerationConfig
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  cachedContentTokenCount?: number
  totalTokenCount?: number
}

export interface GeminiCandidate {
  content?: GeminiContent
  finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER'
  index?: number
}

export interface GeminiStreamChunk {
  candidates?: GeminiCandidate[]
  usageMetadata?: GeminiUsageMetadata
  promptFeedback?: { blockReason?: string }
}
