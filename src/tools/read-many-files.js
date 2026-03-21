// ─── read-many-files tool ─────────────────────────────────────────────────────
export const toolMeta = {
  id: 'read-many-files',
  name: 'Read Many Files',
  version: '1.0.0',
  description: 'Read multiple files in a single call — more efficient than separate read-file calls.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { paths } = input
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('paths must be a non-empty array')
  if (paths.length > 20) throw new Error('max 20 paths per call')

  const { getFileContent, repoOwner, repoName, baseBranch, githubToken } = config
  if (!getFileContent) throw new Error('getFileContent not provided in config')

  const files = await Promise.all(
    paths.map(async path => {
      try {
        const content = await getFileContent({ owner: repoOwner, repo: repoName, path, branch: baseBranch, token: githubToken })
        return { path, content }
      } catch (e) {
        return { path, error: e.message }
      }
    }),
  )

  return { files, count: files.length }
}

export async function test() {
  try {
    const result = await execute(
      { paths: ['src/a.js', 'src/b.js'] },
      {
        getFileContent: async ({ path }) => `// ${path}`,
        repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
      },
    )
    if (result.count === 2 && result.files[0].path === 'src/a.js') {
      return { passed: true, message: 'read-many-files self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
