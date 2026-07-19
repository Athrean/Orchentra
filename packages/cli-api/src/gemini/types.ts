export interface GeminiPart {
  text?: string
  functionCall?: {
    name: string
    args: Record<string, unknown>
  }
  functionResponse?: {
    name: string
    response: Record<string, unknown>
  }
  inlineData?: {
    mimeType: string
    data: string
  }
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

export interface GeminiGenerationConfig {
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
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
