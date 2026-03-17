// ─── LogikFusionPanel ────────────────────────────────────────────────────────
// Appears when both a TARGET and SOURCE GitHub repo are connected.
// Provides preset "ritual" buttons that send deep extraction/integration
// prompts to the agent — letting LOGIK pull strengths from any repo into itself.

import { memo } from 'react'

// ── Ritual definitions ────────────────────────────────────────────────────────
// {src} and {tgt} are replaced at runtime with the actual owner/repo labels.

const FUSION_RITUALS = [
  {
    id:          'deep-audit',
    label:       'Deep Audit',
    icon:        '◈',
    description: 'Full architecture scan of source — map every integration opportunity',
    prompt:
`Perform a deep architectural audit of the SOURCE repository ({src}).

Use list_source_directory to explore its full structure. Then read all key files (package.json, main entry points, core services, utilities, hooks) using read_source_file.

For each significant pattern, service, or capability found in source:
1. Assess whether it is stronger or more robust than what exists in the target repo ({tgt})
2. Note exact file paths and their implementations
3. Score integration value (1-10)

Produce a prioritised report of integration opportunities with file-level specifics. Focus on: architectural patterns, utility functions, service abstractions, error handling, retry logic, caching, context management, and capabilities the target repo currently lacks.`,
  },
  {
    id:          'extract-integrate',
    label:       'Extract & Integrate',
    icon:        '⤓',
    description: 'Pull the highest-value patterns from source and integrate them',
    prompt:
`Extract and integrate the highest-value patterns from the SOURCE repository ({src}) into the TARGET repo ({tgt}).

Steps:
1. Use list_source_directory to understand source's full structure
2. Read source's core files using read_source_file (services, utils, hooks, components)
3. Identify the 3-5 specific improvements the target repo would benefit from most
4. For each improvement: read the source implementation fully with read_source_file, then write or edit the corresponding files in the TARGET repo
5. Maintain the target repo's existing conventions, architecture, and naming style
6. After all integrations, summarise: what was extracted, from which source files, and why it was chosen`,
  },
  {
    id:          'strength-hunt',
    label:       'Strength Hunt',
    icon:        '◎',
    description: 'Find what source does better than this repo and replicate it',
    prompt:
`Hunt for strengths in the SOURCE repository ({src}) that the TARGET repo ({tgt}) lacks or implements less robustly.

1. Use list_source_directory to systematically explore source's structure
2. Read source's services, utilities, and core logic using read_source_file
3. For each file/pattern, score robustness vs the target repo (focus on 7+/10)
4. For each strong pattern: read the full source implementation, then integrate it directly into the target repo
5. Add a brief code comment on each integration: "// Adapted from {src}"

Focus especially on: error handling, retry logic, caching strategies, context management, state patterns, streaming, and utility functions.`,
  },
  {
    id:          'feature-delta',
    label:       'Feature Delta',
    icon:        '⊕',
    description: 'Discover what source has that this repo is missing, then build it',
    prompt:
`Perform a feature delta analysis: find what the SOURCE ({src}) has that the TARGET ({tgt}) is missing, then implement it.

1. Read source's README.md and package.json using read_source_file to map its full capabilities
2. Explore source's main components and services with list_source_directory and read_source_file
3. Produce a list of features and capabilities source has that the target is missing or implements more weakly
4. For the top 3 highest-impact missing features: implement them in the target repo now
5. Adapt all implementations to fit the target repo's architecture, naming conventions, and existing dependencies`,
  },
  {
    id:          'self-evolve',
    label:       'Self-Evolve',
    icon:        '⟳',
    description: 'Extract the best of source and evolve this repo\'s own core systems',
    prompt:
`This is a self-evolution operation. Extract the best patterns from SOURCE ({src}) and evolve TARGET ({tgt}).

1. Use list_source_directory to explore source — read its AI/agent-related files, services, utilities, and core logic with read_source_file
2. Read the target repo's own core files (agentLoop.js, aiService.js, shadowContext.js, agentExecutor.js, planner.js) to understand the current implementation
3. Identify specific high-value improvements: better context handling, smarter planning, stronger execution, more robust error recovery
4. Implement the improvements directly — edit the relevant files in the target repo
5. Preserve all existing functionality — only enhance, never regress
6. Produce a closing summary: "What was learned from source" and "What was improved in target"`,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

const LogikFusionPanel = memo(function LogikFusionPanel({
  sourceRepo,    // { owner, repo, branch }
  targetRepo,    // { owner, repo, branch }
  onRunRitual,   // (prompt: string) => void
  isRunning,     // bool
  shadowStatus2, // string | null — indexing status of source repo
  buildMode,     // bool — full-screen takeover mode
}) {
  const srcLabel = (sourceRepo?.owner && sourceRepo?.repo)
    ? `${sourceRepo.owner}/${sourceRepo.repo}`
    : 'source'
  const tgtLabel = (targetRepo?.owner && targetRepo?.repo)
    ? `${targetRepo.owner}/${targetRepo.repo}`
    : 'target'

  function resolvePrompt(template) {
    return template
      .replace(/\{src\}/g, srcLabel)
      .replace(/\{tgt\}/g, tgtLabel)
  }

  return (
    <div className={`lk-fusion-panel${buildMode ? ' lk-fusion-panel--build' : ''}`}>

      {/* ── Repo header — only shown in tab mode (build mode uses topbar) ── */}
      {!buildMode && (
        <div className="lk-fusion-header">
          <div className="lk-fusion-repos">
            <div className="lk-fusion-repo lk-fusion-repo--source">
              <span className="lk-fusion-repo-role">SOURCE</span>
              <span className="lk-fusion-repo-name">{srcLabel}</span>
              {shadowStatus2 && (
                <span className="lk-fusion-repo-status">{shadowStatus2}</span>
              )}
            </div>
            <div className="lk-fusion-arrow">⟶</div>
            <div className="lk-fusion-repo lk-fusion-repo--target">
              <span className="lk-fusion-repo-role">TARGET</span>
              <span className="lk-fusion-repo-name">{tgtLabel}</span>
            </div>
          </div>
          <p className="lk-fusion-desc">
            Select a ritual — the agent reads source, identifies strengths, and integrates them into target.
          </p>
        </div>
      )}

      {/* ── Build mode heading ── */}
      {buildMode && (
        <p className="lk-fusion-build-heading">
          Select a ritual to begin. The agent will read <strong>{srcLabel}</strong>, identify strengths, and integrate them into <strong>{tgtLabel}</strong>.
        </p>
      )}

      {/* ── Ritual buttons ── */}
      <div className={`lk-fusion-grid${buildMode ? ' lk-fusion-grid--build' : ''}`}>
        {FUSION_RITUALS.map(ritual => (
          <button
            key={ritual.id}
            className={`lk-fusion-btn${buildMode ? ' lk-fusion-btn--build' : ''}`}
            onClick={() => onRunRitual(resolvePrompt(ritual.prompt))}
            disabled={isRunning}
            title={ritual.description}
          >
            <span className="lk-fusion-btn-icon">{ritual.icon}</span>
            <span className="lk-fusion-btn-body">
              <span className="lk-fusion-btn-label">{ritual.label}</span>
              <span className="lk-fusion-btn-desc">{ritual.description}</span>
            </span>
          </button>
        ))}
      </div>

    </div>
  )
})

export default LogikFusionPanel
