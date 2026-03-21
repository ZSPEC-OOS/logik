// ─── LogikSelfImprovePanel ────────────────────────────────────────────────────
// Replaces the Fusion tab. Orchestrates the self-improvement cycle between
// two Logik repository instances.
//
// States:
//   idle       → "Attach Second Repository" button centered
//   entering   → URL / manual field form
//   indexing   → progress bar while shadowContext2 indexes
//   ready      → split 50/50 preview + "Begin Self-Improvement Cycle"
//   running    → split screen with live activity + cycle controls
//   paused     → split screen, paused indicator, resume/stop

import { useState, useEffect, useRef, useCallback } from 'react'
import { shadowContext2 }          from '../../services/shadowContext'
import { runSelfImproveLoop, validateRepo } from '../../services/selfImproveService'

// ── Step labels ───────────────────────────────────────────────────────────────
const STEP_LABELS = {
  A: [
    null,
    'Analyzing logik2 for enhancement',
    'Implementing enhancement in logik2',
    'Committing logik2 changes',
    'Re-indexing logik2',
    'Cloning logik2 → logik',
    'Committing logik changes',
    'Re-indexing logik',
  ],
  B: [
    null, null, null, null, null, null, null, null,
    'Analyzing logik for enhancement',
    'Implementing enhancement in logik',
    'Committing logik changes',
    'Re-indexing logik',
    'Cloning logik → logik2',
    'Committing logik2 changes',
    'Re-indexing logik2',
  ],
}

