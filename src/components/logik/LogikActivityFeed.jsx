import { memo } from 'react'

// ─── LogikActivityFeed ────────────────────────────────────────────────────────
// Renders the live activity log panel — the Claude Code-style operation feed.
const LogikActivityFeed = memo(function LogikActivityFeed({
  activityLog,
  isAgentRunning,
  agentStreamText,
  isGenerating,
  isPushing,
  feedRef,
  onViewCode,
}) {
  return (
    <div className="lk-output lk-activity-output" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="lk-activity-feed" ref={feedRef}>
        {activityLog.length === 0 ? (
          <div className="lk-activity-empty">No activity yet — generate code to see live operations.</div>
        ) : (
          activityLog.map(entry => (
            <div key={entry.id} className={`lk-activity-line lk-activity-line--${entry.status} lk-activity-line--${entry.type}`}>
              <span className="lk-activity-icon">
                {entry.status === 'active'
                  ? <span className="lk-spinner" />
                  : entry.status === 'done'  ? '✓'
                  : entry.status === 'error' ? '✗'
                  : '·'}
              </span>
              <span className="lk-activity-body">
                <span className="lk-activity-msg">{entry.msg}</span>
                {entry.detail && <span className="lk-activity-detail">{entry.detail}</span>}
              </span>
            </div>
          ))
        )}

        {/* Live streaming agent narration */}
        {isAgentRunning && agentStreamText && (
          <div className="lk-activity-line lk-activity-line--active lk-activity-line--agent lk-activity-stream">
            <span className="lk-activity-icon"><span className="lk-spinner" /></span>
            <span className="lk-activity-body">
              <span className="lk-activity-msg">{agentStreamText}<span className="lk-stream-cursor">▋</span></span>
            </span>
          </div>
        )}

        {(isGenerating || isPushing) && (
          <div className="lk-activity-line lk-activity-line--active">
            <span className="lk-activity-icon"><span className="lk-spinner" /></span>
            <span className="lk-activity-body">
              <span className="lk-activity-msg">{isGenerating ? 'Generating…' : 'Pushing…'}</span>
            </span>
          </div>
        )}
      </div>

      {activityLog.length > 0 && (
        <div className="lk-activity-footer">
          <button className="lk-activity-view-code" onClick={onViewCode}>
            View Generated Code →
          </button>
        </div>
      )}
    </div>
  )
})

export default LogikActivityFeed
