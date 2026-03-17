// ── agentExecutor — connects tool names to real I/O ──────────────────────────
//
// makeExecutor() returns an async function (name, input) => string
// that the agentic loop calls for each tool the model requests.
//
// Execution routes:
//   read_file         → GitHub Contents API (with optional line range)
//   read_many_files   → GitHub Contents API (parallel batch)
//   write_file        → GitHub Contents API (create or update)
//   edit_file         → read → patch → write via GitHub
//   list_directory    → GitHub Contents API (paginated, includes file sizes)
//   search_files      → ShadowContext relevance index
//   grep              → ShadowContext content index (regex search)
//   web_fetch         → exec bridge curl | direct fetch fallback
//   web_search        → Tavily REST API
//   update_memory     → appends note to LOGIK.md via GitHub API
//   run_command       → Vite exec bridge (POST /api/exec)
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

export function makeExecutor({ token, owner, repo, branch, onFileWrite, sourceRepoConfig, webSearchApiKey, bridgeAvailable }) {
  return async function executeTool(name, input) {
    switch (name) {

      // ── read_file (with optional line range) ───────────────────────────
      case 'read_file': {
        const file = await getFileContent(token, owner, repo, input.path, branch)
        if (!file?.content) return `File not found: ${input.path}`
        const content = decodeBase64(file.content)
        const lines   = content.split('\n')
        if (input.start_line || input.end_line) {
          const s = Math.max(0, (input.start_line || 1) - 1)
          const e = Math.min(lines.length, input.end_line || lines.length)
          return `--- ${input.path} (lines ${s + 1}–${e} of ${lines.length}) ---\n${lines.slice(s, e).join('\n')}`
        }
        return `--- ${input.path} (${lines.length} lines) ---\n${content.slice(0, 20000)}`
      }

      // ── read_many_files ────────────────────────────────────────────────
      case 'read_many_files': {
        const paths = (input.paths || []).slice(0, 20)
        if (paths.length === 0) return 'No paths provided.'
        const settled = await Promise.allSettled(paths.map(async p => {
          const file = await getFileContent(token, owner, repo, p, branch)
          if (!file?.content) return `--- ${p} ---\nFile not found.`
          const content = decodeBase64(file.content)
          return `--- ${p} (${content.split('\n').length} lines) ---\n${content.slice(0, 10000)}`
        }))
        return settled.map(r => r.status === 'fulfilled' ? r.value : `Error: ${r.reason}`).join('\n\n')
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

      // ── list_directory (with file sizes) ──────────────────────────────
      case 'list_directory': {
        const items = await listDirectory(token, owner, repo, input.path || '', branch)
        if (items.length === 0) return `Empty or not found: ${input.path || '/'}`
        return items.map(i => {
          const sz = i.type === 'file' && i.size ? ` (${(i.size / 1024).toFixed(1)} KB)` : ''
          return `${i.type === 'dir' ? 'd' : 'f'} ${i.path}${sz}`
        }).join('\n')
      }

      // ── grep ───────────────────────────────────────────────────────────
      case 'grep': {
        if (!shadowContext.isReady)
          return `Codebase index not ready (${shadowContext.indexedFileCount()} files indexed). Try list_directory instead.`
        let results
        try {
          results = shadowContext.grepContent(input.pattern, input.path || null, input.ignore_case ? 'i' : '')
        } catch (e) {
          return `grep error: ${e.message}`
        }
        if (results.length === 0) return `No matches for /${input.pattern}/${input.ignore_case ? 'i' : ''} in ${shadowContext.indexedFileCount()} indexed files.`
        const lines = results.slice(0, 150).map(r => `${r.path}:${r.line}: ${r.text.trimEnd()}`)
        const suffix = results.length > 150 ? `\n… (${results.length - 150} more results, refine the pattern)` : ''
        return lines.join('\n') + suffix
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

      // ── web_fetch ──────────────────────────────────────────────────────
      case 'web_fetch': {
        // Prefer exec-bridge curl (avoids CORS, strips HTML to plain text)
        if (bridgeAvailable) {
          const safe = input.url.replace(/"/g, '\\"')
          const raw = await execBridge(`curl -s -L --max-time 20 --max-filesize 500000 -A "Mozilla/5.0" "${safe}"`, null)
          const text = raw
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ').trim()
            .slice(0, 15000)
          return text || '(empty response)'
        }
        // Fallback: direct browser fetch (works for CORS-enabled APIs / raw files)
        try {
          const res = await fetch(input.url, { signal: AbortSignal.timeout(20000) })
          if (!res.ok) return `HTTP ${res.status}: ${res.statusText}`
          const text = await res.text()
          return text.slice(0, 15000)
        } catch (err) {
          return `web_fetch failed: ${err.message}. For arbitrary URLs, run with the exec bridge (npm run dev).`
        }
      }

      // ── update_memory ──────────────────────────────────────────────────
      case 'update_memory': {
        const memPath = 'LOGIK.md'
        const existing = await getFileContent(token, owner, repo, memPath, branch)
        const current  = existing?.content ? decodeBase64(existing.content) : ''
        const today    = new Date().toISOString().slice(0, 10)
        const appended = `${current.trimEnd()}\n\n## Agent Note (${today})\n\n${input.note.trim()}\n`
        const sha = existing?.sha || null
        await createOrUpdateFile(token, owner, repo, memPath, appended,
          `agent: memory — ${input.note.slice(0, 60)}`, branch, sha)
        onFileWrite?.(memPath, 'edit')
        return `Memory updated: appended note to ${memPath}`
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
