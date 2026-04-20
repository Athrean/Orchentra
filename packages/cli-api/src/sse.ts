export interface SseFrame {
  event?: string
  data: string
}

export class SseParser {
  private buffer = ''

  push(chunk: string): SseFrame[] {
    this.buffer += chunk
    const frames: SseFrame[] = []

    while (this.buffer.length > 0) {
      const result = this.extractFrame()
      if (!result) break
      frames.push(result)
    }

    return frames
  }

  finish(): SseFrame[] {
    const remaining = this.buffer.trim()
    this.buffer = ''
    if (!remaining) return []

    const frame = this.parseFrame(remaining)
    return frame ? [frame] : []
  }

  private extractFrame(): SseFrame | null {
    let sep = this.buffer.indexOf('\n\n')
    let sepLen = 2

    if (sep === -1) {
      sep = this.buffer.indexOf('\r\n\r\n')
      sepLen = 4
    }

    if (sep === -1) return null

    const raw = this.buffer.slice(0, sep)
    this.buffer = this.buffer.slice(sep + sepLen)

    return this.parseFrame(raw)
  }

  private parseFrame(raw: string): SseFrame | null {
    const lines = raw.split('\n')
    const dataLines: string[] = []
    let event: string | undefined

    for (const line of lines) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^\s/, ''))
      }
    }

    if (event === 'ping') return null
    if (dataLines.length === 0) return null

    const data = dataLines.join('\n')
    if (data === '[DONE]') return null

    return { event, data }
  }
}
