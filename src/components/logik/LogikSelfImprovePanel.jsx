// ─── LogikSelfImprovePanel ────────────────────────────────────────────────────
// Attaches two LOCAL repository folders and runs an autonomous improvement cycle.
// The two agents "discuss" improvements — each cycle one agent improves the other
// repo, then the roles swap.
//
// States:
//   idle    → folder picker cards, one per repo
//   ready   → both folders attached, ready to begin
//   running → 3-column split: Repo A activity | Discussion | Repo B activity
//   paused  → same as running but with paused controls

import { useState, useRef, useCallback } from 'react'
import { pickDirectory, countFiles }      from '../../services/localFileService'
import { runLocalSelfImproveLoop }        from '../../services/localSelfImproveService'

const FEED_MAX = 80

function ts() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LogikSelfImprovePanel({ mainRepo, modelConfig, webSearchApiKey }) {
  // ── Folder state ────────────────────────────────────────────────────────────
  const [handleA,    setHandleA]    = useState(null)   // FileSystemDirectoryHandle
  const [handleB,    setHandleB]    = useState(null)
  const [nameA,      setNameA]      = useState('')
  const [nameB,      setNameB]      = useState('')
  const [fileCountA, setFileCountA] = useState(null)
  const [fileCountB, setFileCountB] = useState(null)
  const [pickErrA,   setPickErrA]   = useState(null)
  const [pickErrB,   setPickErrB]   = useState(null)
  const [countingA,  setCountingA]  = useState(false)
  const [countingB,  setCountingB]  = useState(false)

  // ── Cycle state ─────────────────────────────────────────────────────────────
  const [running,    setRunning]    = useState(false)
  const [paused,     setPaused]     = useState(false)
  const [pauseNext,  setPauseNext]  = useState(false)
  const [cycleCount, setCycleCount] = useState(0)
  const [cyclePhase, setCyclePhase] = useState('A')
  const [cycleMsg,   setCycleMsg]   = useState('')

  // ── Activity feeds ──────────────────────────────────────────────────────────
  const [feedA,      setFeedA]      = useState([])   // Repo A agent activity
  const [feedB,      setFeedB]      = useState([])   // Repo B agent activity
  const [discussion, setDiscussion] = useState([])   // Enhancement announcements (chat)

  const abortRef   = useRef(null)
  const pauseRef   = useRef(false)

  const ready   = !!handleA && !!handleB
  const phase   = !running && !paused ? (ready ? 'ready' : 'idle') : (paused ? 'paused' : 'running')

  // ── Folder picker ────────────────────────────────────────────────────────────

  const pickFolder = useCallback(async slot => {
    const setErr   = slot === 'A' ? setPickErrA   : setPickErrB
    const setHnd   = slot === 'A' ? setHandleA    : setHandleB
    const setName  = slot === 'A' ? setNameA      : setNameB
    const setCnt   = slot === 'A' ? setFileCountA : setFileCountB
    const setCting = slot === 'A' ? setCountingA  : setCountingB

    setErr(null)
    try {
      const handle = await pickDirectory()
      setHnd(handle)
      setName(handle.name)
      setCnt(null)
      setCting(true)
      const n = await countFiles(handle)
      setCnt(n)
      setCting(false)
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message)
      setCting(false)
    }
  }, [])

  const detachFolder = useCallback(slot => {
    if (slot === 'A') { setHandleA(null); setNameA(''); setFileCountA(null); setPickErrA(null) }
    else              { setHandleB(null); setNameB(''); setFileCountB(null); setPickErrB(null) }
  }, [])

  // ── Feed helpers ─────────────────────────────────────────────────────────────

  function addFeedA(text, kind = 'info') {
    setFeedA(f => [{ id: Date.now() + Math.random(), text, kind, time: ts() }, ...f].slice(0, FEED_MAX))
  }
  function addFeedB(text, kind = 'info') {
    setFeedB(f => [{ id: Date.now() + Math.random(), text, kind, time: ts() }, ...f].slice(0, FEED_MAX))
  }
  function addDiscussion(side, text) {
    setDiscussion(d => [...d, { id: Date.now() + Math.random(), side, text, time: ts() }].slice(-60))
  }

  // ── Start / pause / stop ─────────────────────────────────────────────────────

  const handleBegin = useCallback(() => {
    if (!handleA || !handleB) return
    if (!modelConfig?.apiKey) {
      addFeedA('No API key configured — open Settings and add your Anthropic key', 'error')
      return
    }

    setFeedA([])
    setFeedB([])
    setDiscussion([])
    setCycleCount(0)
    setCyclePhase('A')
    setCycleMsg('')
    pauseRef.current = false
    setPauseNext(false)
    setRunning(true)
    setPaused(false)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    runLocalSelfImproveLoop(
      { handleA, handleB, nameA, nameB, modelConfig, maxCycles: 100, signal: ctrl.signal },
      {
        onStep: ({ cycle, phase, msg }) => {
          setCycleCount(cycle)
          setCyclePhase(phase)
          setCycleMsg(msg)
          const add = phase === 'A' ? addFeedB : addFeedA
          add(`[${phase}] ${msg}`, 'step')
        },

        onEvent: e => {
          // Phase A → agent is working in Repo B
          // Phase B → agent is working in Repo A
          const addFeed = e.phase === 'A' ? addFeedB : addFeedA
          if (e.type === 'text_delta') {
            // Don't flood feed with raw tokens — suppress
          } else if (e.type === 'tool_start') {
            const path = e.tool_input?.path ? ` · ${e.tool_input.path}` : ''
            addFeed(`⚙ ${e.tool_name}${path}`, 'tool')
          } else if (e.type === 'tool_done') {
            const path = e.tool_input?.path ? ` · ${e.tool_input.path}` : ''
            addFeed(`✓ ${e.tool_name}${path}`, 'done')
          } else if (e.type === 'error') {
            addFeed(`✗ ${e.text}`, 'error')
          }
        },

        onLog: entry => {
          // Enhancement announcement → discussion column as chat bubble
          // Phase A improves Repo B → bubble on the right (B's side)
          // Phase B improves Repo A → bubble on the left (A's side)
          const side = entry.phase === 'A' ? 'B' : 'A'
          addDiscussion(side, entry.description)
          const addFeed = side === 'A' ? addFeedA : addFeedB
          addFeed(`✦ ${entry.description}`, 'enhancement')
        },

        onCycleEnd: n => {
          addFeedA(`━━ Cycle ${n} complete ━━`, 'cycle')
          if (pauseRef.current) setPaused(true)
        },

        onAbortCheck: () => pauseRef.current || ctrl.signal.aborted,
      },
    ).then(() => {
      if (!ctrl.signal.aborted) {
        setRunning(false)
        setPaused(false)
        addFeedA('Self-improvement loop completed.', 'done')
      }
    }).catch(e => {
      if (!ctrl.signal.aborted) {
        setRunning(false)
        setPaused(false)
        addFeedA(`Loop error: ${e.message}`, 'error')
      }
    })
  }, [handleA, handleB, nameA, nameB, modelConfig])

  const handlePause = useCallback(() => {
    pauseRef.current = true
    setPauseNext(true)
    addFeedA('⏸ Pause requested — will stop after this cycle', 'info')
  }, [])

  const handleResume = useCallback(() => {
    pauseRef.current = false
    setPauseNext(false)
    setPaused(false)
    setRunning(true)
    handleBegin()
  }, [handleBegin])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setRunning(false)
    setPaused(false)
    setPauseNext(false)
    addFeedA('⏹ Stopped', 'info')
  }, [])

  // ── Feed item ─────────────────────────────────────────────────────────────────

  function FeedItem({ item }) {
    const cls = {
      tool:        'lk-si-fi--tool',
      done:        'lk-si-fi--done',
      error:       'lk-si-fi--error',
      step:        'lk-si-fi--step',
      enhancement: 'lk-si-fi--enhancement',
      cycle:       'lk-si-fi--cycle',
      info:        'lk-si-fi--info',
    }[item.kind] || ''
    return (
      <div className={`lk-si-fi ${cls}`}>
        <span className="lk-si-fi-time">{item.time}</span>
        <span className="lk-si-fi-text">{item.text}</span>
      </div>
    )
  }

  // ── Folder card ───────────────────────────────────────────────────────────────

  function FolderCard({ slot, handle, name, fileCount, counting, err }) {
    const attached = !!handle
    return (
      <div className={`lk-si-folder-card${attached ? ' lk-si-folder-card--attached' : ''}`}>
        {attached ? (
          <>
            <div className="lk-si-folder-icon">📁</div>
            <div className="lk-si-folder-name">{name}</div>
            <div className="lk-si-folder-count">
              {counting ? 'counting…' : fileCount != null ? `${fileCount} files` : ''}
            </div>
            <div className="lk-si-folder-actions">
              <button
                className="lk-btn lk-btn--small"
                onClick={() => pickFolder(slot)}
                disabled={running}
                title="Change folder"
              >Change</button>
              <button
                className="lk-btn lk-btn--small lk-btn--danger"
                onClick={() => detachFolder(slot)}
                disabled={running}
              >Detach</button>
            </div>
          </>
        ) : (
          <>
            <div className="lk-si-folder-icon lk-si-folder-icon--empty">📂</div>
            <div className="lk-si-folder-label">Repo {slot}</div>
            <div className="lk-si-folder-hint">Select a local clone of any repository</div>
            {err && <div className="lk-si-folder-err">{err}</div>}
            <button
              className="lk-btn lk-si-pick-btn"
              onClick={() => pickFolder(slot)}
            >
              Choose Folder…
            </button>
          </>
        )}
      </div>
    )
  }

  // ── Render: idle / ready ──────────────────────────────────────────────────────

  if (!running && !paused) {
    return (
      <div className="lk-si-page">
        <div className="lk-si-header">
          <span className="lk-si-header-title">Self-Improve</span>
          <span className="lk-si-header-desc">
            Attach two local repository clones. The agents will take turns improving each other's code.
          </span>
        </div>

        <div className="lk-si-attach-grid">
          <FolderCard
            slot="A" handle={handleA} name={nameA}
            fileCount={fileCountA} counting={countingA} err={pickErrA}
          />

          <div className="lk-si-attach-center">
            {ready ? (
              <>
                <div className="lk-si-vs lk-si-vs--ready">⟳</div>
                <button className="lk-btn lk-si-begin-btn" onClick={handleBegin}>
                  Begin Self-Improvement
                </button>
              </>
            ) : (
              <div className="lk-si-vs">VS</div>
            )}
          </div>

          <FolderCard
            slot="B" handle={handleB} name={nameB}
            fileCount={fileCountB} counting={countingB} err={pickErrB}
          />
        </div>

        {ready && (
          <div className="lk-si-ready-note">
            Both repos attached. The agents will improve each other's code, cycle by cycle.
          </div>
        )}
      </div>
    )
  }

  // ── Render: running / paused ──────────────────────────────────────────────────

  return (
    <div className="lk-si-page lk-si-page--running">

      {/* Top bar */}
      <div className="lk-si-top-bar">
        <div className="lk-si-top-left">
          <span className={`lk-si-dot lk-si-dot--${paused ? 'paused' : 'running'}`} />
          <span className="lk-si-top-status">{paused ? 'Paused' : 'Running'}</span>
          <span className="lk-si-top-cycle">Cycle {cycleCount}</span>
          <span className="lk-si-top-phase">Phase {cyclePhase}</span>
        </div>
        <div className="lk-si-top-msg">{cycleMsg}</div>
        <div className="lk-si-top-actions">
          {paused ? (
            <>
              <button className="lk-btn lk-btn--small" onClick={handleResume}>▶ Resume</button>
              <button className="lk-btn lk-btn--small lk-btn--danger" onClick={handleStop}>⏹ Stop</button>
            </>
          ) : (
            <>
              <button className="lk-btn lk-btn--small" onClick={handlePause} disabled={pauseNext}>
                {pauseNext ? '⏸ Pausing…' : '⏸ Pause'}
              </button>
              <button className="lk-btn lk-btn--small lk-btn--danger" onClick={handleStop}>⏹ Stop</button>
            </>
          )}
        </div>
      </div>

      {/* 3-column split */}
      <div className="lk-si-split">

        {/* Repo A activity */}
        <div className="lk-si-pane">
          <div className="lk-si-pane-hd">
            <span className="lk-si-pane-label">Repo A</span>
            <span className="lk-si-pane-name">{nameA}</span>
          </div>
          <div className="lk-si-feed">
            {feedA.length === 0
              ? <div className="lk-si-feed-empty">Waiting…</div>
              : feedA.map(item => <FeedItem key={item.id} item={item} />)
            }
          </div>
        </div>

        {/* Discussion column */}
        <div className="lk-si-discussion">
          <div className="lk-si-discussion-hd">Discussion</div>
          <div className="lk-si-discussion-feed">
            {discussion.length === 0 ? (
              <div className="lk-si-discussion-empty">
                Enhancements will appear here as the agents work…
              </div>
            ) : (
              discussion.map(msg => (
                <div
                  key={msg.id}
                  className={`lk-si-bubble lk-si-bubble--${msg.side.toLowerCase()}`}
                >
                  <div className="lk-si-bubble-who">Repo {msg.side}</div>
                  <div className="lk-si-bubble-text">{msg.text}</div>
                  <div className="lk-si-bubble-time">{msg.time}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Repo B activity */}
        <div className="lk-si-pane">
          <div className="lk-si-pane-hd">
            <span className="lk-si-pane-label">Repo B</span>
            <span className="lk-si-pane-name">{nameB}</span>
          </div>
          <div className="lk-si-feed">
            {feedB.length === 0
              ? <div className="lk-si-feed-empty">Waiting…</div>
              : feedB.map(item => <FeedItem key={item.id} item={item} />)
            }
          </div>
        </div>

      </div>
    </div>
  )
}
