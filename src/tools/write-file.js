// ─── write-file tool ──────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'write-file',
  name: 'Write File',
  version: '1.0.0',
  description: 'Create a new file or completely overwrite an existing file in the repository.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path, content, message } = input
  if (!path)    throw new Error('path is required')
  if (!content && content !== '') throw new Error('content is required')
  const { createOrUpdateFile, repoOwner, repoName, baseBranch, githubToken } = config
  if (!createOrUpdateFile) throw new Error('createOrUpdateFile not provided in config')
  const commitMsg = message || `Update ${path}`
  await createOrUpdateFile({ owner: repoOwner, repo: repoName, path, content, message: commitMsg, branch: baseBranch, token: githubToken })
  return { path, written: true, message: commitMsg }
}

export async function test() {
  const written = []
  try {
    const result = await execute({ path: 'hello.txt', content: 'Hello World', message: 'test' }, {
      createOrUpdateFile: async ({ path, content }) => { written.push({ path, content }) },
      repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
    })
    if (result.written && written[0]?.path === 'hello.txt') {
      return { passed: true, message: 'write-file self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
