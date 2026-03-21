// ─── web-search tool ──────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'web-search',
  name: 'Web Search',
  version: '1.0.0',
  description: 'Search the web for up-to-date information using Tavily. Requires a Tavily API key in Settings.',
  category: 'utility',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { query, max_results = 5, include_domains } = input
  if (!query) throw new Error('query is required')

  const { tavilyKey } = config
  if (!tavilyKey) throw new Error('Tavily API key not configured — add it in Settings → Web Search')

  const body = { query, max_results: Math.min(max_results, 10), api_key: tavilyKey }
  if (include_domains?.length) body.include_domains = include_domains

  const res = await fetch('/api/proxy/tavily/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)
  const data = await res.json()

  return {
    query,
    answer: data.answer || '',
    results: (data.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.content })),
  }
}

export async function test() {
  try {
    // Without a live Tavily key, confirm error handling
    const result = await execute({ query: 'test' }, {}).catch(e => ({ error: e.message }))
    if (result.error?.includes('Tavily API key')) {
      return { passed: true, message: 'web-search self-test passed (key guard works).' }
    }
    return { passed: false, message: 'Expected missing-key error.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
