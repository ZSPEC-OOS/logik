// ─── grep tool ────────────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'grep',
  name: 'Grep',
  version: '1.0.0',
  description: 'Regex search across indexed file contents. Returns matching lines with file paths and line numbers.',
  category: 'analysis',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { pattern, path: pathPrefix, ignore_case = false } = input
  if (!pattern) throw new Error('pattern is required')

  const { shadowContext } = config
  if (!shadowContext) throw new Error('shadowContext not provided in config')

  const regex = new RegExp(pattern, ignore_case ? 'gi' : 'g')
  const results = []

  const indexed = shadowContext.getIndexedContent?.() || {}
  for (const [filePath, content] of Object.entries(indexed)) {
    if (pathPrefix && !filePath.startsWith(pathPrefix)) continue
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        results.push({ file: filePath, line: idx + 1, text: line.trim() })
      }
      regex.lastIndex = 0
    })
  }

  return { pattern, matches: results, count: results.length }
}

export async function test() {
  try {
    const fakeContext = {
      getIndexedContent: () => ({
        'src/app.js': 'const hello = "world"\nconst foo = "bar"',
      }),
    }
    const result = await execute({ pattern: 'hello', ignore_case: false }, { shadowContext: fakeContext })
    if (result.count === 1 && result.matches[0].file === 'src/app.js') {
      return { passed: true, message: 'grep self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
