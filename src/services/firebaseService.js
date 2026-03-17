// ─── firebaseService ──────────────────────────────────────────────────────────
// Manages Firebase initialisation and cloud storage features.
// Config is stored in localStorage under 'logik:firebase' — paste your
// Firebase project config from the Firebase Console into the Settings panel.
//
// Setup:
//   1. Go to Firebase Console → Project Settings → Your apps → Web app
//   2. Copy the firebaseConfig object
//   3. Open LOGIK Settings → Firebase section → paste and Save
//   4. Optionally set VITE_AI_PROXY_URL to your Cloud Function URL for
//      server-side API key management

const FB_CONFIG_KEY = 'logik:firebase'

let _app  = null
let _db   = null
let _auth = null
let _storage = null

// ── Config persistence ────────────────────────────────────────────────────────

export function loadFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FB_CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveFirebaseConfig(config) {
  try {
    localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(config))
  } catch {}
}

export function clearFirebaseConfig() {
  try {
    localStorage.removeItem(FB_CONFIG_KEY)
    _app = null; _db = null; _auth = null; _storage = null
  } catch {}
}

// ── Initialisation ────────────────────────────────────────────────────────────

export async function initFirebase(config) {
  if (!config?.apiKey || !config?.projectId) {
    throw new Error('Invalid Firebase config — apiKey and projectId are required')
  }

  const { initializeApp, getApps } = await import('firebase/app')

  // Avoid re-initialising with the same config
  const existing = getApps().find(a => a.options.projectId === config.projectId)
  if (existing) { _app = existing; return _app }

  _app = initializeApp(config)
  saveFirebaseConfig(config)
  return _app
}

export function getFirebaseApp() { return _app }

// ── Firestore ─────────────────────────────────────────────────────────────────

export async function getFirestore() {
  if (!_app) throw new Error('Firebase not initialised — paste your config in Settings first')
  if (!_db) {
    const { getFirestore: _getFS } = await import('firebase/firestore')
    _db = _getFS(_app)
  }
  return _db
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function getAuth() {
  if (!_app) throw new Error('Firebase not initialised — paste your config in Settings first')
  if (!_auth) {
    const { getAuth: _getAuth } = await import('firebase/auth')
    _auth = _getAuth(_app)
  }
  return _auth
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function getStorage() {
  if (!_app) throw new Error('Firebase not initialised — paste your config in Settings first')
  if (!_storage) {
    const { getStorage: _getStorage } = await import('firebase/storage')
    _storage = _getStorage(_app)
  }
  return _storage
}

// ── Status ────────────────────────────────────────────────────────────────────

export function getFirebaseStatus() {
  const config = loadFirebaseConfig()
  return {
    configured: !!config?.apiKey,
    initialised: !!_app,
    projectId: config?.projectId || null,
  }
}

// Auto-init on load if config exists in localStorage
const _savedConfig = loadFirebaseConfig()
if (_savedConfig?.apiKey) {
  initFirebase(_savedConfig).catch(() => {})
}
