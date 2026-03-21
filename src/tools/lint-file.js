// ─── lint-file tool ───────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'lint-file',
  name: 'Lint File',
  version: '1.0.0',
  description: 'Run ESLint on a JS/TS file and return errors with line numbers, or confirm no errors.',
  category: 'analysis',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path } = input
  if (!path) throw new Error('path is required')
  if (!/\.(js|jsx|ts|tsx)$/.test(path)) throw new Error('lint-file only supports .js/.jsx/.ts/.tsx files')

  const { callExecBridge, bridgeAvailable } = config
  if (!bridgeAvailable || !callExecBridge) {
    throw new Error('Exec bridge not available — start the dev server with: npm run dev')
  }

  const { stdout, stderr, exitCode } = await callExecBridge(`npx eslint --format=compact "${path}"`)
  const output = [stdout, stderr].filter(Boolean).join('\n').trim()
  const clean  = exitCode === 0

  return { path, clean, output: output || '(no output)', exitCode }
}

export async function test() {
  try {
    const result = await execute(
      { path: 'src/app.jsx' },
      { bridgeAvailable: true, callExecBridge: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    )
    if (result.clean && result.path === 'src/app.jsx') {
      return { passed: true, message: 'lint-file self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
