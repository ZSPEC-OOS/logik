// ── agentExecutor — connects tool names to real I/O ──────────────────────────
//
// makeExecutor() returns an async function (name, input) => string
// that the agentic loop calls for each tool the model requests.
//
// Execution routes:
//   read_file       → GitHub Contents API
//   write_file      → GitHub Contents API (create or update)
//   edit_file       → read → patch → write via GitHub
//   list_directory  → GitHub Contents API (paginated)
//   search_files    → ShadowContext relevance index
//   run_command     → Vite exec bridge (POST /api/exec)
//   create_pull_request → GitHub Pulls API

import {
  getFileContent,
  createOrUpdateFile,
  deleteFile,
  listDirectory,
  createPullRequest,
} from './githubService.js'
import { decodeBase64 } from '../utils/base64.js'
import { shadowContext } from './shadowContext.js'
import { EXEC_BRIDGE_TIMEOUT_MS } from '../config/constants.js'

// ── Exec bridge call ──────────────────────────────────────────────────────────
async function execBridge(cmd, cwd) {
  try {
    const res = await fetch('/api/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, cwd, timeout: EXEC_BRIDGE_TIMEOUT_MS }),
    })
    if (!res.ok) return `bridge HTTP error ${res.status}`
    const { stdout, stderr, exitCode } = await res.json()
    const out = [stdout?.trimEnd(), stderr?.trimEnd()].filter(Boolean).join('\n')
    return `exit ${exitCode}\n${out || '(no output)'}`
  } catch (err) {
    return `exec bridge unavailable: ${err.message}`
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────
// ── Web search via Tavily ─────────────────────────────────────────────────────
// Tavily explicitly supports browser-side requests (CORS-enabled).
// In dev mode requests are proxied through Vite to avoid any CORS edge cases.
const IS_DEV_EXEC = typeof import.meta !== 'undefined' && import.meta.env?.DEV
const TAVILY_URL = IS_DEV_EXEC ? '/api/proxy/tavily/search' : 'https://api.tavily.com/search'

async function tavilySearch(apiKey, query, maxResults, includeDomains) {
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key:         apiKey,
      query,
      search_depth:    'basic',
      include_answer:  true,
      max_results:     Math.min(maxResults || 5, 10),
      include_domains: includeDomains || [],
    }),
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`)
  return res.json()
}

export function makeExecutor({ token, owner, repo, branch, onFileWrite, sourceRepoConfig, webSearchApiKey }) {
  return async function executeTool(name, input) {
    switch (name) {

      // ── read_file ──────────────────────────────────────────────────────
      case 'read_file': {
        const file = await getFileContent(token, owner, repo, input.path, branch)
        if (!file?.content) return `File not found: ${input.path}`
        const content = decodeBase64(file.content)
        return `--- ${input.path} (${content.split('\n').length} lines) ---\n${content.slice(0, 20000)}`
      }

      // ── write_file ─────────────────────────────────────────────────────
      case 'write_file': {
        const existing = await getFileContent(token, owner, repo, input.path, branch)
        const sha      = existing?.sha || null
        const msg      = input.message || `agent: write ${input.path}`
        await createOrUpdateFile(token, owner, repo, input.path, input.content, msg, branch, sha)
        onFileWrite?.(input.path, 'write')
        return `Written: ${input.path} (${input.content.split('\n').length} lines)`
      }

      // ── edit_file ──────────────────────────────────────────────────────
      case 'edit_file': {
        const file = await getFileContent(token, owner, repo, input.path, branch)
        if (!file?.content) return `File not found: ${input.path}`
        const current = decodeBase64(file.content)

        if (!current.includes(input.old_str)) {
          // Fuzzy match: try trimming each line
          const normCurrent = current.split('\n').map(l => l.trimStart()).join('\n')
          const normOld     = input.old_str.split('\n').map(l => l.trimStart()).join('\n')
          if (!normCurrent.includes(normOld)) {
            return `edit_file failed: old_str not found in ${input.path}. Read the file first and use exact text.`
          }
          // Fuzzy match found but exact failed — indentation mismatch
          return `edit_file failed: old_str found in ${input.path} but with different leading whitespace. Read the file and copy the exact indentation.`
        }

        const updated = current.replace(input.old_str, input.new_str)

        const msg = input.message || `agent: edit ${input.path}`
        await createOrUpdateFile(token, owner, repo, input.path, updated, msg, branch, file.sha)
        onFileWrite?.(input.path, 'edit')
        return `Edited: ${input.path}`
      }

      // ── delete_file ────────────────────────────────────────────────────
      case 'delete_file': {
        const file = await getFileContent(token, owner, repo, input.path, branch)
        if (!file?.sha) return `File not found: ${input.path}`
        const msg = input.message || `agent: delete ${input.path}`
        await deleteFile(token, owner, repo, input.path, file.sha, msg, branch)
        onFileWrite?.(input.path, 'delete')
        return `Deleted: ${input.path}`
      }

      // ── list_directory ─────────────────────────────────────────────────
      case 'list_directory': {
        const items = await listDirectory(token, owner, repo, input.path || '', branch)
        if (items.length === 0) return `Empty or not found: ${input.path || '/'}`
        return items.map(i => `${i.type === 'dir' ? 'd' : 'f'} ${i.path}`).join('\n')
      }

      // ── search_files ───────────────────────────────────────────────────
      case 'search_files': {
        if (!shadowContext.isReady) return 'Codebase index not ready yet. Try list_directory instead.'
        const results = shadowContext.findRelevantFiles(input.query, input.limit || 8)
        if (results.length === 0) return `No files found matching: ${input.query}`
        return results.map(f => `${f.path} (score: ${f.score})`).join('\n')
      }

      // ── run_command ────────────────────────────────────────────────────
      case 'run_command': {
        return execBridge(input.cmd, input.cwd)
      }

      // ── create_pull_request ────────────────────────────────────────────
      case 'create_pull_request': {
        const pr = await createPullRequest(
          token, owner, repo,
          input.title,
          input.head,
          input.base,
          input.body || '',
        )
        return pr?.html_url
          ? `PR created: ${pr.html_url} (#${pr.number})`
          : `PR creation failed`
      }

      // ── read_source_file ───────────────────────────────────────────────
      case 'read_source_file': {
        if (!sourceRepoConfig?.owner) return 'No source repository connected.'
        const { token: sToken, owner: sOwner, repo: sRepo, branch: sBranch } = sourceRepoConfig
        const file = await getFileContent(sToken || token, sOwner, sRepo, input.path, sBranch)
        if (!file?.content) return `File not found in source repo: ${input.path}`
        const content = decodeBase64(file.content)
        return `--- [SOURCE: ${sOwner}/${sRepo}] ${input.path} (${content.split('\n').length} lines) ---\n${content.slice(0, 20000)}`
      }

      // ── list_source_directory ──────────────────────────────────────────
      case 'list_source_directory': {
        if (!sourceRepoConfig?.owner) return 'No source repository connected.'
        const { token: sToken, owner: sOwner, repo: sRepo, branch: sBranch } = sourceRepoConfig
        const items = await listDirectory(sToken || token, sOwner, sRepo, input.path || '', sBranch)
        if (items.length === 0) return `Empty or not found in source repo: ${input.path || '/'}`
        return items.map(i => `${i.type === 'dir' ? 'd' : 'f'} ${i.path}`).join('\n')
      }

      // ── web_search ─────────────────────────────────────────────────────
      case 'web_search': {
        if (!webSearchApiKey) {
          return 'Web search is not configured. Add a Tavily API key in Settings → Web Search, then reload.'
        }
        try {
          const data = await tavilySearch(webSearchApiKey, input.query, input.max_results, input.include_domains)
          const lines = []
          if (data.answer) lines.push(`Answer: ${data.answer}\n`)
          for (const r of (data.results || []).slice(0, 8)) {
            lines.push(`[${r.title}](${r.url})`)
            if (r.content) lines.push(r.content.slice(0, 400))
            lines.push('')
          }
          return lines.join('\n').trim() || 'No results found.'
        } catch (err) {
          return `web_search error: ${err.message}`
        }
      }

      // ── todo ───────────────────────────────────────────────────────────
      case 'todo': {
        const icons = { add: '📋', in_progress: '⚙', done: '✓' }
        const icon = icons[input.action] || '📋'
        return `${icon} [${input.action}] ${input.task}`
      }

      default:
        return `Unknown tool: ${name}`
    }
  }
}