function parseGitHubUrl(raw) {
  try {
    const clean = raw.trim().replace(/^https?:\/\//, '').replace(/^git@github\.com:/, 'github.com/')
    if (!clean.includes('github.com')) return null
    const after = clean.replace(/^.*github\.com\//, '')
    const parts  = after.split('/')
    if (parts.length < 2) return null
    const owner  = parts[0]
    const repo   = parts[1].replace(/\.git$/, '')
    const branch = parts[2] === 'tree' && parts[3] ? parts[3] : null
    return { owner, repo, branch }
  } catch { return null }
}

function ts() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LogikSelfImprovePanel({
  mainRepo,       // { token, owner, repo, branch }
  modelConfig,    // current model config
  webSearchApiKey,
  onActiveChange, // (isActive: bool) => void — notify parent
}) {
  // ── Attachment state ──────────────────────────────────────────────────────
  const [phase,      setPhase]      = useState('idle')     // idle | entering | indexing | ready
  const [urlInput,   setUrlInput]   = useState('')
  const [r2Owner,    setR2Owner]    = useState('')
  const [r2Repo,     setR2Repo]     = useState('')
  const [r2Branch,   setR2Branch]   = useState('main')
  const [r2Token,    setR2Token]    = useState('')
  const [idxStatus,  setIdxStatus]  = useState('')
  const [idxPct,     setIdxPct]     = useState(0)
  const [attachErr,  setAttachErr]  = useState(null)
  const [r2FileCount, setR2FileCount] = useState(null)

  // ── Cycle state ───────────────────────────────────────────────────────────
  const [cycleState, setCycleState] = useState('idle')     // idle | running | paused | stopping
  const [cycleCount, setCycleCount] = useState(0)
  const [cycleStep,  setCycleStep]  = useState(0)
  const [cyclePhase, setCyclePhase] = useState('A')
  const [cycleMsg,   setCycleMsg]   = useState('')
  const [cycleLog,   setCycleLog]   = useState([])         // enhancement history
  const [pauseNext,  setPauseNext]  = useState(false)

  // ── Activity feeds ────────────────────────────────────────────────────────
  const [logikFeed,  setLogikFeed]  = useState([])   // left pane (logik activity)
  const [logik2Feed, setLogik2Feed] = useState([])   // right pane (logik2 activity)

  const abortRef    = useRef(null)
  const pauseRef    = useRef(false)
  const FEED_MAX    = 60

  // ── Notify parent when cycle is active ───────────────────────────────────
  useEffect(() => {
    onActiveChange?.(phase === 'ready' || phase === 'indexing' || cycleState === 'running' || cycleState === 'paused')
  }, [phase, cycleState, onActiveChange])

  // ── ShadowContext2 polling during indexing ────────────────────────────────
  useEffect(() => {
    if (phase !== 'indexing') return
    const id = setInterval(() => {
      const summary = shadowContext2.statusSummary?.() || ''
      setIdxStatus(summary)
      const total   = shadowContext2._fileIndex?.length || 0
      const target  = shadowContext2._totalFiles   || total || 1
      setIdxPct(Math.min(100, Math.round(total / target * 100)))
      if (!shadowContext2.isIndexing) {
        clearInterval(id)
        setR2FileCount(shadowContext2._fileIndex?.length || 0)
        setPhase('ready')
      }
    }, 800)
    return () => clearInterval(id)
  }, [phase])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function addFeed(target, text, kind = 'info') {
    const entry = { id: Date.now() + Math.random(), text, kind, time: ts() }
    if (target === 'logik2') {
      setLogik2Feed(f => [entry, ...f].slice(0, FEED_MAX))
    } else {
      setLogikFeed(f => [entry, ...f].slice(0, FEED_MAX))
    }
  }

  const handleUrlPaste = useCallback(e => {
    const raw = e.clipboardData?.getData('text') || e.target.value
    const parsed = parseGitHubUrl(raw)
    if (parsed) {
      setR2Owner(parsed.owner)
      setR2Repo(parsed.repo)
      if (parsed.branch) setR2Branch(parsed.branch)
      e.target.value = ''
      e.preventDefault?.()
    }
  }, [])

  const handleConnect = useCallback(async () => {
    if (!r2Owner || !r2Repo) { setAttachErr('Owner and repo are required'); return }
    if (!mainRepo?.token)    { setAttachErr('Primary repo token is required — configure it in Settings'); return }
    setAttachErr(null)
    setPhase('indexing')
    setIdxStatus('Validating…')
    setIdxPct(5)

    const tok = r2Token || mainRepo.token
    const { valid, error } = await validateRepo(tok, r2Owner, r2Repo, r2Branch || 'main')
    if (!valid) {
      setAttachErr(`Cannot access repo: ${error}`)
      setPhase('entering')
      return
    }

    setIdxStatus('Indexing repository…')
    shadowContext2.startIndexing(tok, r2Owner, r2Repo, r2Branch || 'main', () => {
      setIdxStatus(shadowContext2.statusSummary?.() || '')
    })
  }, [r2Owner, r2Repo, r2Branch, r2Token, mainRepo])

  const handleDetach = useCallback(() => {
    if (cycleState === 'running') return // safety
    shadowContext2.stop?.()
    setPhase('idle')
    setCycleState('idle')
    setCycleCount(0)
    setCycleStep(0)
    setCycleLog([])
    setLogikFeed([])
    setLogik2Feed([])
    setR2Owner(''); setR2Repo(''); setR2Branch('main'); setR2Token('')
    setIdxPct(0); setIdxStatus('')
  }, [cycleState])

  const handleBeginCycle = useCallback(() => {
    if (!mainRepo?.token || !mainRepo?.owner || !mainRepo?.repo) {
      addFeed('logik', 'No primary repo configured — check Settings', 'error')
      return
    }
    pauseRef.current = false
    setPauseNext(false)
    setCycleState('running')
    setCycleCount(0)
    setCycleStep(0)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const repo2Config = { token: r2Token || mainRepo.token, owner: r2Owner, repo: r2Repo, branch: r2Branch || 'main' }

    runSelfImproveLoop(
      {
        mainRepo,
        repo2: repo2Config,
        modelConfig,
        webSearchApiKey,
        maxCycles: 100,
        signal: ctrl.signal,
      },
      {
        onStep: ({ cycle, step, phase, msg }) => {
          setCycleCount(cycle)
          setCycleStep(step)
          setCyclePhase(phase)
          setCycleMsg(msg)
          const target = (step <= 7 && phase === 'A') ? 'logik2' : (step >= 8 ? 'logik' : 'logik')
          addFeed(target, `[Step ${step}] ${msg}`, 'step')
        },

        onEvent: e => {
          if (!e.type) return
          const target = e.phase === 'A' ? 'logik2' : 'logik'
          if (e.type === 'text_delta' && e.text?.trim()) {
            addFeed(target, e.text.trim().slice(0, 200), 'ai')
          } else if (e.type === 'tool_start') {
            addFeed(target, `⚙ ${e.tool_name}(${JSON.stringify(e.tool_input || {}).slice(0, 60)}…)`, 'tool')
          } else if (e.type === 'tool_done') {
            addFeed(target, `✓ ${e.tool_name}`, 'done')
          } else if (e.type === 'error') {
            addFeed(target, `✗ ${e.text}`, 'error')
          }
        },

        onLog: entry => {
          setCycleLog(prev => [...prev, entry])
          addFeed(entry.target, `✦ Enhancement: ${entry.description}`, 'enhancement')
        },

        onCloneProgress: info => {
          const target = info.phase === 'A' ? 'logik' : 'logik2'
          addFeed(target, info.msg, 'clone')
        },

        onCycleEnd: n => {
          addFeed('logik', `━━ Cycle ${n} complete ━━`, 'cycle')
          if (pauseRef.current) {
            setCycleState('paused')
          }
        },

        onAbortCheck: () => pauseRef.current || ctrl.signal.aborted,
      },
    ).then(() => {
      if (!ctrl.signal.aborted) {
        setCycleState('idle')
        addFeed('logik', 'Self-improvement loop completed.', 'done')
      }
    }).catch(e => {
      if (!ctrl.signal.aborted) {
        setCycleState('idle')
        addFeed('logik', `Loop error: ${e.message}`, 'error')
      }
    })
  }, [mainRepo, modelConfig, webSearchApiKey, r2Owner, r2Repo, r2Branch, r2Token])

  const handlePause = useCallback(() => {
    pauseRef.current = true
    setPauseNext(true)
    addFeed('logik', '⏸ Pause requested — will stop after current step', 'info')
  }, [])

  const handleResume = useCallback(() => {
    pauseRef.current = false
    setPauseNext(false)
    setCycleState('running')
    addFeed('logik', '▶ Resumed', 'info')
    // Re-trigger the loop from where we left off — re-call handleBeginCycle
    // which will start a new loop from the next cycle
    handleBeginCycle()
  }, [handleBeginCycle])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setCycleState('idle')
    addFeed('logik', '⏹ Stopped', 'info')
  }, [])

  // ── Feed item renderer ────────────────────────────────────────────────────

  function FeedItem({ item }) {
    const cls = {
      ai:          'lk-si-feed-ai',
      step:        'lk-si-feed-step',
      tool:        'lk-si-feed-tool',
      done:        'lk-si-feed-done',
      error:       'lk-si-feed-error',
      clone:       'lk-si-feed-clone',
      enhancement: 'lk-si-feed-enhancement',
      cycle:       'lk-si-feed-cycle',
      info:        'lk-si-feed-info',
    }[item.kind] || ''
    return (
      <div className={`lk-si-feed-item ${cls}`}>
        <span className="lk-si-feed-time">{item.time}</span>
        <span className="lk-si-feed-text">{item.text}</span>
      </div>
    )
  }

  function FeedPane({ title, feed, repo }) {
    return (
      <div className="lk-si-pane">
        <div className="lk-si-pane-hd">
          <span className="lk-si-pane-title">{title}</span>
          <span className="lk-si-pane-repo">{repo}</span>
        </div>
        <div className="lk-si-pane-feed">
          {feed.length === 0
            ? <div className="lk-si-pane-empty">Waiting for activity…</div>
            : feed.map(item => <FeedItem key={item.id} item={item} />)
          }
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // ── idle ──────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="lk-si-page lk-si-idle">
        <div className="lk-si-idle-icon">⟳</div>
        <div className="lk-si-idle-title">Self-Improve</div>
        <div className="lk-si-idle-desc">
          Attach a second Logik repository and start an autonomous improvement cycle.<br />
          Each cycle identifies and implements one enhancement per repository, then syncs both.
        </div>
        <button className="lk-btn lk-si-attach-btn" onClick={() => setPhase('entering')}>
          Attach Second Repository
        </button>
      </div>
    )
  }

  // ── entering ──────────────────────────────────────────────────────────────
  if (phase === 'entering') {
    return (
      <div className="lk-si-page lk-si-entering">
        <div className="lk-si-form-hd">
          <button className="lk-btn lk-btn--small lk-si-back-btn" onClick={() => setPhase('idle')}>← Back</button>
          <span className="lk-si-form-title">Attach Second Repository</span>
        </div>

        <div className="lk-si-form-body">
          <input
            className="lk-input lk-si-url-input"
            placeholder="Paste a GitHub URL to auto-fill  (e.g. github.com/owner/repo)"
            onPaste={handleUrlPaste}
            onChange={e => { const p = parseGitHubUrl(e.target.value); if (p) { setR2Owner(p.owner); setR2Repo(p.repo); if (p.branch) setR2Branch(p.branch); e.target.value = '' } }}
          />
          <div className="lk-si-form-row">
            <input className="lk-input" placeholder="owner" value={r2Owner}  onChange={e => setR2Owner(e.target.value.trim())} />
            <span className="lk-si-sep">/</span>
            <input className="lk-input" placeholder="repo"  value={r2Repo}   onChange={e => setR2Repo(e.target.value.trim())} />
            <input className="lk-input lk-si-branch-input" placeholder="branch (main)" value={r2Branch} onChange={e => setR2Branch(e.target.value.trim())} />
          </div>
          <input
            className="lk-input"
            type="password"
            placeholder="GitHub token (optional — reuses primary token if blank)"
            value={r2Token}
            onChange={e => setR2Token(e.target.value)}
            autoComplete="off"
          />
          {attachErr && <div className="lk-si-attach-err">✗ {attachErr}</div>}
          <button
            className="lk-btn lk-si-connect-btn"
            disabled={!r2Owner || !r2Repo}
            onClick={handleConnect}
          >
            Connect & Index
          </button>
        </div>
      </div>
    )
  }

  // ── indexing ──────────────────────────────────────────────────────────────
  if (phase === 'indexing') {
    return (
      <div className="lk-si-page lk-si-indexing">
        <div className="lk-si-idx-icon">◈</div>
        <div className="lk-si-idx-title">Indexing {r2Owner}/{r2Repo}</div>
        <div className="lk-si-progress-wrap">
          <div className="lk-si-progress-bar" style={{ width: `${idxPct}%` }} />
        </div>
        <div className="lk-si-idx-status">{idxStatus || 'Connecting…'}</div>
        <button className="lk-btn lk-btn--small" onClick={() => { shadowContext2.stop?.(); setPhase('idle') }}>Cancel</button>
      </div>
    )
  }

  // ── ready ─────────────────────────────────────────────────────────────────
  if (phase === 'ready' && cycleState === 'idle') {
    const mainLabel  = mainRepo?.owner && mainRepo?.repo ? `${mainRepo.owner}/${mainRepo.repo}` : 'logik'
    const repo2Label = `${r2Owner}/${r2Repo}`

    return (
      <div className="lk-si-page lk-si-split-page">
        {/* ── Split screen ── */}
        <div className="lk-si-split">
          {/* Left: logik */}
          <div className="lk-si-pane lk-si-pane--left">
            <div className="lk-si-pane-hd">
              <span className="lk-si-pane-title">logik</span>
              <span className="lk-si-pane-repo">{mainLabel}</span>
            </div>
            <div className="lk-si-pane-info">
              <div className="lk-si-pane-row"><span>Branch</span><strong>{mainRepo?.branch || 'main'}</strong></div>
              <div className="lk-si-pane-row"><span>Files indexed</span><strong>{shadowContext._fileIndex?.length || '—'}</strong></div>
              <div className="lk-si-pane-row"><span>Framework</span><strong>{shadowContext.getConventions?.()?.framework || 'unknown'}</strong></div>
            </div>
          </div>

          {/* Center: begin button */}
          <div className="lk-si-center-strip">
            <div className="lk-si-vs">VS</div>
            <button className="lk-btn lk-si-begin-btn" onClick={handleBeginCycle}>
              Begin Self-Improvement Cycle
            </button>
            <button className="lk-btn lk-btn--small lk-si-detach-btn" onClick={handleDetach}>
              Detach {r2Owner}/{r2Repo}
            </button>
          </div>

          {/* Right: logik2 */}
          <div className="lk-si-pane lk-si-pane--right">
            <div className="lk-si-pane-hd">
              <span className="lk-si-pane-title">logik2</span>
              <span className="lk-si-pane-repo">{repo2Label}</span>
            </div>
            <div className="lk-si-pane-info">
              <div className="lk-si-pane-row"><span>Branch</span><strong>{r2Branch || 'main'}</strong></div>
              <div className="lk-si-pane-row"><span>Files indexed</span><strong>{r2FileCount ?? shadowContext2._fileIndex?.length ?? '—'}</strong></div>
              <div className="lk-si-pane-row"><span>Framework</span><strong>{shadowContext2.getConventions?.()?.framework || 'unknown'}</strong></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── running / paused ──────────────────────────────────────────────────────
  const mainLabel2  = mainRepo?.owner && mainRepo?.repo ? `${mainRepo.owner}/${mainRepo.repo}` : 'logik'
  const repo2Label2 = `${r2Owner}/${r2Repo}`
  const stepLabel   = STEP_LABELS[cyclePhase]?.[cycleStep] || cycleMsg

  return (
    <div className="lk-si-page lk-si-split-page">
      {/* ── Top cycle bar ── */}
      <div className="lk-si-cycle-bar">
        <div className="lk-si-cycle-info">
          <span className={`lk-si-cycle-dot lk-si-cycle-dot--${cycleState}`} />
          <span className="lk-si-cycle-label">
            {cycleState === 'paused' ? 'Paused' : cycleState === 'stopping' ? 'Stopping…' : 'Active'}
          </span>
          <span className="lk-si-cycle-num">Cycle {cycleCount}</span>
          <span className="lk-si-cycle-step">Step {cycleStep}/14</span>
          <span className="lk-si-cycle-phase">Phase {cyclePhase}</span>
        </div>
        <div className="lk-si-cycle-msg">{stepLabel}</div>
        <div className="lk-si-cycle-actions">
          {cycleState === 'paused' ? (
            <>
              <button className="lk-btn lk-btn--small" onClick={handleResume}>▶ Resume</button>
              <button className="lk-btn lk-btn--small lk-btn--danger" onClick={handleStop}>⏹ Stop</button>
            </>
          ) : (
            <>
              <button className="lk-btn lk-btn--small" onClick={handlePause} disabled={pauseNext}>
                {pauseNext ? '⏸ Pausing…' : '⏸ Pause After Step'}
              </button>
              <button className="lk-btn lk-btn--small lk-btn--danger" onClick={handleStop}>⏹ Stop</button>
            </>
          )}
        </div>
      </div>

      {/* ── Step progress bar ── */}
      <div className="lk-si-step-bar">
        {Array.from({ length: 14 }, (_, i) => (
          <div
            key={i}
            className={`lk-si-step-seg${
              i + 1 < cycleStep ? ' lk-si-step-seg--done' :
              i + 1 === cycleStep ? ' lk-si-step-seg--active' : ''
            }`}
            title={STEP_LABELS[i < 7 ? 'A' : 'B']?.[i + 1] || `Step ${i + 1}`}
          />
        ))}
      </div>

      {/* ── Split feeds ── */}
      <div className="lk-si-split lk-si-split--running">
        <FeedPane title="logik" repo={mainLabel2} feed={logikFeed} />

        {/* Center: enhancement log */}
        <div className="lk-si-center-strip lk-si-center-strip--running">
          <div className="lk-si-log-hd">Enhancements</div>
          <div className="lk-si-log">
            {cycleLog.length === 0
              ? <div className="lk-si-log-empty">None yet</div>
              : [...cycleLog].reverse().map((entry, i) => (
                <div key={i} className={`lk-si-log-entry lk-si-log-entry--${entry.target}`}>
                  <span className="lk-si-log-cycle">#{entry.cycle}</span>
                  <span className="lk-si-log-target">{entry.target}</span>
                  <span className="lk-si-log-desc">{entry.description}</span>
                </div>
              ))
            }
          </div>
        </div>

        <FeedPane title="logik2" repo={repo2Label2} feed={logik2Feed} />
      </div>
    </div>
  )
}
