// ─── revert-file tool ─────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'revert-file',
  name: 'Revert File',
  version: '1.0.0',
  description: 'Restore a file to its state before the last N commits that touched it.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { path, commits_back = 1, message } = input
  if (!path) throw new Error('path is required')
  if (commits_back > 10) throw new Error('commits_back max is 10')

  const { getFileCommitHistory, getFileContent, createOrUpdateFile, repoOwner, repoName, baseBranch, githubToken } = config
  if (!getFileCommitHistory || !getFileContent || !createOrUpdateFile) {
    throw new Error('getFileCommitHistory, getFileContent, and createOrUpdateFile required in config')
  }

  const commits = await getFileCommitHistory({ owner: repoOwner, repo: repoName, path, branch: baseBranch, token: githubToken })
  const targetCommit = commits[commits_back]
  if (!targetCommit) throw new Error(`Not enough commit history (found ${commits.length} commits)`)

  const oldContent = await getFileContent({ owner: repoOwner, repo: repoName, path, ref: targetCommit.sha, token: githubToken })
  const commitMsg = message || `Revert ${path} to ${commits_back} commit(s) back`
  await createOrUpdateFile({ owner: repoOwner, repo: repoName, path, content: oldContent, message: commitMsg, branch: baseBranch, token: githubToken })

  return { path, reverted: true, to_sha: targetCommit.sha, message: commitMsg }
}

export async function test() {
  try {
    const result = await execute(
      { path: 'src/app.js', commits_back: 1 },
      {
        getFileCommitHistory: async () => [
          { sha: 'abc123' },
          { sha: 'def456' },
        ],
        getFileContent: async ({ ref }) => `// at ${ref}`,
        createOrUpdateFile: async () => {},
        repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
      },
    )
    if (result.reverted && result.to_sha === 'def456') {
      return { passed: true, message: 'revert-file self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
