// ── agentLoop — the core observe → decide → act cycle ────────────────────────
//
// Drives one full agent session:
//   1. Sends the task + tool schemas to the model
//   2. Executes each tool the model requests
//   3. Feeds results back and loops until the model signals it is done
//   4. Emits structured events so the UI can render live progress
//
// Events emitted via onEvent(event):
//   { type: 'turn',       turn: number }
//   { type: 'text_delta', delta: string }            — streaming token
//   { type: 'tool_start', name, input }              — about to execute
//   { type: 'tool_done',  name, result, error? }     — result received
//   { type: 'file_write', path, action }             — file was changed
//   { type: 'done',       text, filesChanged: [] }   — session complete
//   { type: 'error',      message }                  — fatal error

import { callWithToolsStreaming } from './aiService.js'
import { AGENT_MAX_TURNS, AGENT_KEEP_TURNS } from '../config/constants.js'

// ── Helpers to build the next conversation turn ───────────────────────────────

// Anthropic expects tool results inside a user message as content blocks.
// OpenAI expects each result as a message with role 'tool'.
// We detect which format to use from the provider field set by callWithTools.
function buildToolResultMessages(toolCalls, results, isAnthropic, rawAssistantContent) {
  if (isAnthropic) {
    return [
      { role: 'assistant', content: rawAssistantContent },
      {
        role: 'user',
        content: toolCalls.map((tc, i) => ({
          type:        'tool_result',
          tool_use_id: tc.id,
          content:     String(results[i] ?? ''),
        })),
      },
    ]
  }

  // OpenAI / Kimi — use rawAssistantContent directly to preserve any extra fields
  // (e.g. reasoning_content required by Kimi K2.5 thinking mode in multi-turn history)
  return [
    rawAssistantContent,
    ...toolCalls.map((tc, i) => ({
      role:         'tool',
      tool_call_id: tc.id,
      content:      String(results[i] ?? ''),
    })),
  ]
}

// Prune old messages to keep context window bounded.
// Always preserves the initial system+task messages (first 2) and the last
// AGENT_KEEP_TURNS turn pairs.
function pruneMessages(messages) {
  const head = messages.slice(0, 2)
  const tail = messages.slice(2)
  const keep = AGENT_KEEP_TURNS * 2   // each turn = 1 assistant + 1 user
  const trimmed = tail.length > keep ? tail.slice(-keep) : tail
  return [...head, ...trimmed]
}

// ── Loop detection ────────────────────────────────────────────────────────────
// If the agent calls the exact same set of tools with the same inputs 3 turns
// in a row it has likely entered an infinite loop.  We inject a recovery note
// into the conversation so the model tries a different approach.
const LOOP_WINDOW = 3

function toolSignature(toolCalls) {
  return toolCalls
    .map(tc => `${tc.name}:${JSON.stringify(tc.input).slice(0, 100)}`)
    .sort()
    .join('|')
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runAgentLoop({
  task,
  systemPrompt,
  tools,
  executeTool,          // async (name, input) => string
  modelConfig,
  onEvent,
  signal,
}) {
  // Detect once — avoids repeated URL-sniffing in every turn.
  // Supports proxy setups by checking the provider field if present, then URL.
  const isAnthropic = modelConfig.provider === 'anthropic' ||
    (!modelConfig.provider && modelConfig.baseUrl?.includes('api.anthropic.com'))

  const filesChanged = []
  const recentSigs   = []   // rolling window of tool-call signatures for loop detection

  // Initial message — system prompt is injected as first user message
  // (both Anthropic and OpenAI accept a system field or a leading user message)
  let messages = [
    ...(isAnthropic
      ? []   // Anthropic: pass systemPrompt via the `system` field below
      : [{ role: 'system', content: systemPrompt }]),
    { role: 'user', content: task },
  ]

  // Anthropic tool call needs system at top level, not in messages
  const anthropicSystemField = isAnthropic ? systemPrompt : undefined

  for (let turn = 1; turn <= AGENT_MAX_TURNS; turn++) {
    if (signal?.aborted) break
    onEvent({ type: 'turn', turn })

    // ── Call the model ────────────────────────────────────────────────────
    let response
    try {
      response = await callWithToolsStreaming(
        modelConfig,
        messages,
        tools,
        signal,
        anthropicSystemField,
        (delta) => onEvent({ type: 'text_delta', delta }),
      )
    } catch (err) {
      if (err.name === 'AbortError') return
      onEvent({ type: 'error', message: err.message })
      return
    }

    // ── Model is done ─────────────────────────────────────────────────────
    if (response.isDone || response.toolCalls.length === 0) {
      onEvent({ type: 'done', text: response.text, filesChanged })
      return
    }

    // ── Execute tools in parallel ─────────────────────────────────────────
    // Emit tool_start for all tools immediately, then run concurrently.
    if (signal?.aborted) return
    response.toolCalls.forEach(tc => onEvent({ type: 'tool_start', name: tc.name, input: tc.input }))

    const settled = await Promise.allSettled(
      response.toolCalls.map(async (tc) => {
        try {
          const result = await executeTool(tc.name, tc.input)
          if (tc.name === 'write_file' || tc.name === 'edit_file' || tc.name === 'delete_file') {
            const path = tc.input.path
            if (!filesChanged.includes(path)) filesChanged.push(path)
            const action = tc.name === 'write_file' ? 'write' : tc.name === 'delete_file' ? 'delete' : 'edit'
            onEvent({ type: 'file_write', path, action })
          }
          onEvent({ type: 'tool_done', name: tc.name, result, error: null })
          return result
        } catch (err) {
          onEvent({ type: 'tool_done', name: tc.name, result: `ERROR: ${err.message}`, error: err.message })
          return `ERROR: ${err.message}`
        }
      })
    )
    const results = settled.map(r => r.status === 'fulfilled' ? r.value : `ERROR: ${r.reason}`)

    // ── Append assistant + tool results to conversation, then prune ───────
    const nextMessages = buildToolResultMessages(
      response.toolCalls, results, isAnthropic, response._raw,
    )
    messages = pruneMessages([...messages, ...nextMessages])

    // ── Loop detection ────────────────────────────────────────────────────
    const sig = toolSignature(response.toolCalls)
    recentSigs.push(sig)
    if (recentSigs.length > LOOP_WINDOW) recentSigs.shift()
    if (recentSigs.length === LOOP_WINDOW && recentSigs.every(s => s === sig)) {
      recentSigs.length = 0   // reset so we only fire once per loop cycle
      const recoveryNote = '⚠ You appear to be repeating the same tool calls. Try a completely different approach, re-read the relevant files, or conclude with what you have found so far.'
      messages.push({ role: 'user', content: recoveryNote })
      onEvent({ type: 'text_delta', delta: '\n[Loop detected — injecting recovery prompt]\n' })
    }
  }

  // Hit MAX_TURNS — emit whatever we have
  onEvent({ type: 'done', text: `Reached maximum turn limit (${AGENT_MAX_TURNS}).`, filesChanged })
}
