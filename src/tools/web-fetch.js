// ─── web-fetch tool ───────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'web-fetch',
  name: 'Web Fetch',
  version: '1.0.0',
  description: 'Fetch a URL and return its text content. Best for reading documentation, API specs, or raw files.',
  category: 'utility',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { url } = input
  if (!url) throw new Error('url is required')
  if (!url.startsWith('http')) throw new Error('url must start with http:// or https://')

  const { callExecBridge } = config

  // If exec bridge is available, use it for HTML-to-text conversion
  if (callExecBridge) {
    const { stdout, exitCode } = await callExecBridge(
      `curl -sL --max-time 15 "${url.replace(/"/g, '\\"')}"`,
    )
    if (exitCode !== 0) throw new Error(`Fetch failed (exit ${exitCode})`)
    return { url, content: stdout }
  }

  // Fallback: browser fetch
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const text = await res.text()
  return { url, content: text }
}

export async function test() {
  try {
    // Test with exec bridge mock
    const result = await execute(
      { url: 'https://example.com' },
      { callExecBridge: async () => ({ stdout: '<html>ok</html>', exitCode: 0 }) },
    )
    if (result.url && result.content) {
      return { passed: true, message: 'web-fetch self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
