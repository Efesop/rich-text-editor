import { AI_PRESETS } from '@/store/aiStore'

export async function checkConnection(endpoint, presetKey) {
  const preset = AI_PRESETS[presetKey] || AI_PRESETS.ollama
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(endpoint + preset.modelsPath, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return { connected: false, error: `Server returned ${res.status}` }

    const data = await res.json()
    let models = []

    if (presetKey === 'ollama') {
      models = (data.models || []).map(m => m.name)
    } else {
      models = (data.data || []).map(m => m.id)
    }

    return { connected: true, models }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return { connected: false, error: 'Connection timed out' }
    }
    const msg = err.message || 'Connection failed'
    if (msg === 'Load failed' || msg === 'Failed to fetch' || msg.includes('NetworkError')) {
      return { connected: false, error: 'Load failed — check that the server is running and CORS is enabled' }
    }
    return { connected: false, error: msg }
  }
}

export async function streamChat({ endpoint, model, presetKey, messages, temperature, maxTokens, onChunk, onDone, onError, signal }) {
  const preset = AI_PRESETS[presetKey] || AI_PRESETS.ollama
  const isOllama = presetKey === 'ollama'
  let fullText = ''

  try {
    const res = await fetch(endpoint + preset.apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
        ...(isOllama ? {} : { max_tokens: maxTokens })
      }),
      signal
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      onError(new Error(`Server returned ${res.status}: ${text}`))
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let content = ''

        if (isOllama) {
          try {
            const parsed = JSON.parse(trimmed)
            content = parsed.message?.content || ''
          } catch { continue }
        } else {
          if (trimmed === 'data: [DONE]') continue
          const dataPrefix = 'data: '
          const jsonStr = trimmed.startsWith(dataPrefix) ? trimmed.slice(dataPrefix.length) : trimmed
          try {
            const parsed = JSON.parse(jsonStr)
            content = parsed.choices?.[0]?.delta?.content || ''
          } catch { continue }
        }

        if (content) {
          fullText += content
          onChunk(content)
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      let content = ''
      if (isOllama) {
        try {
          const parsed = JSON.parse(trimmed)
          content = parsed.message?.content || ''
        } catch { /* ignore */ }
      } else if (trimmed !== 'data: [DONE]') {
        const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
        try {
          const parsed = JSON.parse(jsonStr)
          content = parsed.choices?.[0]?.delta?.content || ''
        } catch { /* ignore */ }
      }
      if (content) {
        fullText += content
        onChunk(content)
      }
    }

    onDone(fullText)
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone(fullText || '')
      return
    }
    onError(err)
  }
}

export function buildPrompt(action, noteContent, customPrompt) {
  const systemMsg = 'You are a helpful writing assistant in a private note-taking app. Respond with well-formatted markdown. Be concise and direct.'

  // If there's note content, include it as context
  if (noteContent && noteContent.trim()) {
    return [
      { role: 'system', content: systemMsg },
      { role: 'user', content: `Here is my note:\n\n${noteContent}\n\n${customPrompt}` }
    ]
  }

  // Generative mode — no existing content
  return [
    { role: 'system', content: systemMsg },
    { role: 'user', content: customPrompt }
  ]
}
