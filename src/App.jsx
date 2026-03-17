import { useState } from 'react'
import LoginScreen from './components/LoginScreen'
import Logik from './components/Logik'
import { loadModels } from './services/aiService'

const AUTH_KEY = 'logik:authed'

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === 'true')
  const [models, setModels] = useState(loadModels)
  const [selectedModelId, setSelectedModelId] = useState('')

  if (!authed) {
    return (
      <LoginScreen
        onLogin={() => {
          localStorage.setItem(AUTH_KEY, 'true')
          setAuthed(true)
        }}
      />
    )
  }

  return (
    <Logik
      models={models}
      setModels={setModels}
      selectedModelId={selectedModelId}
      onModelChange={(id) => setSelectedModelId(id)}
      onClose={() => {}}
    />
  )
}
