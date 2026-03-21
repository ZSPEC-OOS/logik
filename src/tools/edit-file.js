// ─── edit-file tool ───────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'edit-file',
  name: 'Edit File',
  version: '1.0.0',
  description: 'Surgically replace an exact string in a file. Preferred over write-file for small changes.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path, old_str, new_str, message } = input
  if (!path)    throw new Error('path is required')
  if (!old_str) throw new Error('old_str is required')
  if (new_str === undefined || new_str === null) throw new Error('new_str is required')
  const { getFileContent, createOrUpdateFile, repoOwner, repoName, baseBranch, githubToken } = config
  if (!getFileContent || !createOrUpdateFile) throw new Error('getFileContent and createOrUpdateFile are required in config')

  const original = await getFileContent({ owner: repoOwner, repo: repoName, path, branch: baseBranch, token: githubToken })
  if (!original.includes(old_str)) throw new Error(`old_str not found in ${path}`)
  const updated = original.replace(old_str, new_str)
  const commitMsg = message || `Edit ${path}`
  await createOrUpdateFile({ owner: repoOwner, repo: repoName, path, content: updated, message: commitMsg, branch: baseBranch, token: githubToken })
  return { path, edited: true, message: commitMsg }
}

export async function test() {
  try {
    const result = await execute(
      { path: 'src/app.js', old_str: 'foo', new_str: 'bar' },
      {
        getFileContent: async () => 'const foo = 1',
        createOrUpdateFile: async () => {},
        repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
      },
    )
    if (result.edited) return { passed: true, message: 'edit-file self-test passed.' }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
