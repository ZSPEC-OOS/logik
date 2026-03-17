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
export function makeExecutor({ token, owner, repo, branch, onFileWrite, sourceRepoConfig }) {
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

      default:
        return `Unknown tool: ${name}`
    }
  }
}
