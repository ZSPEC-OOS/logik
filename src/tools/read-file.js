// ─── read-file tool ───────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'read-file',
  name: 'Read File',
  version: '1.0.0',
  description: 'Read the contents of a file from the connected GitHub repository, with optional line range.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path, start_line, end_line } = input
  if (!path) throw new Error('path is required')
  const { getFileContent, repoOwner, repoName, baseBranch, githubToken } = config
  if (!getFileContent) throw new Error('getFileContent not provided in config')
  const raw = await getFileContent({ owner: repoOwner, repo: repoName, path, branch: baseBranch, token: githubToken })
  let content = raw
  if ((start_line || end_line) && typeof raw === 'string') {
    const lines = raw.split('\n')
    const s = (start_line || 1) - 1
    const e = end_line ? end_line : lines.length
    content = lines.slice(s, e).join('\n')
  }
  return { path, content }
}

export async function test() {
  try {
    // Without a live GitHub connection, verify the function signature
    const result = await execute({ path: 'test.js' }, {
      getFileContent: async () => 'line1\nline2\nline3',
      repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
    })
    if (result.path === 'test.js' && result.content === 'line1\nline2\nline3') {
      return { passed: true, message: 'read-file self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
