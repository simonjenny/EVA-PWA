const BASE_URL = 'https://openrouter.ai/api/v1'

export async function fetchToolCapableModels(apiKey) {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.data || [])
    .filter(m => Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'))
    .map(m => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function sendMessage(apiKey, model, messages, tools) {
  const body = {
    model,
    messages,
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {})
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ov.b65.ch'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]
}
