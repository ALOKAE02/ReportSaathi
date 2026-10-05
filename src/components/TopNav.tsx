import { useSnap, useStore } from '../state/AppContext'

export function TopNav() {
  const store = useStore()
  const { state, ui } = useSnap()
  const unseen = state.cases.filter((c) => !c.seen).length

  return (
    <header className="topnav">
      <div className="brand">
        <span className="brand-mark">＋</span>
        <div>
          <strong>Report Companion</strong>
          <small>Demo Diagnostics Lab</small>
        </div>
      </div>
      <nav className="tabs" aria-label="Views">
        <button className={ui.tab === 'patient' ? 'tab active' : 'tab'} onClick={() => store.openTab('patient')}>
          Patient (WhatsApp)
        </button>
        <button className={ui.tab === 'dashboard' ? 'tab active' : 'tab'} onClick={() => store.openTab('dashboard')}>
          Clinical dashboard
          {unseen > 0 && <span className="badge" aria-label={`${unseen} new critical case`}>{unseen}</span>}
        </button>
      </nav>
      <div className="nav-actions">
        <button className="ghost" onClick={() => window.open(`${location.pathname}#dashboard`, '_blank')} title="Open the dashboard in a second window (synced live)">
          ↗ Dashboard window
        </button>
        <button className={state.lang === 'hi' ? 'ghost on' : 'ghost'} onClick={() => store.setLang(state.lang === 'hi' ? 'en' : 'hi')} aria-pressed={state.lang === 'hi'} title="Language of the three explanation messages. Hindi needs native-speaker review.">
          {state.lang === 'hi' ? 'हिन्दी · EN' : 'EN · हिन्दी'}
        </button>
        <button className={ui.presentation ? 'ghost on' : 'ghost'} onClick={() => store.setUi({ presentation: !ui.presentation })} aria-pressed={ui.presentation}>
          Presentation mode
        </button>
        <button className="ghost danger" onClick={() => store.reset()}>
          Reset demo <kbd>R</kbd>
        </button>
      </div>
    </header>
  )
}
