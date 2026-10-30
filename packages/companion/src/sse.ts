/**
 * Minimal Server-Sent Events reader.
 *
 * Both streaming paths (Gemini's `?alt=sse` and our own hosted relay) speak
 * SSE, and both run in a browser, an extension worker, and a desktop webview,
 * so this stays dependency-free and uses only the standard streams API.
 *
 * The subtlety is that network chunks do not align with event boundaries: one
 * read can deliver half an event, or three at once. Events are therefore
 * accumulated until a blank line terminates them, exactly as the spec requires.
 */

export interface SseEvent {
  /** Concatenated `data:` lines with the framing stripped. */
  data: string
  /** `event:` name when the server set one. */
  event?: string
}

/** Split a raw SSE text stream into events. Feed it chunks; it handles joins. */
export function createSseParser(): {
  push(chunk: string): SseEvent[]
  end(): SseEvent[]
} {
  let buf = ''

  const parseBlock = (block: string): SseEvent | null => {
    const data: string[] = []
    let event: string | undefined
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue // comment / keep-alive
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      // A single leading space after the colon is framing, not payload.
      let value = colon < 0 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'data') data.push(value)
      else if (field === 'event') event = value
    }
    if (!data.length) return null
    return { data: data.join('\n'), ...(event ? { event } : {}) }
  }

  const drain = (final: boolean): SseEvent[] => {
    const out: SseEvent[] = []
    for (;;) {
      const split = buf.search(/\r?\n\r?\n/)
      if (split < 0) break
      const block = buf.slice(0, split)
      buf = buf.slice(split).replace(/^\r?\n\r?\n/, '')
      const ev = parseBlock(block)
      if (ev) out.push(ev)
    }
    if (final && buf.trim()) {
      const ev = parseBlock(buf)
      if (ev) out.push(ev)
      buf = ''
    }
    return out
  }

  return {
    push(chunk) {
      if (!chunk) return []
      buf += chunk
      return drain(false)
    },
    end: () => drain(true),
  }
}

/**
 * Read an SSE response body to completion, handing each event to `onEvent`.
 * Aborting the passed signal stops the read; the reader is always released.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  try {
    for (;;) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) onEvent(ev)
    }
    for (const ev of parser.end()) onEvent(ev)
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* already released */
    }
  }
}

/**
 * Pull the text delta out of one Gemini streamGenerateContent SSE payload.
 * Returns '' for the frames that carry only metadata (safety, usage, finish).
 */
export function geminiChunkText(data: string): string {
  if (!data || data === '[DONE]') return ''
  try {
    const parsed = JSON.parse(data) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return (parsed.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
  } catch {
    return ''
  }
}
