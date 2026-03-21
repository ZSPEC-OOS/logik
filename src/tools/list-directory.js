// ─── list-directory tool ──────────────────────────────────────────────────────
export const toolMeta = {
  id: 'list-directory',
  name: 'List Directory',
  version: '1.0.0',
  description: 'List files and subdirectories inside a directory of the repository.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path = '' } = input
  const { listDirectory, repoOwner, repoName, baseBranch, githubToken } = config
  if (!listDirectory) throw new Error('listDirectory not provided in config')

  const entries = await listDirectory({ owner: repoOwner, repo: repoName, path, branch: baseBranch, token: githubToken })
  return { path, entries }
}

export async function test() {
  try {
    const result = await execute(
      { path: 'src' },
      {
        listDirectory: async () => [{ name: 'App.jsx', type: 'file' }],
        repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
      },
    )
    if (Array.isArray(result.entries)) {
      return { passed: true, message: 'list-directory self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
