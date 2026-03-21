// ─── todo tool ────────────────────────────────────────────────────────────────
export const toolMeta = {
  id: 'todo',
  name: 'Todo',
  version: '1.0.0',
  description: 'Track tasks during complex multi-step operations. Actions: add | in_progress | done.',
  category: 'utility',
  author: 'LOGIK',
}

// In-memory task list (shared per session)
const tasks = []

export async function execute(input, config = {}) {
  const { action, task } = input
  if (!action || !['add', 'in_progress', 'done'].includes(action)) {
    throw new Error('action must be one of: add, in_progress, done')
  }
  if (!task) throw new Error('task is required')

  if (action === 'add') {
    tasks.push({ task, status: 'pending', created: Date.now() })
    return { action, task, tasks: [...tasks] }
  }

  if (action === 'in_progress') {
    const entry = tasks.find(t => t.task === task && t.status !== 'done')
    if (entry) entry.status = 'in_progress'
    return { action, task, tasks: [...tasks] }
  }

  if (action === 'done') {
    const entry = tasks.find(t => t.task === task)
    if (entry) entry.status = 'done'
    return { action, task, tasks: [...tasks] }
  }
}

export async function test() {
  // Reset tasks for test
  tasks.length = 0
  try {
    await execute({ action: 'add',         task: 'Step 1' })
    await execute({ action: 'in_progress', task: 'Step 1' })
    await execute({ action: 'done',        task: 'Step 1' })
    const last = tasks.find(t => t.task === 'Step 1')
    if (last?.status === 'done') {
      tasks.length = 0
      return { passed: true, message: 'todo self-test passed.' }
    }
    tasks.length = 0
    return { passed: false, message: 'Task did not reach done status.' }
  } catch (err) {
    tasks.length = 0
    return { passed: false, message: `Error: ${err.message}` }
  }
}
