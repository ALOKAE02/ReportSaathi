import { useEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import { PhoneChat } from './components/PhoneChat'
import { ReportPicker } from './components/ReportPicker'
import { SafetyTrace } from './components/SafetyTrace'
import { TopNav } from './components/TopNav'
import { useNow, useSnap, useStore } from './state/AppContext'

function Toasts() {
  const { state } = useSnap()
  const now = useNow()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {state.toasts.filter((t) => now - t.ts < 9000).map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>
      ))}
    </div>
  )
}

function PresenterTools() {
  const store = useStore()
  const { state, ui } = useSnap()
  if (!ui.tools) return null
  return (
    <aside className="tools" aria-label="Presenter tools (hidden)">
      <strong>Presenter tools</strong> <small>T to hide</small>
      <button className={state.devInject ? 'on' : ''} onClick={() => store.toggleInject()}>
        {state.devInject ? 'Unsafe message ARMED (next message)' : 'Inject unsafe message'}
      </button>
      <button onClick={() => store.fastForward('risk')}>Fast-forward SLA to “At risk”</button>
      <button onClick={() => store.fastForward('breach')}>Fast-forward SLA to “Breached”</button>
      <button onClick={() => store.amendReport()}>Amend sent report (correction)</button>
      <button onClick={() => store.pickReport('incomplete')}>Load incomplete report (goes to a human)</button>
    </aside>
  )
}

export default function App() {
  const store = useStore()
  const { ui } = useSnap()

  useEffect(() => {
    const t = setInterval(() => store.tick(), 1000)
    return () => clearInterval(t)
  }, [store])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') return
      if (el.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key.toLowerCase()) {
        case '1': return void store.pickReport('normal')
        case '2': return void store.pickReport('abnormal')
        case '3': return void store.pickReport('critical')
        case 'd': return store.openTab('dashboard')
        case 'p': return store.openTab('patient')
        case 'r': return store.reset()
        case 't': return store.setUi({ tools: !store.snap.ui.tools })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  return (
    <div className={ui.presentation ? 'app present' : 'app'}>
      <div className="banner">Demo with fictional patients and data. Not medical advice.</div>
      <TopNav />
      {ui.tab === 'patient' ? (
        <div className="stage">
          <ReportPicker />
          <PhoneChat />
          <SafetyTrace />
        </div>
      ) : (
        <Dashboard />
      )}
      <Toasts />
      <PresenterTools />
    </div>
  )
}
