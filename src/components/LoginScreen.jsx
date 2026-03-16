import { useState } from 'react'

const VALID_USER = 'logik'
const VALID_PASS = 'admin'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (username === VALID_USER && password === VALID_PASS) {
      onLogin()
    } else {
      setError('Invalid username or password.')
    }
  }

  const inp = {
    display: 'block', width: '100%', padding: '0.55rem 0.75rem',
    marginBottom: '0.85rem', background: '#1e1e2a', border: '1px solid #3a3a52',
    color: '#e8e8f0', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0d14', fontFamily: "'EB Garamond', Georgia, serif" }}>
      <form onSubmit={handleSubmit} style={{ background: '#13131e', padding: '2.5rem 2.25rem', borderRadius: '10px', minWidth: '320px', border: '1px solid #2a2a3a', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <span style={{ fontSize: '1.6rem', color: '#a78bfa', fontFamily: "'Cormorant Upright', serif", letterSpacing: '0.15em' }}>◈ LOGIK</span>
          <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.4rem' }}>AI Coding Assistant</p>
        </div>
        <input style={inp} type="text"     placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" />
        <input style={inp} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '0.85rem' }}>{error}</p>}
        <button type="submit" style={{ width: '100%', padding: '0.6rem', background: '#6c5ce7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95rem', letterSpacing: '0.05em' }}>
          Login
        </button>
      </form>
    </div>
  )
}
