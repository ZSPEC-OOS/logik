import { memo } from 'react'
import { highlightCode } from '../../utils/codeUtils.js'

// ─── LogikCodePane ────────────────────────────────────────────────────────────
// Renders the Generated Code tab, including the refinement bar.
const LogikCodePane = memo(function LogikCodePane({
  generatedCode,
  isGenerating,
  language,
  hasGithub,
  filePath,
  refinementPrompt,
  onRefinementChange,
  onRefine,
  onReset,
  turnCount,
}) {
  return (
    <div className="lk-output" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="lk-code-scroll" style={{ flex: 1 }}>
        {isGenerating && !generatedCode && (
          <div className="lk-generating"><span className="lk-spinner" /> Generating…</div>
        )}
        {generatedCode ? (
          <pre className="lk-pre">
            <code dangerouslySetInnerHTML={{ __html: highlightCode(generatedCode, language) }} />
          </pre>
        ) : !isGenerating ? (
          <div className="lk-placeholder">
            <div className="lk-placeholder-glyph">◈</div>
            <p className="lk-placeholder-title">Ready to generate</p>
            <p className="lk-placeholder-body">Enter a request and press <em>Send</em>, or press <kbd>Ctrl+Enter</kbd>.</p>
            {hasGithub && <p className="lk-placeholder-tip">LOGIK will automatically plan and generate across all relevant files.</p>}
          </div>
        ) : null}
      </div>

      {generatedCode && !isGenerating && (
        <div className="lk-refine-bar">
          {turnCount > 0 && (
            <span className="lk-turn-info">{turnCount} {turnCount === 1 ? 'turn' : 'turns'}</span>
          )}
          <input
            className="lk-input lk-refine-input"
            placeholder={`Refine: 'make it async', 'add error handling', 'add JSDoc'…`}
            value={refinementPrompt}
            onChange={e => onRefinementChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRefine() } }}
          />
          <button className="lk-btn lk-btn--refine" onClick={onRefine} disabled={!refinementPrompt.trim()}>
            ↺ Refine
          </button>
          <button className="lk-btn lk-btn--reset" onClick={onReset} title="Clear conversation and start over">
            ✕
          </button>
        </div>
      )}
    </div>
  )
})

export default LogikCodePane
