// ─── list-source-directory tool ───────────────────────────────────────────────
export const toolMeta = {
  id: 'list-source-directory',
  name: 'List Source Directory',
  version: '1.0.0',
  description: 'List files and subdirectories in a SOURCE (secondary) repository directory. Read-only.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path = '' } = input

  const { listDirectory, sourceRepo } = config
  if (!listDirectory) throw new Error('listDirectory not provided in config')
  if (!sourceRepo?.owner || !sourceRepo?.repo) throw new Error('sourceRepo not configured — connect a source repo in Settings')

  const entries = await listDirectory({
    owner:  sourceRepo.owner,
    repo:   sourceRepo.repo,
    path,
    branch: sourceRepo.branch || 'main',
    token:  sourceRepo.token || '',
  })
  return { path, entries, source: `${sourceRepo.owner}/${sourceRepo.repo}` }
}

export async function test() {
  try {
    const result = await execute(
      { path: 'src' },
      {
        listDirectory: async () => [{ name: 'index.js', type: 'file' }],
        sourceRepo: { owner: 'acme', repo: 'source', branch: 'main', token: '' },
      },
    )
    if (Array.isArray(result.entries) && result.source === 'acme/source') {
      return { passed: true, message: 'list-source-directory self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
