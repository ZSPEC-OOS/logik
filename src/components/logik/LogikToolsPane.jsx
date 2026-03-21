import { useState, memo } from 'react'
import LogikModularTools from './LogikModularTools'

// ─── LogikToolsPane ───────────────────────────────────────────────────────────
// Quick-access tool buttons (npm test / lint / build / git) + custom command input.
// Also hosts the Modular Tool System: drag-and-drop installer + tool registry.
const TOOL_BUTTONS = [
  { label: 'Run Tests',    cmd: 'npm test',              tool: 'test'       },
  { label: 'Run Linter',   cmd: 'npm run lint',          tool: 'lint'       },
  { label: 'Run Build',    cmd: 'npm run build',         tool: 'build'      },
  { label: 'Install Deps', cmd: 'npm install',           tool: 'install'    },
  { label: 'Git Status',   cmd: 'git status',            tool: 'git-status' },
  { label: 'Git Log',      cmd: 'git log --oneline -10', tool: 'git-log'    },
]

const LogikToolsPane = memo(function LogikToolsPane({
  bridgeAvailable,
  callExecBridge,
  onSetActiveTab,
}) {
  const [toolOutput,     setToolOutput]     = useState([])
  const [customCommand,  setCustomCommand]  = useState('')
  const [paneTab,        setPaneTab]        = useState('shell') // 'shell' | 'modules'

  async function runTool(cmd) {
    const ts = new Date().toISOString()
    if (bridgeAvailable) {
      setToolOutput(prev => [...prev, { tool: cmd.split(' ')[0], output: `▶ Running: ${cmd}…`, timestamp: ts }])
      const { stdout, stderr, exitCode } = await callExecBridge(cmd)
      const out = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join('\n') || '(no output)'
      setToolOutput(prev => prev.map((e, i) =>
        i === prev.length - 1 ? { ...e, output: out, exitCode } : e
      ))
    } else {
      setToolOutput(prev => [...prev, {
        tool: cmd.split(' ')[0], timestamp: ts,
        output: `ℹ Bridge offline — "${cmd}" will run when the exec bridge is available.\nStart via: npm run dev`,
      }])
    }
    onSetActiveTab?.('tools')
  }

  return (
    <div className="lk-output" style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Inner tab bar: Shell Commands vs. Modular Tools ─────────────────── */}
      <div className="lk-tools-pane-tabs">
        <button
          className={`lk-tools-pane-tab${paneTab === 'shell' ? ' lk-tools-pane-tab--active' : ''}`}
          onClick={() => setPaneTab('shell')}
        >
          Shell Commands
        </button>
        <button
          className={`lk-tools-pane-tab${paneTab === 'modules' ? ' lk-tools-pane-tab--active' : ''}`}
          onClick={() => setPaneTab('modules')}
        >
          ⊕ Tool Modules
        </button>
      </div>

      {paneTab === 'modules' ? (
        <LogikModularTools />
      ) : (
      <>
      <div className="lk-tools-controls">
        <div className="lk-tools-warn">
          {bridgeAvailable === true
            ? '🟢 Exec bridge active — tools run real commands on your machine'
            : bridgeAvailable === false
              ? '🔴 Exec bridge offline — start via `npm run dev` for real execution'
              : '⏳ Checking exec bridge…'}
        </div>
        <div className="lk-tools-buttons">
          {TOOL_BUTTONS.map(({ label, cmd, tool }) => (
            <button key={tool} className="lk-btn lk-btn--tool" onClick={() => runTool(cmd)}>
              {label}
            </button>
          ))}
        </div>
        <div className="lk-tools-custom">
          <input
            className="lk-input"
            placeholder="Custom command (e.g., npx tsc --noEmit)"
            value={customCommand}
            onChange={e => setCustomCommand(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && customCommand.trim()) {
                e.preventDefault()
                const cmd = customCommand.trim()
                setCustomCommand('')
                await runTool(cmd)
              }
            }}
          />
          <button
            className="lk-btn lk-btn--tool"
            disabled={!customCommand.trim()}
            onClick={async () => {
              const cmd = customCommand.trim()
              if (!cmd) return
              setCustomCommand('')
              await runTool(cmd)
            }}
          >
            Run
          </button>
          {toolOutput.length > 0 && (
            <button className="lk-btn lk-btn--small" onClick={() => setToolOutput([])}>Clear</button>
          )}
        </div>
      </div>

      <div className="lk-tools-output">
        {toolOutput.length === 0 ? (
          <div className="lk-tools-empty">Tool outputs will appear here.</div>
        ) : (
          toolOutput.map((entry, i) => (
            <div key={i} className="lk-tool-entry lk-tool-entry--shell">
              <div className="lk-tool-header">{entry.tool} - {entry.timestamp}</div>
              <pre className="lk-tool-output">{entry.output}</pre>
            </div>
          ))
        )}
      </div>
      </>
      )}
    </div>
  )
})

export default LogikToolsPane
