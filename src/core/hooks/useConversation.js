// ─── useConversation ──────────────────────────────────────────────────────────
// Manages multi-turn conversation state with localStorage persistence.
// Survives page reloads up to CONV_MAX_MESSAGES messages (10 turns).

import { useState, useEffect, useCallback } from 'react'
import { CONV_MAX_MESSAGES } from '../../config/constants.js'

const CONV_KEY = 'logik:conv'

function loadConversation() {
  try { return JSON.parse(localStorage.getItem(CONV_KEY)) || [] } catch { return [] }
}

function persistConversation(messages) {
  try { localStorage.setItem(CONV_KEY, JSON.stringify(messages.slice(-CONV_MAX_MESSAGES))) } catch {}
}

export function useConversation() {
  const [conversation, setConversation] = useState(loadConversation)
  const [turnCount,    setTurnCount]    = useState(0)

  // Debounce saves: only write to localStorage 500ms after the last update.
  useEffect(() => {
    const timer = setTimeout(() => persistConversation(conversation), 500)
    return () => clearTimeout(timer)
  }, [conversation])

  const addTurn = useCallback((userMsg, assistantMsg) => {
    setConversation(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: assistantMsg }])
    setTurnCount(t => t + 1)
  }, [])

  const reset = useCallback(() => {
    setConversation([])
    setTurnCount(0)
    try { localStorage.removeItem(CONV_KEY) } catch {}
  }, [])

  return { conversation, setConversation, turnCount, setTurnCount, addTurn, reset }
}
