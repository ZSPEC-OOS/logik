// ─── delete-file tool ─────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'delete-file',
  name: 'Delete File',
  version: '1.0.0',
  description: 'Delete a file from the repository. Irreversible without a git revert.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path, message } = input
  if (!path) throw new Error('path is required')
  const { deleteFile, repoOwner, repoName, baseBranch, githubToken } = config
  if (!deleteFile) throw new Error('deleteFile not provided in config')

  await deleteFile({ owner: repoOwner, repo: repoName, path, message: message || `Delete ${path}`, branch: baseBranch, token: githubToken })
  return { path, deleted: true }
}

export async function test() {
  const deleted = []
  try {
    const result = await execute(
      { path: 'old/file.js', message: 'remove old file' },
      {
        deleteFile: async ({ path }) => { deleted.push(path) },
        repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
      },
    )
    if (result.deleted && deleted[0] === 'old/file.js') {
      return { passed: true, message: 'delete-file self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
