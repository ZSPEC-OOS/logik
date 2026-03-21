// ─── search-files tool ────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'search-files',
  name: 'Search Files',
  version: '1.0.0',
  description: 'Search the indexed repository for files relevant to a query. Returns scored file paths.',
  category: 'analysis',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { query, limit = 8 } = input
  if (!query) throw new Error('query is required')

  const { shadowContext } = config
  if (!shadowContext) throw new Error('shadowContext not provided in config')

  const results = shadowContext.search?.(query, limit) || []
  return { query, results, count: results.length }
}

export async function test() {
  try {
    const fakeContext = {
      search: (q, n) => [{ path: 'src/app.js', score: 0.9 }].slice(0, n),
    }
    const result = await execute({ query: 'app', limit: 5 }, { shadowContext: fakeContext })
    if (result.count === 1 && result.results[0].path === 'src/app.js') {
      return { passed: true, message: 'search-files self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
