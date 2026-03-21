// ─── run-command tool ─────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'run-command',
  name: 'Run Command',
  version: '1.0.0',
  description: 'Execute a shell command via the local exec bridge (npm, git, eslint, etc.). Requires npm run dev.',
  category: 'utility',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { cmd, cwd } = input
  if (!cmd) throw new Error('cmd is required')

  const { callExecBridge, bridgeAvailable } = config
  if (!bridgeAvailable || !callExecBridge) {
    throw new Error('Exec bridge not available — start the dev server with: npm run dev')
  }

  const { stdout, stderr, exitCode } = await callExecBridge(cmd, cwd)
  return { cmd, stdout, stderr, exitCode }
}

export async function test() {
  try {
    const result = await execute(
      { cmd: 'echo hello' },
      { bridgeAvailable: true, callExecBridge: async () => ({ stdout: 'hello', stderr: '', exitCode: 0 }) },
    )
    if (result.stdout === 'hello' && result.exitCode === 0) {
      return { passed: true, message: 'run-command self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
