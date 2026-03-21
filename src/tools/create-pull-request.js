// ─── create-pull-request tool ─────────────────────────────────────────────────
export const toolMeta = {
  id: 'create-pull-request',
  name: 'Create Pull Request',
  version: '1.0.0',
  description: 'Create a GitHub pull request from the current working branch to the base branch.',
  category: 'coding',
  author: 'LOGIK',
}

export async function execute(input, config = {}) {
  const { title, body = '', head, base } = input
  if (!title) throw new Error('title is required')
  if (!head)  throw new Error('head (source branch) is required')
  if (!base)  throw new Error('base (target branch) is required')

  const { createPullRequest, repoOwner, repoName, githubToken } = config
  if (!createPullRequest) throw new Error('createPullRequest not provided in config')

  const pr = await createPullRequest({ owner: repoOwner, repo: repoName, title, body, head, base, token: githubToken })
  return { url: pr.url, number: pr.number, title }
}

export async function test() {
  try {
    const result = await execute(
      { title: 'Test PR', head: 'feature/x', base: 'main' },
      {
        createPullRequest: async ({ title }) => ({ url: 'https://github.com/test/repo/pull/1', number: 1 }),
        repoOwner: 'test', repoName: 'repo', githubToken: '',
      },
    )
    if (result.number === 1 && result.title === 'Test PR') {
      return { passed: true, message: 'create-pull-request self-test passed.' }
    }
    return { passed: false, message: 'Unexpected result.' }
  } catch (err) {
    return { passed: false, message: `Error: ${err.message}` }
  }
}
