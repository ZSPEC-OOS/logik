// ── agentTools — tool schemas for the agentic loop ───────────────────────────
// Defined in Anthropic format (input_schema).
// callWithTools() in aiService.js converts to OpenAI format automatically.

import { LOGIK_MD_CAP } from '../config/constants.js'

export const AGENT_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the full contents of a file from the connected GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to repo root, e.g. src/App.jsx' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or completely overwrite an existing file in the repository.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path relative to repo root' },
        content: { type: 'string', description: 'Full file content to write'       },
        message: { type: 'string', description: 'Commit message (optional)'        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Surgically replace an exact string in a file. Preferred over write_file for small changes.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path relative to repo root'          },
        old_str: { type: 'string', description: 'Exact text to find and replace'           },
        new_str: { type: 'string', description: 'Replacement text'                         },
        message: { type: 'string', description: 'Commit message (optional)'                },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories inside a directory of the repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path, or empty string for repo root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search the indexed repository for files relevant to a query. Returns scored file paths.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms, e.g. "authentication hook"' },
        limit: { type: 'number', description: 'Max results to return (default 8)'        },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command via the local exec bridge (npm, git, eslint, tsc, etc.). Only available when the Vite dev server is running.',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'Full command string, e.g. "npm test" or "git status"' },
        cwd: { type: 'string', description: 'Working directory (optional, defaults to project root)' },
      },
      required: ['cmd'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the repository. Use with caution — this is irreversible without a git revert.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path relative to repo root' },
        message: { type: 'string', description: 'Commit message (optional)'       },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_pull_request',
    description: 'Create a GitHub pull request from the current working branch to the base branch.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR title'                       },
        body:  { type: 'string', description: 'PR description in Markdown'     },
        head:  { type: 'string', description: 'Source branch name'             },
        base:  { type: 'string', description: 'Target branch (e.g. "main")'   },
      },
      required: ['title', 'head', 'base'],
    },
  },
]

// System prompt injected at the start of every agent session
export function buildAgentSystemPrompt(conventions, logikMd, repoOwner, repoName, bridgeAvailable) {
  const lines = [
    `You are LOGIK Agent, an autonomous AI coding assistant operating on the GitHub repository ${repoOwner}/${repoName}.`,
    ``,
    `You have access to tools that let you read files, write files, edit files, search the codebase, run shell commands, and create pull requests.`,
    `Work autonomously — do not ask the user for clarification. Make smart decisions and get the task done.`,
    ``,
    `WORKFLOW:`,
    `1. Understand the task.`,
    `2. Explore the codebase using list_directory and search_files as needed.`,
    `3. Read relevant files before modifying them.`,
    `4. Make changes using edit_file (for small changes) or write_file (for new files or rewrites).`,
    `5. Run tests or lint if available to verify correctness.`,
    `6. When all changes are complete, summarise what you did.`,
    ``,
    `RULES:`,
    `- Always read a file before editing it.`,
    `- Prefer edit_file over write_file for modifications to existing files.`,
    `- Never truncate code — write complete, production-ready implementations.`,
    `- Do not ask the user questions — proceed with best judgment.`,
    !bridgeAvailable ? `- run_command is not available (exec bridge offline).` : `- run_command is available — use it to verify your work.`,
  ]

  if (conventions && conventions.framework !== 'unknown') {
    lines.push(``, `PROJECT CONVENTIONS (follow exactly):`)
    lines.push(`  Framework: ${conventions.framework}`)
    lines.push(`  Language: ${conventions.language}`)
    lines.push(`  Naming: ${conventions.namingConvention}`)
    if (conventions.testFramework !== 'unknown') lines.push(`  Tests: ${conventions.testFramework}`)
    if (conventions.srcDir) lines.push(`  Source root: ${conventions.srcDir}/`)
    if (conventions.deps?.length) lines.push(`  Key deps: ${conventions.deps.slice(0, 12).join(', ')}`)
  }

  if (logikMd) {
    lines.push(``, `PROJECT INSTRUCTIONS (from LOGIK.md — follow exactly):`, logikMd.slice(0, LOGIK_MD_CAP))
  }

  return lines.filter(l => l !== undefined).join('\n')
}
