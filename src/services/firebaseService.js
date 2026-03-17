// ─── firebaseService ──────────────────────────────────────────────────────────
// Firebase initialisation and cloud storage features for LOGIK.
// Project: logik-89579

import { initializeApp, getApps } from 'firebase/app'

const FB_CONFIG_KEY = 'logik:firebase'

// ── Hardcoded project config ──────────────────────────────────────────────────
const DEFAULT_FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDvrUk8NGHI3H7LV02Y0bIyoku-WXEzhDE',
  authDomain:        'logik-89579.firebaseapp.com',
  projectId:         'logik-89579',
  storageBucket:     'logik-89579.firebasestorage.app',
  messagingSenderId: '940295059330',
  appId:             '1:940295059330:web:30d7b075de7ca9450c419b',
}

let _app     = null
let _db      = null
let _auth    = null
let _storage = null

// ── Config persistence ────────────────────────────────────────────────────────

export function loadFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FB_CONFIG_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_FIREBASE_CONFIG
  } catch {
    return DEFAULT_FIREBASE_CONFIG
  }
}

export function saveFirebaseConfig(config) {
  try { localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(config)) } catch {}
}

export function clearFirebaseConfig() {
  try {
    localStorage.removeItem(FB_CONFIG_KEY)
    _app = null; _db = null; _auth = null; _storage = null
  } catch {}
}

// ── Initialisation ────────────────────────────────────────────────────────────

export function initFirebaseSync(config = DEFAULT_FIREBASE_CONFIG) {
  if (!config?.apiKey || !config?.projectId) return null
  const existing = getApps().find(a => a.options.projectId === config.projectId)
  if (existing) { _app = existing; return _app }
  _app = initializeApp(config)
  saveFirebaseConfig(config)
  return _app
}

export async function initFirebase(config = DEFAULT_FIREBASE_CONFIG) {
  return initFirebaseSync(config)
}

export function getFirebaseApp() { return _app }

// ── Firestore ─────────────────────────────────────────────────────────────────

export async function getFirestore() {
  if (!_app) initFirebaseSync()
  if (!_db) {
    const { getFirestore: _getFS } = await import('firebase/firestore')
    _db = _getFS(_app)
  }
  return _db
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function getAuth() {
  if (!_app) initFirebaseSync()
  if (!_auth) {
    const { getAuth: _getAuth } = await import('firebase/auth')
    _auth = _getAuth(_app)
  }
  return _auth
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function getStorage() {
  if (!_app) initFirebaseSync()
  if (!_storage) {
    const { getStorage: _getStorage } = await import('firebase/storage')
    _storage = _getStorage(_app)
  }
  return _storage
}

// ── Status ────────────────────────────────────────────────────────────────────

export function getFirebaseStatus() {
  return {
    configured:  true,
    initialised: !!_app,
    projectId:   DEFAULT_FIREBASE_CONFIG.projectId,
  }
}

// ── Auto-init on module load ──────────────────────────────────────────────────
initFirebaseSync(loadFirebaseConfig())

