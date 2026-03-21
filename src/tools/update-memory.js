// ─── update-memory tool ───────────────────────────────────────────────────────
export const toolMeta = {
  id: 'update-memory',
  name: 'Update Memory',
  version: '1.0.0',
  description: 'Append a persistent note to LOGIK.md in the repository root for cross-session memory.',
  category: 'utility',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { note } = input
  if (!note) throw new Error('note is required')

  const { getFileContent, createOrUpdateFile, repoOwner, repoName, baseBranch, githubToken } = config
  if (!getFileContent || !createOrUpdateFile) throw new Error('getFileContent and createOrUpdateFile required in config')

  let existing = ''
  try {
    existing = await getFileContent({ owner: repoOwner, repo: repoName, path: 'LOGIK.md', branch: baseBranch, token: githubToken })
  } catch { /* file may not exist yet */ }

  const timestamp = new Date().toISOString().split('T')[0]
  const updated = existing
    ? `${existing.trimEnd()}\n\n<!-- ${timestamp} -->\n${note}`
    : `<!-- ${timestamp} -->\n${note}`

  await createOrUpdateFile({ owner: repoOwner, repo: repoName, path: 'LOGIK.md', content: updated, message: 'Update LOGIK.md', branch: baseBranch, token: githubToken })
  return { appended: true, note }
}

export async function test() {
  const written = []
  try {
    const result = await execute(
      { note: 'Test note' },
      {
        getFileContent: async () => '# Existing',
        createOrUpdateFile: async ({ content }) => { written.push(content) },
        repoOwner: 'test', repoName: 'repo', baseBranch: 'main', githubToken: '',
      },
    )
    if (result.appended && written[0]?.includes('Test note')) {
      return { passed: true, message: 'update-memory self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
