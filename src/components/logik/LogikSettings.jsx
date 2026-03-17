import { memo } from 'react'
import { clearApiKeys } from '../../services/aiService.js'
import { getRepo } from '../../services/githubService.js'
import { parseGitHubUrl } from '../../utils/codeUtils.js'

// ─── LogikSettings ────────────────────────────────────────────────────────────
// Settings drawer: GitHub credentials, theme picker, fine-tune sliders,
// permission mode, and LOGIK.md editor.
const LogikSettings = memo(function LogikSettings({
  // GitHub config — primary (target) repo
  githubToken, setGithubToken,
  repoOwner,   setRepoOwner,
  repoName,    setRepoName,
  baseBranch,  setBaseBranch,
  hasGithub,
  onReindex,

  // Source repo (secondary / fusion)
  repo2Token, setRepo2Token,
  repo2Owner, setRepo2Owner,
  repo2Name,  setRepo2Name,
  repo2Branch,setRepo2Branch,
  hasBothRepos,
  onReindex2,

  // Generation options
  generateTests, setGenerateTests,
  creativity, setCreativity,
  enableThinking, setEnableThinking,

  // Push options
  doCreateBranch, setDoCreateBranch,
  doCreatePR,     setDoCreatePR,
  dryRun,         setDryRun,

  // Theme
  theme, setTheme,

  // Fine-tune
  fineTune, setFineTune, DEFAULT_FT,

  // Permission mode
  permissionMode, setPermissionMode,

  // LOGIK.md
  logikMdDraft, setLogikMdDraft, onSaveLogikMd, isSavingLogikMd,
}) {
  const GHTOKEN_SS_KEY = 'logik:ghtoken'

  return (
    <div className="lk-drawer lk-drawer--settings">
      {/* Quick setup — paste a GitHub URL to fill owner + repo */}
      <div className="lk-field lk-field--url">
        <label className="lk-label">Quick Setup</label>
        <input
          className="lk-input"
          placeholder="Paste GitHub URL — github.com/owner/repo"
          onChange={e => {
            const parsed = parseGitHubUrl(e.target.value)
            if (parsed) { setRepoOwner(parsed.owner); setRepoName(parsed.repo) }
          }}
        />
        <span className="lk-hint">Auto-fills Owner and Repository below</span>
      </div>

      <div className="lk-drawer-grid">
        <div className="lk-field">
          <label className="lk-label">GitHub Token (PAT)</label>
          <input className="lk-input" type="password" placeholder="ghp_xxxxxxxxxxxx"
            value={githubToken} onChange={e => setGithubToken(e.target.value)} autoComplete="off" />
          <span className="lk-hint">Needs <code>repo</code> scope</span>
          <button className="lk-btn lk-btn--small lk-btn--warn" onClick={() => { clearApiKeys(); setGithubToken('') }}>
            Clear stored keys
          </button>
        </div>
        <div className="lk-field">
          <label className="lk-label">Owner</label>
          <input className="lk-input" placeholder="username or org"
            value={repoOwner} onChange={e => setRepoOwner(e.target.value.trim())} />
        </div>
        <div className="lk-field">
          <label className="lk-label">Repository</label>
          <input className="lk-input" placeholder="my-repo"
            value={repoName} onChange={e => setRepoName(e.target.value.trim())} />
        </div>
        <div className="lk-field">
          <label className="lk-label">Base Branch</label>
          <div className="lk-branch-row">
            <input className="lk-input" placeholder="main"
              value={baseBranch} onChange={e => setBaseBranch(e.target.value.trim())} />
            <button
              className="lk-icon-btn"
              title="Detect default branch from GitHub"
              disabled={!githubToken || !repoOwner || !repoName}
              onClick={async () => {
                try {
                  const repo = await getRepo(githubToken, repoOwner, repoName)
                  if (repo.default_branch) setBaseBranch(repo.default_branch)
                } catch {}
              }}
            >⟳</button>
          </div>
        </div>
        <div className="lk-field">
          <button className="lk-btn lk-btn--small" disabled={!hasGithub} onClick={onReindex}>
            ♻ Reindex repository
          </button>
          <span className="lk-hint">Refresh the repo index and conventions (clears cached snapshot).</span>
        </div>
      </div>

      {/* ── Source Repository (Fusion) ──────────────────────────────────────── */}
      <div className="lk-security-section">
        <div className="lk-security-label lk-fusion-settings-label">
          Source Repository
          {hasBothRepos && <span className="lk-fusion-badge">⟳ Fusion Active</span>}
        </div>
        <div className="lk-security-body">
          <span className="lk-security-note">
            Connect a second repo as a read-only source. When both repos are connected, the Fusion tab unlocks — giving you preset rituals to extract patterns, features, and strengths from source into target.
          </span>
          <div className="lk-field lk-field--url">
            <label className="lk-label">Quick Setup</label>
            <input
              className="lk-input"
              placeholder="Paste GitHub URL — github.com/owner/repo"
              onChange={e => {
                const parsed = parseGitHubUrl(e.target.value)
                if (parsed) { setRepo2Owner(parsed.owner); setRepo2Name(parsed.repo) }
              }}
            />
          </div>
          <div className="lk-drawer-grid">
            <div className="lk-field">
              <label className="lk-label">Token (optional — reuses primary if blank)</label>
              <input className="lk-input" type="password" placeholder="ghp_xxxxxxxxxxxx (or leave blank)"
                value={repo2Token} onChange={e => setRepo2Token(e.target.value)} autoComplete="off" />
            </div>
            <div className="lk-field">
              <label className="lk-label">Owner</label>
              <input className="lk-input" placeholder="username or org"
                value={repo2Owner} onChange={e => setRepo2Owner(e.target.value.trim())} />
            </div>
            <div className="lk-field">
              <label className="lk-label">Repository</label>
              <input className="lk-input" placeholder="source-repo"
                value={repo2Name} onChange={e => setRepo2Name(e.target.value.trim())} />
            </div>
            <div className="lk-field">
              <label className="lk-label">Branch</label>
              <input className="lk-input" placeholder="main"
                value={repo2Branch} onChange={e => setRepo2Branch(e.target.value.trim())} />
            </div>
            <div className="lk-field">
              <button className="lk-btn lk-btn--small" disabled={!repo2Owner || !repo2Name} onClick={onReindex2}>
                ♻ Reindex source
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="lk-drawer-toggles">
        <label className="lk-toggle"><input type="checkbox" checked={generateTests} onChange={e => setGenerateTests(e.target.checked)} /><span>Generate test file alongside code</span></label>
        <label className="lk-toggle"><input type="checkbox" checked={doCreateBranch} onChange={e => setDoCreateBranch(e.target.checked)} /><span>Auto-create branch (<code>logik/…</code>)</span></label>
        <label className="lk-toggle"><input type="checkbox" checked={doCreatePR} onChange={e => setDoCreatePR(e.target.checked)} /><span>Auto-create pull request</span></label>
        <label className="lk-toggle lk-toggle--warn"><input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} /><span>Dry run — preview only, no commits</span></label>
        <label className="lk-toggle"><input type="checkbox" checked={enableThinking} onChange={e => setEnableThinking(e.target.checked)} /><span>Extended thinking <span className="lk-hint-inline">(Claude only — deeper reasoning, slower)</span></span></label>
      </div>

      {/* Creativity slider */}
      <div className="lk-finetune-section">
        <div className="lk-finetune-label">Creativity</div>
        <div className="lk-finetune-grid">
          <div className="lk-finetune-row">
            <div className="lk-finetune-row-label">
              <span className="lk-finetune-name">{creativity <= 20 ? 'Precise' : creativity >= 80 ? 'Creative' : 'Balanced'}</span>
              <span className="lk-finetune-val">{creativity}</span>
            </div>
            <input
              type="range" className="lk-slider"
              min={0} max={100}
              value={creativity}
              onChange={e => setCreativity(Number(e.target.value))}
            />
          </div>
          <span className="lk-hint">0 = precise &amp; deterministic · 50 = balanced · 100 = creative &amp; varied</span>
        </div>
      </div>

      {/* Theme picker */}
      <div className="lk-theme-section">
        <div className="lk-theme-label">Theme</div>
        <div className="lk-theme-swatches">
          {[
            { id: 'graphite', name: 'Graphite', bg: '#1a1b1e', accent: '#74c0fc' },
            { id: 'claude',   name: 'Claude',   bg: '#1a1a1a', accent: '#da7756' },
            { id: 'midnight', name: 'Midnight', bg: '#0b0f1a', accent: '#38bdf8' },
            { id: 'obsidian', name: 'Obsidian', bg: '#07091A', accent: '#7B82D8' },
            { id: 'forest',   name: 'Forest',   bg: '#0d1f17', accent: '#34d399' },
            { id: 'crimson',  name: 'Crimson',  bg: '#160e0e', accent: '#f87171' },
          ].map(t => (
            <button
              key={t.id}
              className={`lk-theme-swatch${theme === t.id ? ' lk-theme-swatch--active' : ''}`}
              onClick={() => setTheme(t.id)}
              title={t.name}
            >
              <div className="lk-theme-dot" style={{ background: t.bg }}>
                <div className="lk-theme-dot-inner" style={{ background: t.accent }} />
              </div>
              <span className="lk-theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fine-tune sliders */}
      <div className="lk-finetune-section">
        <div className="lk-finetune-label">Fine-Tune</div>
        <div className="lk-finetune-grid">
          {[
            { key: 'brightness', label: 'Bright',    min: 50,  max: 150, def: 100 },
            { key: 'contrast',   label: 'Contrast',  min: 60,  max: 140, def: 100 },
            { key: 'saturation', label: 'Saturate',  min: 20,  max: 180, def: 100 },
            { key: 'highlight',  label: 'Highlight', min: 0,   max: 100, def: 50  },
            { key: 'shadow',     label: 'Shadow',    min: 0,   max: 100, def: 50  },
          ].map(({ key, label, min, max }) => (
            <div key={key} className="lk-finetune-row">
              <div className="lk-finetune-row-label">
                <span className="lk-finetune-name">{label}</span>
                <span className="lk-finetune-val">{fineTune[key]}</span>
              </div>
              <input
                type="range" className="lk-slider"
                min={min} max={max}
                value={fineTune[key]}
                onChange={e => setFineTune(prev => ({ ...prev, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
          <button className="lk-finetune-reset" onClick={() => setFineTune(DEFAULT_FT)}>
            ↺ Reset to defaults
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="lk-security-section">
        <div className="lk-security-label">Security</div>
        <div className="lk-security-body">
          <span className="lk-security-note">
            API keys and GitHub token are stored in sessionStorage only — cleared automatically when this tab closes.
            Keys are XOR-encrypted with a cryptographically-random per-session key (never stored in source code).
          </span>
          <div className="lk-permission-mode">
            <span className="lk-security-note">Push permission mode:</span>
            <div className="lk-permission-btns">
              {[
                { id: 'auto',   label: 'Auto',   title: 'Push immediately — no confirmation dialogs' },
                { id: 'ask',    label: 'Ask',    title: 'Confirm before every GitHub write (default)' },
                { id: 'manual', label: 'Manual', title: 'Confirm with extra context before each write' },
              ].map(m => (
                <button
                  key={m.id}
                  className={`lk-btn lk-btn--small${permissionMode === m.id ? ' lk-btn--active' : ''}`}
                  title={m.title}
                  onClick={() => {
                    setPermissionMode(m.id)
                    try { localStorage.setItem('logik:permMode', m.id) } catch {}
                  }}
                >{m.label}</button>
              ))}
            </div>
          </div>
          <button
            className="lk-btn lk-btn--clear-creds"
            onClick={() => {
              clearApiKeys()
              setGithubToken('')
              try { sessionStorage.removeItem(GHTOKEN_SS_KEY) } catch {}
            }}
            title="Remove all stored credentials from this session"
          >
            ⊘ Clear all credentials
          </button>
        </div>
      </div>

      {/* LOGIK.md editor */}
      <div className="lk-security-section">
        <div className="lk-security-label">Project Instructions (LOGIK.md)</div>
        <div className="lk-security-body">
          <span className="lk-security-note">
            Standing instructions injected into every generation prompt. Saved as LOGIK.md in your repo root.
          </span>
          <textarea
            className="lk-logikmd-editor"
            placeholder={'# LOGIK.md\nDescribe conventions, patterns, and rules for this project.\nExample: "Always use Tailwind for styling. Prefer hooks over class components."'}
            value={logikMdDraft}
            onChange={e => setLogikMdDraft(e.target.value)}
            rows={8}
          />
          <button
            className="lk-btn lk-btn--primary"
            onClick={onSaveLogikMd}
            disabled={isSavingLogikMd || !hasGithub}
            title={hasGithub ? 'Save LOGIK.md to repository' : 'GitHub connection required'}
          >
            {isSavingLogikMd ? 'Saving…' : '↑ Save to repo'}
          </button>
        </div>
      </div>
    </div>
  )
})

export default LogikSettings
