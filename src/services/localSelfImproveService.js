// ─── localSelfImproveService.js ───────────────────────────────────────────────
// Self-improvement loop that operates on two LOCAL repository folders.
// No GitHub API calls — uses the File System Access API via localFileService.
//
// Each cycle has two phases:
//   Phase A: Agent reads Repo B (with Repo A as reference) and improves Repo B
//   Phase B: Agent reads Repo A (with Repo B as reference) and improves Repo A
//
// The two agents effectively "discuss" improvements by each reading what the
// other wrote in the previous phase.

import { runAgentLoop }               from './agentLoop.js'
import { listLocalDir, readLocalFile, writeLocalFile } from './localFileService.js'

// ── Tool schema ───────────────────────────────────────────────────────────────

export const LOCAL_AGENT_TOOLS = [
  {
    name: 'list_directory',
    description: 'List files and subdirectories in your target repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from repo root. Empty for root.' },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Read the full content of a file in your target repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file in your target repository.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Relative file path.' },
        content: { type: 'string', description: 'Full file content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Edit an existing file by replacing one exact string with another.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Relative file path.' },
        old_str: { type: 'string', description: 'Exact text to find (must appear exactly once).' },
        new_str: { type: 'string', description: 'Replacement text.' },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },
  {
    name: 'read_source_file',
    description: 'Read a file from the OTHER repository for inspiration or reference.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path in the other repo.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_source_directory',
    description: 'List files in the OTHER repository for reference.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path in the other repo.' },
      },
      required: [],
    },
  },
]

// ── Executor factory ──────────────────────────────────────────────────────────

function makeLocalExecutor(targetHandle, sourceHandle) {
  return async function executeTool(toolName, input) {
    switch (toolName) {
      case 'list_directory': {
        const entries = await listLocalDir(targetHandle, input.path || '')
        return { entries }
      }
      case 'read_file': {
        const content = await readLocalFile(targetHandle, input.path)
        return { content, path: input.path }
      }
      case 'write_file': {
        await writeLocalFile(targetHandle, input.path, input.content)
        return { written: true, path: input.path }
      }
      case 'edit_file': {
        const original = await readLocalFile(targetHandle, input.path)
        if (!original.includes(input.old_str)) {
          throw new Error(`edit_file: old_str not found in ${input.path}`)
        }
        const updated = original.replace(input.old_str, input.new_str)
        await writeLocalFile(targetHandle, input.path, updated)
        return { edited: true, path: input.path }
      }
      case 'read_source_file': {
        const content = await readLocalFile(sourceHandle, input.path)
        return { content, path: input.path }
      }
      case 'list_source_directory': {
        const entries = await listLocalDir(sourceHandle, input.path || '')
        return { entries }
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  }
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const makeSystemPrompt = (targetName, sourceName) =>
`You are an autonomous code improvement agent working on a local repository called "${targetName}".
You can also read "${sourceName}" (the other repo) for inspiration and reference.

Tools available:
- list_directory / read_file / write_file / edit_file   → work on ${targetName}
- list_source_directory / read_source_file              → read ${sourceName} for reference

Rules:
- Make exactly ONE focused, concrete improvement per cycle
- Affect at most 1–3 files
- Never break existing functionality — only enhance
- Match the existing code style exactly
- Prefer editing files over creating new ones`

const makePhasePrompt = (cycle, targetName, sourceName) =>
`Self-improvement cycle #${cycle} — improve "${targetName}".

STEP 1  Explore ${targetName}: use list_directory to map its structure, then read_file on key files.
STEP 2  Optionally read ${sourceName} with list_source_directory / read_source_file for inspiration.
STEP 3  Choose EXACTLY ONE specific improvement (1–3 files max):
        • Real functionality, robustness, clarity, or UX improvement
        • Compatible with the existing architecture
STEP 4  Implement it now using write_file or edit_file.
STEP 5  End your response with exactly: "Enhancement: <one-line description of what you did>"`

// ── Main loop ─────────────────────────────────────────────────────────────────

/**
 * @param {object} config
 *   .handleA      FileSystemDirectoryHandle — Repo A
 *   .handleB      FileSystemDirectoryHandle — Repo B
 *   .nameA        string — display name for Repo A
 *   .nameB        string — display name for Repo B
 *   .modelConfig  { model, apiKey, … }
 *   .maxCycles    number (default 100)
 *   .signal       AbortSignal
 * @param {object} callbacks
 *   .onStep(info)   { cycle, phase, msg }
 *   .onEvent(e)     agent event with .phase and .cycle added
 *   .onLog(entry)   { cycle, phase, target, description, timestamp }
 *   .onCycleEnd(n)
 *   .onAbortCheck() → boolean
 */
export async function runLocalSelfImproveLoop(config, callbacks) {
  const {
    handleA, handleB, nameA, nameB,
    modelConfig, maxCycles = 100, signal,
  } = config

  const { onStep, onEvent, onLog, onCycleEnd, onAbortCheck } = callbacks

  function aborted() {
    return signal?.aborted || onAbortCheck?.()
  }

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (aborted()) break

    // ── Phase A: improve Repo B (Repo A is reference) ─────────────────────────
    onStep?.({ cycle, phase: 'A', msg: `Analyzing ${nameB} for an enhancement…` })

    const executorA = makeLocalExecutor(handleB, handleA)
    let outputA = ''

    try {
      await runAgentLoop({
        task:         makePhasePrompt(cycle, nameB, nameA),
        systemPrompt: makeSystemPrompt(nameB, nameA),
        tools:        LOCAL_AGENT_TOOLS,
        executeTool:  executorA,
        modelConfig,
        onEvent: e => {
          if (e.type === 'text_delta') outputA += e.text
          onEvent?.({ ...e, phase: 'A', cycle })
        },
        signal,
      })
    } catch (e) {
      if (aborted()) break
      onEvent?.({ type: 'error', text: `Phase A error: ${e.message}`, phase: 'A', cycle })
    }

    const descA = outputA.match(/Enhancement:\s*(.+)/)?.[1]?.trim()
      || `Enhancement applied to ${nameB}`
    onLog?.({ cycle, phase: 'A', target: nameB, description: descA, timestamp: Date.now() })
    onStep?.({ cycle, phase: 'A', msg: `Enhancement complete in ${nameB}` })

    if (aborted()) break

    // ── Phase B: improve Repo A (Repo B is reference) ─────────────────────────
    onStep?.({ cycle, phase: 'B', msg: `Analyzing ${nameA} for an enhancement…` })

    const executorB = makeLocalExecutor(handleA, handleB)
    let outputB = ''

    try {
      await runAgentLoop({
        task:         makePhasePrompt(cycle, nameA, nameB),
        systemPrompt: makeSystemPrompt(nameA, nameB),
        tools:        LOCAL_AGENT_TOOLS,
        executeTool:  executorB,
        modelConfig,
        onEvent: e => {
          if (e.type === 'text_delta') outputB += e.text
          onEvent?.({ ...e, phase: 'B', cycle })
        },
        signal,
      })
    } catch (e) {
      if (aborted()) break
      onEvent?.({ type: 'error', text: `Phase B error: ${e.message}`, phase: 'B', cycle })
    }

    const descB = outputB.match(/Enhancement:\s*(.+)/)?.[1]?.trim()
      || `Enhancement applied to ${nameA}`
    onLog?.({ cycle, phase: 'B', target: nameA, description: descB, timestamp: Date.now() })
    onStep?.({ cycle, phase: 'B', msg: `Enhancement complete in ${nameA}` })

    onCycleEnd?.(cycle)
    if (aborted()) break
  }
}
