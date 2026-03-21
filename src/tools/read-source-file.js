// ─── read-source-file tool ────────────────────────────────────────────────────
export const toolMeta = {
  id: 'read-source-file',
  name: 'Read Source File',
  version: '1.0.0',
  description: 'Read a file from the SOURCE (secondary) repository in Fusion mode. Read-only.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path } = input
  if (!path) throw new Error('path is required')

  const { getFileContent, sourceRepo } = config
  if (!getFileContent) throw new Error('getFileContent not provided in config')
  if (!sourceRepo?.owner || !sourceRepo?.repo) throw new Error('sourceRepo not configured — connect a source repo in Settings')

  const content = await getFileContent({
    owner: sourceRepo.owner,
    repo:  sourceRepo.repo,
    path,
    branch: sourceRepo.branch || 'main',
    token:  sourceRepo.token || '',
  })
  return { path, content, source: `${sourceRepo.owner}/${sourceRepo.repo}` }
}

export async function test() {
  try {
    const result = await execute(
      { path: 'src/index.js' },
      {
        getFileContent: async () => '// source file content',
        sourceRepo: { owner: 'acme', repo: 'source', branch: 'main', token: '' },
      },
    )
    if (result.content && result.source === 'acme/source') {
      return { passed: true, message: 'read-source-file self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
