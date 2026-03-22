export const PIPELINE_PHASES = [
  'understanding',
  'planning',
  'coding',
  'refining',
  'validating',
  'complete',
]

export const COMMANDS = new Set(['/plan', '/code', '/diff', '/explain', '/reset'])

export function createAssistantMessage(id = `${Date.now()}`) {
  return {
    id,
    role: 'assistant',
    phase: 'understanding',
    steps: createPipelineSteps('understanding').map(({ label, state }) => ({ label, state })),
    content: '',
    code: '',
    validation: [],
    plan: [],
  }
}

const STEP_LABELS = {
  understanding: 'Understanding',
  planning: 'Planning',
  coding: 'Coding',
  refining: 'Refining',
  validating: 'Validating',
  complete: 'Complete',
}

export function createPipelineSteps(activePhase = 'understanding') {
  const activeIndex = PIPELINE_PHASES.indexOf(activePhase)
  return PIPELINE_PHASES.map((phase, idx) => ({
    key: phase,
    label: STEP_LABELS[phase],
    state: idx < activeIndex ? 'done' : idx === activeIndex ? 'active' : 'pending',
  }))
}

export function createStreamEvent(type, payload = {}) {
  return { type, ...payload }
}

export function applyStreamEvent(message, event) {
  if (!message || !event) return message
  const next = { ...message }

  if (event.type === 'status' && event.phase) {
    next.phase = event.phase
    next.steps = createPipelineSteps(event.phase).map(({ label, state }) => ({ label, state }))
  }
  if (event.type === 'plan' && Array.isArray(event.steps)) next.plan = event.steps
  if (event.type === 'content' && event.chunk) next.content = `${next.content || ''}${event.chunk}`
  if (event.type === 'code' && event.chunk) next.code = `${next.code || ''}${event.chunk}`
  if (event.type === 'validation' && Array.isArray(event.results)) next.validation = [...event.results]
  return next
}

export function parsePromptCommand(raw = '') {
  const text = raw.trim()
  const [first, ...rest] = text.split(/\s+/)
  if (!COMMANDS.has(first)) return { command: null, content: text }
  return { command: first, content: rest.join(' ').trim() }
}

export function formatStructuredOutput({
  summary = '',
  plan = [],
  code = '',
  changes = [],
  validation = [],
  notes = [],
  codeLang = '',
}) {
  const planLines = plan.length ? plan.map((step, i) => `${i + 1}. ${step}`).join('\n') : '- No plan steps recorded.'
  const changeLines = changes.length ? changes.map((c) => `- ${c}`).join('\n') : '- No file-level changes listed.'
  const validationLines = validation.length ? validation.map((v) => `- ${v}`).join('\n') : '- Validation not run.'
  const noteLines = notes.length ? notes.map((n) => `- ${n}`).join('\n') : '- None.'
  const codeBlock = code
    ? `\n\n## Code\n\n\`\`\`${codeLang || 'text'}\n${code}\n\`\`\``
    : '\n\n## Code\n\n_No code output for this command._'

  return [
    '## Summary',
    summary || 'Completed request.',
    '',
    '## Plan',
    planLines,
    codeBlock,
    '',
    '## Changes',
    changeLines,
    '',
    '## Validation',
    validationLines,
    '',
    '## Notes',
    noteLines,
  ].join('\n')
}
