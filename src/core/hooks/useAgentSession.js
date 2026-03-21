// ─── useAgentSession ──────────────────────────────────────────────────────────
// Encapsulates all state and logic for running the agentic tool-use loop.
// Extracted from Logik.jsx to isolate agent concerns from generate/UI concerns.

import { useState, useRef, useCallback } from 'react'
import { runAgentLoop } from '../../services/agentLoop.js'
import { makeExecutor }  from '../../services/agentExecutor.js'
import { AGENT_TOOLS, buildAgentSystemPrompt } from '../../services/agentTools.js'
import { shadowContext } from '../../services/shadowContext.js'

// Read-only tools — used when planMode is active (no writes, no shell exec)
const PLAN_MODE_TOOLS = new Set([
  'read_file', 'list_directory', 'search_files',
  'grep', 'read_many_files', 'web_fetch', 'web_search',
  'read_source_file', 'list_source_directory',
  'lint_file', 'todo',
])

export function useAgentSession({
  modelConfig,       // {apiKey, baseUrl, modelId, …}
  githubConfig,      // {token, owner, repo, branch}
  sourceRepoConfig,  // {token, owner, repo, branch} | null — secondary (read-only) repo
  bridgeAvailable,   // bool
  webSearchApiKey,   // string | '' — Tavily API key (optional)
  planMode,          // bool — read-only analysis mode
  logActivity,       // (type, msg, detail?) => id
  updateActivity,    // (id, updates) => void
  clearActivity,     // () => void
  activityRef,       // ref to the activity entries array (for last-entry lookup)
  onFileWrite,       // (path, action) => void (optional)
  onSetActiveTab,    // (tabId) => void
  onSetError,        // (msg) => void
  onPromptClear,     // () => void
  onPlanDone,        // (task, summary) => void — called when plan mode agent finishes
}) {
  const [isAgentRunning,  setIsAgentRunning]  = useState(false)
  const [agentSummary,    setAgentSummary]    = useState('')
  const [agentFiles,      setAgentFiles]      = useState([])
  const [agentStreamText, setAgentStreamText] = useState('')

  const streamTextRef   = useRef('')
  const abortRef        = useRef(null)
  const runningRef      = useRef(false)   // guard against concurrent runs
  const pendingToolsRef = useRef(new Map()) // Map<toolId, activityId> for matching tool_start/done

  const run = useCallback(async (task, conversationHistory = [], { forceBuildMode = false } = {}) => {
    if (!task?.trim()) { onSetError?.('Enter a task for the agent.'); return }
    if (!modelConfig)        { onSetError?.('Select a model.'); return }
    if (!modelConfig.apiKey) { onSetError?.(`No API key for "${modelConfig.name}". Open Admin Panel.`); return }
    if (runningRef.current)  return   // prevent concurrent invocations

    onSetError?.('')
    runningRef.current = true
    clearActivity()
    setIsAgentRunning(true)
    setAgentSummary('')
    setAgentFiles([])
    streamTextRef.current = ''
    setAgentStreamText('')

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const executor = makeExecutor({
      token:           githubConfig.token,
      owner:           githubConfig.owner,
      repo:            githubConfig.repo,
      branch:          githubConfig.branch,
      sourceRepoConfig,
      webSearchApiKey: webSearchApiKey || '',
      bridgeAvailable: !!bridgeAvailable,
      onFileWrite: (path, action) => {
        setAgentFiles(prev => prev.includes(path) ? prev : [...prev, path])
        onFileWrite?.(path, action)
      },
    })

    // In plan mode only include read-only tools so the model can't accidentally
    // write files even if it tries to call a mutating tool.
    const tools = (planMode && !forceBuildMode)
      ? AGENT_TOOLS.filter(t => PLAN_MODE_TOOLS.has(t.name))
      : AGENT_TOOLS

    const systemPrompt = buildAgentSystemPrompt(
      shadowContext.getConventions(),
      shadowContext.getLogikMd(),
      githubConfig.owner || 'unknown',
      githubConfig.repo  || 'unknown',
      bridgeAvailable,
      sourceRepoConfig,
      planMode,
      !!webSearchApiKey,
      shadowContext.buildRepoMap(3000),   // Aider-style symbol map ranked by centrality
    )

    const startId = logActivity('agent', `⚡ Agent starting — "${task.slice(0, 60)}"`)
    onSetActiveTab?.('activity')

    try { await runAgentLoop({
      task,
      systemPrompt,
      tools,
      executeTool: executor,
      modelConfig,
      signal:      ctrl.signal,
      conversationHistory,
      onEvent: (ev) => {
        switch (ev.type) {
          case 'turn': {
            // Archive any streamed narration from the previous turn
            const prev = streamTextRef.current.trim()
            if (prev) {
              logActivity('agent', `💬 ${prev}`)
              streamTextRef.current = ''
              setAgentStreamText('')
            }
            updateActivity(startId, { msg: `⚡ Agent — turn ${ev.turn}` })
            break
          }

          case 'text_delta':
            streamTextRef.current += ev.delta
            setAgentStreamText(streamTextRef.current)
            break

          case 'tool_start': {
            // Flush any streaming narration before the tool line
            const narration = streamTextRef.current.trim()
            if (narration) {
              logActivity('agent', `💬 ${narration}`)
              streamTextRef.current = ''
              setAgentStreamText('')
            }
            logActivity('tool', `▶ ${ev.name}(${JSON.stringify(ev.input).slice(0, 80)})`)
            break
          }

          case 'tool_done': {
            // Update the last entry in the activity log (which is the tool_start we just added)
            const last = activityRef?.current?.[activityRef.current.length - 1]
            if (last) {
              updateActivity(last.id, {
                status: ev.error ? 'error' : 'done',
                detail: String(ev.result).slice(0, 120),
              })
            }
            break
          }

          case 'usage': {
            // Claude Code-style per-turn token accounting (↑ input  ↓ output)
            const fmt = n => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
            if (ev.inputTokens || ev.outputTokens)
              logActivity('agent', `↑ ${fmt(ev.inputTokens)} in  ↓ ${fmt(ev.outputTokens)} out`)
            break
          }

          case 'file_write':
            logActivity('write', `✏ ${ev.action}: ${ev.path}`)
            break

          case 'done': {
            const final = streamTextRef.current.trim()
            if (final) {
              logActivity('agent', `💬 ${final}`)
              streamTextRef.current = ''
              setAgentStreamText('')
            }
            setAgentSummary(ev.text || '')
            setAgentFiles(ev.filesChanged || [])
            updateActivity(startId, {
              status: 'done',
              msg: `⚡ Agent done — ${ev.filesChanged?.length || 0} file(s) changed`,
            })
            logActivity('done', `✓ Agent complete`)
            onSetActiveTab?.('activity')
            if (planMode && !forceBuildMode) onPlanDone?.(task, ev.text || '')
            break
          }

          case 'error':
            logActivity('error', `✗ Agent error: ${ev.message}`)
            updateActivity(startId, { status: 'error', msg: `⚡ Agent failed — ${ev.message}` })
            break

          default: break
        }
      },
    }) } catch (unexpectedErr) {
      // runAgentLoop should never throw (emits error events instead), but catch here
      // as an absolute safety net so isAgentRunning is always cleared
      logActivity('error', `✗ Agent crashed: ${unexpectedErr.message}`)
      updateActivity(startId, { status: 'error', msg: `⚡ Agent crashed — ${unexpectedErr.message}` })
      onSetError?.(`Agent crashed: ${unexpectedErr.message}`)
    } finally {
      runningRef.current = false
      streamTextRef.current = ''
      setAgentStreamText('')
      setIsAgentRunning(false)
      onPromptClear?.()
    }
  }, [modelConfig, githubConfig, sourceRepoConfig, bridgeAvailable, webSearchApiKey, planMode,
      logActivity, updateActivity, clearActivity, activityRef, onFileWrite, onSetActiveTab, onSetError, onPromptClear])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setIsAgentRunning(false)
  }, [])

  return { isAgentRunning, agentSummary, agentFiles, agentStreamText, abortRef, run, abort }
}
