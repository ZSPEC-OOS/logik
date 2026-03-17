import { useState, useEffect, useRef, useCallback } from 'react'
import LoginScreen from './components/LoginScreen'
import Logik from './components/Logik'
import { loadModels, saveModels } from './services/aiService'
import {
  onAuthStateChange,
  signOutUser,
  loadUserSettings,
  saveUserSettings,
} from './services/firebaseService'

// ── Populate localStorage + sessionStorage from cloud settings ────────────────
// Called after a successful login so that Logik's loadSettings() reads
// the cloud-persisted values on first render.
function injectCloudSettings(settings) {
  if (!settings) return
  try {
    const SETTINGS_KEY    = 'logik:settings'
    const GHTOKEN_SS_KEY  = 'logik:ghtoken'
    const GHTOKEN2_SS_KEY = 'logik:ghtoken2'
    const SEARCH_KEY_SS   = 'logik:searchkey'

    // Non-sensitive settings → localStorage
    const {
      githubToken, repo2Token, webSearchApiKey, models,
      _v, _ts,
      ...rest
    } = settings

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest))

    // Sensitive tokens → sessionStorage
    if (githubToken  !== undefined) sessionStorage.setItem(GHTOKEN_SS_KEY,  githubToken  || '')
    if (repo2Token   !== undefined) sessionStorage.setItem(GHTOKEN2_SS_KEY, repo2Token   || '')
    if (webSearchApiKey !== undefined) sessionStorage.setItem(SEARCH_KEY_SS, webSearchApiKey || '')

    // Models (with API keys) → aiService storage
    if (Array.isArray(models) && models.length > 0) {
      saveModels(models)
    }
  } catch (err) {
    console.warn('[Logik] injectCloudSettings failed:', err.message)
  }
}

export default function App() {
  // authChecked: false until Firebase resolves the initial auth state
  const [authChecked,  setAuthChecked]  = useState(false)
  const [authUser,     setAuthUser]     = useState(null)
  // settingsReady: true once we've loaded (or confirmed absence of) cloud settings
  const [settingsReady, setSettingsReady] = useState(false)

  const [models,          setModels]          = useState(loadModels)
  const [selectedModelId, setSelectedModelId] = useState(() => loadModels()[0]?.id || '')

  // Debounce ref for cloud saves — avoids a Firestore write on every keystroke
  const saveTimerRef = useRef(null)

  // Latest full settings snapshot, kept in a ref so the save callback is stable
  const pendingSettingsRef = useRef(null)

  // ── Firebase auth listener ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChange(async (user) => {
      if (user) {
        // Load cloud settings and hydrate localStorage before rendering Logik
        const cloud = await loadUserSettings(user.uid)
        if (cloud) {
          injectCloudSettings(cloud)
          // Reload models from storage (now populated from cloud)
          const freshModels = loadModels()
          setModels(freshModels)
          setSelectedModelId(freshModels[0]?.id || '')
        }
        setAuthUser(user)
        setSettingsReady(true)
      } else {
        setAuthUser(null)
        setSettingsReady(false)
      }
      setAuthChecked(true)
    })
    return unsub
  }, [])

  // ── Debounced cloud save ───────────────────────────────────────────────────
  const scheduleCloudSave = useCallback((uid, settings) => {
    pendingSettingsRef.current = settings
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (pendingSettingsRef.current)
        saveUserSettings(uid, pendingSettingsRef.current)
    }, 1500)   // save 1.5s after the last change
  }, [])

  // ── Handle settings changes from Logik ────────────────────────────────────
  // Logik calls this whenever any setting changes (github tokens, theme, etc.)
  const handleSettingsChanged = useCallback((settings) => {
    if (!authUser) return
    scheduleCloudSave(authUser.uid, { ...settings, models })
  }, [authUser, models, scheduleCloudSave])

  // ── Handle model changes from LogikSettings ───────────────────────────────
  // Wrap setModels so model/key changes also sync to Firestore
  const handleSetModels = useCallback((updated) => {
    setModels(updated)
    if (!authUser) return
    scheduleCloudSave(authUser.uid, { ...pendingSettingsRef.current, models: updated })
  }, [authUser, scheduleCloudSave])

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      // Flush any pending save before signing out
      if (pendingSettingsRef.current && authUser)
        await saveUserSettings(authUser.uid, { ...pendingSettingsRef.current, models })
    }
    await signOutUser()
    // Clear local session data
    try {
      sessionStorage.removeItem('logik:ghtoken')
      sessionStorage.removeItem('logik:ghtoken2')
      sessionStorage.removeItem('logik:searchkey')
      sessionStorage.removeItem('wrkflow:keys')
    } catch {}
    setAuthUser(null)
    setSettingsReady(false)
    setModels(loadModels)
  }, [authUser, models])

  // ── Render ────────────────────────────────────────────────────────────────
  // While Firebase is resolving the initial auth state, show a minimal spinner
  if (!authChecked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0d0d14', color: '#555',
        fontFamily: "'EB Garamond', Georgia, serif", fontSize: '1rem',
      }}>
        <span style={{ color: '#a78bfa', marginRight: '0.5rem' }}>◈</span>
        Loading…
      </div>
    )
  }

  if (!authUser) {
    return (
      <LoginScreen
        onLogin={(user) => {
          setAuthUser(user)
          setSettingsReady(true)
        }}
      />
    )
  }

  // Show spinner while cloud settings are being fetched on first login
  if (!settingsReady) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0d0d14', color: '#555',
        fontFamily: "'EB Garamond', Georgia, serif", fontSize: '1rem',
      }}>
        <span style={{ color: '#a78bfa', marginRight: '0.5rem' }}>◈</span>
        Loading your settings…
      </div>
    )
  }

  return (
    <Logik
      models={models}
      setModels={handleSetModels}
      selectedModelId={selectedModelId}
      onModelChange={(id) => setSelectedModelId(id)}
      onClose={() => {}}
      onSettingsChanged={handleSettingsChanged}
      onLogout={handleLogout}
      userEmail={authUser.email}
    />
  )
}
