# AI Coding Assistant Interface Redesign (Presentation Layer Only)

## 1) Layout Analysis & Optimization

### Workflow friction points found
- **Top bar over-customization**: header alignment controls and micro-positioning increased configuration overhead without improving coding throughput.
- **Model/settings spread across multiple controls**: key controls competed for top-level visibility and reduced editor focus.
- **Conversation context visibility was secondary**: conversation needed separate toggles and appeared disconnected from code output.
- **Mobile density and reachability**: critical context and code surfaces competed in limited viewport height.

### Desktop layout proposal (implemented)
- **Editor-first split workspace**:
  - Left: primary code/AI output feed.
  - Right: persistent context pane (conversation + project state).
- **Focused top bar**:
  - Brand and active-file metadata.
  - Plan/Code mode switch.
  - Single contextual menu for model + settings + sharing action.
- **Reduced persistent chrome**:
  - Non-essential sidebar buttons removed.

### Desktop wireframe (panel configuration)
```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ Top Bar: [Logo + Workspace Meta] [Plan|Code] [Turn/Status] [☰ Context Menu] │
├──────────────┬───────────────────────────────────────────────┬────────────────┤
│ Left Rail    │ Primary Workspace (Editor/AI Output Feed)     │ Context Pane   │
│ (Back/New/   │ - Plan cards / file tabs                      │ - Conversation │
│ Chat/Status) │ - Syntax-highlighted code output              │ - Repo status  │
│              │ - Diff/test/run modules as needed             │ - Active file  │
├──────────────┴───────────────────────────────────────────────┴────────────────┤
│ Input Bar: Prompt + shortcuts + attach/modules + push/send/testing actions   │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Mobile (iPhone) layout proposal (implemented)
- **Two-pane toggle** above input bar:
  - `Editor` pane for code/AI output.
  - `Context` pane for conversation/project state.
- **Touch-friendly controls**:
  - Larger toggle buttons and menu actions.
  - Collapsed secondary metadata on small viewports.

### Mobile flow wireframe
```text
┌───────────────────────────────────────────┐
│ Top Bar: Logo + Meta + Plan/Code + Menu  │
├───────────────────────────────────────────┤
│ [Editor] [Context]                        │
├───────────────────────────────────────────┤
│ Active pane content                       │
│ - Editor: code + AI response              │
│ - Context: chat thread + project snapshot │
├───────────────────────────────────────────┤
│ Prompt input + primary actions            │
└───────────────────────────────────────────┘
```

---

## 2) Component Audit Matrix (Kept / Removed / Relocated)

| Component / Element | Status | Rationale |
|---|---|---|
| Code output pane | **Kept** | Core editor↔AI loop surface. |
| Prompt input bar and send/push actions | **Kept** | Primary productivity action lane. |
| Plan/Code toggle | **Kept** | Critical workflow mode selector. |
| Header alignment toolbar controls | **Removed** | Non-essential for coding workflows; adds UI noise. |
| Top-level model selector | **Relocated** | Moved into contextual menu to declutter main chrome. |
| Settings access | **Relocated** | Moved into contextual menu for progressive disclosure. |
| Share/export action | **Relocated** | Added as contextual “Copy conversation” action. |
| History shortcut in sidebar | **Relocated** | Available via contextual menu. |
| Persistent context visibility | **Expanded** | Added right context pane (desktop), toggle pane (mobile). |

---

## 3) Interaction Specifications (Critical Workflows)

### A. Prompt → Code iteration
1. User enters prompt in bottom bar.
2. Send runs generation/agent flow (existing logic unchanged).
3. Primary workspace updates with code output and plan cards.
4. Context pane updates with conversation and project state.

### B. Context switching across files/conversation
1. User clicks plan cards/file tabs in primary workspace.
2. Active file updates in metadata and context pane.
3. Conversation remains visible in dedicated pane for quick reference.

### C. Settings/model/share (progressive disclosure)
1. User opens top-right contextual menu.
2. Selects model, opens settings drawer, or copies conversation transcript.
3. Menu auto-closes after action.

### D. Mobile quick navigation
1. User taps `Editor` or `Context` pane toggle.
2. Content area swaps without backend calls.
3. Prompt/actions remain fixed in bottom bar for rapid iteration.

---

## 4) Interface-only Change Log (Zero Backend Impact)

### Changed
- Updated `Logik.jsx` UI structure to introduce:
  - contextual workspace menu,
  - editor/context split workspace,
  - mobile editor/context toggle.
- Updated `Logik.css` to style new desktop/mobile layout and contextual menu.
- Updated `LogikSettings.jsx` to remove header alignment slider controls.

### Not changed
- Backend services, API endpoints, model invocation logic, execution pipeline, file I/O logic, planner/agent internals, and GitHub flow logic.

### Functional parity statement
- Existing generation, planning, refinement, push/PR, testing, terminal, and tool workflows remain available.
- Changes are restricted to presentation and interaction surfaces.
